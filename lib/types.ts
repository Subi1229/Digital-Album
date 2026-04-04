export interface SlotImage {
  pageIndex: number;
  slotIndex: number;
  dataUrl: string;
  croppedAt: number;
}

export interface Sticker {
  id: string;
  pageIndex: number;
  dataUrl: string;
  x: number;       // relative to page (0–1)
  y: number;       // relative to page (0–1)
  width: number;   // px  (base size — rendering is done at this resolution)
  height: number;  // px
  rotation: number; // degrees
  scale?: number;   // visual scale multiplier (default 1.0) — stored so resize persists
}

export interface LibrarySticker {
  id: string;
  src: string;       // compressed dataUrl (webp/jpeg, target <100KB)
  createdAt: number;
}

export interface AlbumData {
  images: SlotImage[];
  stickers: Sticker[];
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PendingCrop {
  file: File;
  objectUrl: string;
  pageIndex: number;
  slotIndex: number;
  aspectRatio: number;
}
