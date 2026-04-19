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
  zIndex?: number;  // persistent layer order — higher = in front
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

export interface MoodboardImage {
  id: string;
  albumId: string;
  src: string;
  x: number;        // px — top-left of unrotated bounding box (page space)
  y: number;        // px — top-left of unrotated bounding box (page space)
  width: number;    // px
  height: number;   // px
  rotation: number; // degrees, rotates around image center
  zIndex: number;
  pageIndex?: number;
}

export interface MoodboardText {
  id: string;
  albumId: string;
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  color: string;
  rotation: number;
  zIndex: number;
}
