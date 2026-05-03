"use client";

/** Load an HTMLImageElement from a dataUrl */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/**
 * Scales an image down so its largest dimension is ≤ maxDim.
 * Returns the original dataUrl unchanged if it is already small enough.
 * Keeping stickers at ≤ 400 px prevents IndexedDB quota errors caused
 * by storing full-resolution photos as base-64 data URLs.
 */
export async function resizeImage(dataUrl: string, maxDim = 400): Promise<string> {
  const img = await loadImage(dataUrl);
  const { naturalWidth: W, naturalHeight: H } = img;
  if (W <= maxDim && H <= maxDim) return dataUrl;
  const scale   = maxDim / Math.max(W, H);
  const canvas  = document.createElement("canvas");
  canvas.width  = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}


/**
 * Returns true if the image has any semi-transparent pixels
 * (i.e. it already has a cut-out / transparent background).
 */
export async function hasTransparency(dataUrl: string): Promise<boolean> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true; // found a transparent pixel
  }
  return false;
}

/**
 * Basic background removal using corner-seed flood fill.
 * Samples the 4 corner pixels → picks the most common colour →
 * flood-fills similar pixels from every corner, making them transparent.
 */
export async function removeBackground(
  dataUrl: string,
  tolerance = 40
): Promise<string> {
  const img = await loadImage(dataUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, W, H);
  const { data } = imageData;

  function idx(x: number, y: number) {
    return (y * W + x) * 4;
  }
  function similar(i: number, r: number, g: number, b: number) {
    return (
      Math.abs(data[i] - r) < tolerance &&
      Math.abs(data[i + 1] - g) < tolerance &&
      Math.abs(data[i + 2] - b) < tolerance &&
      data[i + 3] > 10
    );
  }

  // Collect corner colours
  const corners = [
    [0, 0],
    [W - 1, 0],
    [0, H - 1],
    [W - 1, H - 1],
  ];

  const visited = new Uint8Array(W * H);

  function floodFill(sx: number, sy: number, r: number, g: number, b: number) {
    const stack: [number, number][] = [[sx, sy]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const vi = cy * W + cx;
      if (visited[vi]) continue;
      const pi = vi * 4;
      if (!similar(pi, r, g, b)) continue;
      visited[vi] = 1;
      data[pi + 3] = 0; // make transparent
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  // Sample background color from corners (average of corner pixels before removal)
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [cx, cy] of corners) {
    const i = idx(cx, cy);
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2];
  }
  bgR = Math.round(bgR / corners.length);
  bgG = Math.round(bgG / corners.length);
  bgB = Math.round(bgB / corners.length);

  for (const [cx, cy] of corners) {
    const i = idx(cx, cy);
    floodFill(cx, cy, data[i], data[i + 1], data[i + 2]);
  }

  // Defringe: 3-pass border erosion to kill antialiased edge bleed
  for (let pass = 0; pass < 3; pass++) {
    const isBorder = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[idx(x, y) + 3] === 0) continue;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || data[idx(nx, ny) + 3] === 0) {
            isBorder[y * W + x] = 1;
            break;
          }
        }
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!isBorder[y * W + x]) continue;
        const pi = idx(x, y);
        const r = data[pi], g = data[pi + 1], b = data[pi + 2];
        // How different is this pixel from the background?
        const maxDiff = Math.max(Math.abs(r - bgR), Math.abs(g - bgG), Math.abs(b - bgB));
        if (maxDiff < tolerance * 1.2) {
          // Close to background color — fully transparent
          data[pi + 3] = 0;
        } else {
          // Partially blended — estimate foreground alpha from color distance
          const estimatedAlpha = Math.min(1, maxDiff / 100);
          data[pi + 3] = Math.round(data[pi + 3] * estimatedAlpha);
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Compress an image dataUrl to WebP (with JPEG fallback), targeting < targetKB.
 * Tries decreasing quality steps until the output fits within the budget.
 */
export async function compressImage(dataUrl: string, targetKB = 100): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);

  // base64 is ~4/3 of raw bytes, so target chars = targetKB * 1024 * 4/3
  const targetChars = targetKB * 1024 * 1.37;

  for (const q of [0.85, 0.75, 0.65, 0.50]) {
    const webp = canvas.toDataURL("image/webp", q);
    // Check if it's actually webp (some browsers fallback to png if they don't support webp)
    if (webp.startsWith("data:image/webp") && webp.length <= targetChars) return webp;
  }
  return canvas.toDataURL("image/png");
}

/**
 * Fast fingerprint for deduplication — cheap O(1) string sampling.
 */
export function srcFingerprint(src: string): string {
  return `${src.length}:${src.slice(0, 120)}`;
}

/**
 * Applies a thick white outline around the non-transparent parts of an image.
 * Uses the classic "draw in N directions" technique.
 */
export async function applyWhiteStroke(
  dataUrl: string,
  strokeSize = 7
): Promise<string> {
  if (strokeSize <= 0) return dataUrl;
  
  const img = await loadImage(dataUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const pad = strokeSize + 2;

  const canvas = document.createElement("canvas");
  canvas.width = W + pad * 2;
  canvas.height = H + pad * 2;
  const ctx = canvas.getContext("2d")!;

  // Step 1: draw image at 24 angles offset by strokeSize → all overlapping
  //         pixels form the "stroke region"
  const steps = 24;
  for (let s = 0; s < steps; s++) {
    const angle = (s / steps) * Math.PI * 2;
    const ox = Math.round(Math.cos(angle) * strokeSize);
    const oy = Math.round(Math.sin(angle) * strokeSize);
    ctx.drawImage(img, pad + ox, pad + oy);
  }

  // Step 2: colour every non-transparent pixel white
  const strokeData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = strokeData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(strokeData, 0, 0);

  // Step 3: draw the original image centred on top
  ctx.drawImage(img, pad, pad);

  return canvas.toDataURL("image/png");
}
