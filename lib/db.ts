"use client";

import { openDB, DBSchema, IDBPDatabase } from "idb";
import { SlotImage, Sticker, LibrarySticker } from "./types";

type StoredImage = SlotImage & { id: string };

interface AlbumDB extends DBSchema {
  images: { key: string; value: StoredImage };
  stickers: { key: string; value: Sticker };
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

// ── Images ───────────────────────────────────────────────────────────────────
export async function saveImage(slot: SlotImage): Promise<void> {
  const db = await getDB();
  const id = `${slot.pageIndex}-${slot.slotIndex}`;
  await db.put("images", { ...slot, id });
}
export async function getAllImages(): Promise<SlotImage[]> {
  const db = await getDB();
  return db.getAll("images");
}
export async function deleteImage(pageIndex: number, slotIndex: number): Promise<void> {
  const db = await getDB();
  await db.delete("images", `${pageIndex}-${slotIndex}`);
}

// ── Placed Stickers ───────────────────────────────────────────────────────────
export async function saveSticker(sticker: Sticker): Promise<void> {
  const db = await getDB();
  await db.put("stickers", sticker);
}
export async function getAllStickers(): Promise<Sticker[]> {
  const db = await getDB();
  return db.getAll("stickers");
}
export async function deleteSticker(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("stickers", id);
}

// ── Library Stickers ──────────────────────────────────────────────────────────
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
