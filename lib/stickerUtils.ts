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

  for (const [cx, cy] of corners) {
    const i = idx(cx, cy);
    floodFill(cx, cy, data[i], data[i + 1], data[i + 2]);
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
    if (webp.startsWith("data:image/webp") && webp.length <= targetChars) return webp;
    const jpeg = canvas.toDataURL("image/jpeg", q);
    if (jpeg.length <= targetChars) return jpeg;
  }
  return canvas.toDataURL("image/jpeg", 0.50);
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
