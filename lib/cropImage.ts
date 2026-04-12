import { CropArea } from "./types";

export default async function getCroppedImg(
  imageSrc: string,
  pixelCrop: CropArea,
  outputWidth: number,
  outputHeight: number
): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("No 2d context");

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  // Fill white so any out-of-bounds area isn't black
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  // Clamp source rect to actual image bounds so we never sample outside the image
  const imgW = image.naturalWidth;
  const imgH = image.naturalHeight;
  const srcX = Math.max(0, pixelCrop.x);
  const srcY = Math.max(0, pixelCrop.y);
  const srcRight  = Math.min(imgW, pixelCrop.x + pixelCrop.width);
  const srcBottom = Math.min(imgH, pixelCrop.y + pixelCrop.height);
  const srcW = srcRight  - srcX;
  const srcH = srcBottom - srcY;

  if (srcW <= 0 || srcH <= 0) return canvas.toDataURL("image/jpeg", 0.92);

  // Map the clamped source rect proportionally onto the output canvas
  const scaleX = outputWidth  / pixelCrop.width;
  const scaleY = outputHeight / pixelCrop.height;
  const dstX = (srcX - pixelCrop.x) * scaleX;
  const dstY = (srcY - pixelCrop.y) * scaleY;
  const dstW = srcW * scaleX;
  const dstH = srcH * scaleY;

  ctx.drawImage(image, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}
