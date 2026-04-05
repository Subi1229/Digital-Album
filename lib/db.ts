"use client";

import { openDB, DBSchema, IDBPDatabase } from "idb";
import { SlotImage, Sticker, LibrarySticker } from "./types";

type StoredImage = SlotImage & { id: string };
type StoredSticker = Sticker & { albumId?: string };

const DEFAULT_ALBUM_ID = "album-1";
let activeAlbumId = DEFAULT_ALBUM_ID;

function normalizeAlbumId(albumId: string | null | undefined): string {
  const cleaned = (albumId ?? "").trim();
  if (!cleaned || cleaned === "default") return DEFAULT_ALBUM_ID;
  if (cleaned === "all-albums" || cleaned === "favourite-album") return DEFAULT_ALBUM_ID;
  return cleaned;
}

function imageKey(albumId: string, pageIndex: number, slotIndex: number): string {
  return `${albumId}:${pageIndex}-${slotIndex}`;
}

function parseImageId(id: string): { albumId: string; pageIndex: number; slotIndex: number } | null {
  if (!id) return null;

  if (id.includes(":")) {
    const [albumPart, slotPart] = id.split(":", 2);
    const m = /^(\d+)-(\d+)$/.exec(slotPart ?? "");
    if (!m) return null;
    return {
      albumId: normalizeAlbumId(albumPart),
      pageIndex: Number(m[1]),
      slotIndex: Number(m[2]),
    };
  }

  const legacy = /^(\d+)-(\d+)$/.exec(id);
  if (!legacy) return null;
  return {
    albumId: DEFAULT_ALBUM_ID,
    pageIndex: Number(legacy[1]),
    slotIndex: Number(legacy[2]),
  };
}

export function setActiveAlbumId(albumId: string): void {
  activeAlbumId = normalizeAlbumId(albumId);
}

export function getActiveAlbumId(): string {
  return activeAlbumId;
}

interface AlbumDB extends DBSchema {
  images: { key: string; value: StoredImage };
  stickers: { key: string; value: StoredSticker };
  libraryStickers: { key: string; value: LibrarySticker };
}

let dbPromise: Promise<IDBPDatabase<AlbumDB>> | null = null;

function getDB(): Promise<IDBPDatabase<AlbumDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AlbumDB>("digital-photo-album", 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("images", { keyPath: "id" });
          db.createObjectStore("stickers", { keyPath: "id" });
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("libraryStickers")) {
            db.createObjectStore("libraryStickers", { keyPath: "id" });
          }
        }
      },
    });
  }
  return dbPromise;
}

// â”€â”€ Images â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveImage(slot: SlotImage): Promise<void> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  const id = imageKey(albumId, slot.pageIndex, slot.slotIndex);
  await db.put("images", { ...slot, id });
  if (albumId === DEFAULT_ALBUM_ID) {
    await db.delete("images", `${slot.pageIndex}-${slot.slotIndex}`);
  }
}
export async function getAllImages(): Promise<SlotImage[]> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  const all = await db.getAll("images");
  return all.flatMap((img) => {
    const parsed = parseImageId(img.id);
    if (!parsed || parsed.albumId !== albumId) return [];
    return [{
      pageIndex: parsed.pageIndex,
      slotIndex: parsed.slotIndex,
      dataUrl: img.dataUrl,
      croppedAt: img.croppedAt,
    }];
  });
}
export async function getAlbumFirstSlotImage(albumId: string): Promise<string | null> {
  const db = await getDB();
  const normalizedAlbumId = normalizeAlbumId(albumId);
  const firstSlotKey = imageKey(normalizedAlbumId, 0, 0);

  const modern = await db.get("images", firstSlotKey);
  if (modern?.dataUrl) return modern.dataUrl;

  if (normalizedAlbumId === DEFAULT_ALBUM_ID) {
    const legacy = await db.get("images", "0-0");
    if (legacy?.dataUrl) return legacy.dataUrl;
  }

  return null;
}
export async function deleteImage(pageIndex: number, slotIndex: number): Promise<void> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  await db.delete("images", imageKey(albumId, pageIndex, slotIndex));
  if (albumId === DEFAULT_ALBUM_ID) {
    await db.delete("images", `${pageIndex}-${slotIndex}`);
  }
}

export async function deleteAlbumData(albumId: string): Promise<void> {
  const db = await getDB();
  const normalizedAlbumId = normalizeAlbumId(albumId);
  const [allImages, allStickers] = await Promise.all([
    db.getAll("images"),
    db.getAll("stickers"),
  ]);

  await Promise.all(
    allImages
      .filter((img) => {
        const parsed = parseImageId(img.id);
        return parsed?.albumId === normalizedAlbumId;
      })
      .map((img) => db.delete("images", img.id))
  );

  await Promise.all(
    allStickers
      .filter((sticker) => normalizeAlbumId(sticker.albumId) === normalizedAlbumId)
      .map((sticker) => db.delete("stickers", sticker.id))
  );
}

// â”€â”€ Placed Stickers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveSticker(sticker: Sticker): Promise<void> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  await db.put("stickers", { ...sticker, albumId });
}
export async function getAllStickers(): Promise<Sticker[]> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  const all = await db.getAll("stickers");
  return all
    .filter((s) => {
      const storedAlbumId = typeof s.albumId === "string" ? normalizeAlbumId(s.albumId) : DEFAULT_ALBUM_ID;
      return storedAlbumId === albumId;
    })
    .map(({ albumId: _albumId, ...rest }) => rest);
}
export async function deleteSticker(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("stickers", id);
}

// â”€â”€ Library Stickers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveLibrarySticker(sticker: LibrarySticker): Promise<void> {
  const db = await getDB();
  await db.put("libraryStickers", sticker);
}
export async function getAllLibraryStickers(): Promise<LibrarySticker[]> {
  const db = await getDB();
  const all = await db.getAll("libraryStickers");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}
export async function deleteLibrarySticker(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("libraryStickers", id);
}
