"use client";

import { openDB, DBSchema, IDBPDatabase } from "idb";
import { SlotImage, Sticker, LibrarySticker, MoodboardImage, MoodboardText } from "./types";

type StoredImage = SlotImage & { id: string; albumId?: string };
type StoredSticker = Sticker & { albumId?: string };
type StoredMoodboardImage = MoodboardImage & { albumId?: string; src?: string; dataUrl?: string };
type StoredMoodboardText = MoodboardText & { albumId?: string };

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
  images:          { key: string; value: StoredImage; indexes: { by_albumId: string } };
  stickers:        { key: string; value: StoredSticker; indexes: { by_albumId: string } };
  libraryStickers: { key: string; value: LibrarySticker };
  moodboardImages: { key: string; value: StoredMoodboardImage; indexes: { by_albumId: string } };
  moodboardTexts:  { key: string; value: StoredMoodboardText;  indexes: { by_albumId: string } };
  albumBackgrounds: { key: string; value: { id: string; dataUrl: string } };
  drawings: { key: string; value: { id: string; albumId: string; pageIndex: number; dataUrl: string }; indexes: { by_albumId: string } };
}

let dbPromise: Promise<IDBPDatabase<AlbumDB>> | null = null;

function getDB(): Promise<IDBPDatabase<AlbumDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AlbumDB>("digital-photo-album", 7, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore("images", { keyPath: "id" });
          db.createObjectStore("stickers", { keyPath: "id" });
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("libraryStickers")) {
            db.createObjectStore("libraryStickers", { keyPath: "id" });
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains("moodboardImages")) {
            db.createObjectStore("moodboardImages", { keyPath: "id" });
          }
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains("moodboardTexts")) {
            db.createObjectStore("moodboardTexts", { keyPath: "id" });
          }
        }
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains("albumBackgrounds")) {
            db.createObjectStore("albumBackgrounds", { keyPath: "id" });
          }
        }
        // v6: add albumId indexes for fast per-album queries
        if (oldVersion < 6) {
          const imgStore = tx.objectStore("images");
          if (!imgStore.indexNames.contains("by_albumId"))
            imgStore.createIndex("by_albumId", "albumId");
          const stkStore = tx.objectStore("stickers");
          if (!stkStore.indexNames.contains("by_albumId"))
            stkStore.createIndex("by_albumId", "albumId");
          const mbiStore = tx.objectStore("moodboardImages");
          if (!mbiStore.indexNames.contains("by_albumId"))
            mbiStore.createIndex("by_albumId", "albumId");
          const mbtStore = tx.objectStore("moodboardTexts");
          if (!mbtStore.indexNames.contains("by_albumId"))
            mbtStore.createIndex("by_albumId", "albumId");
        }
        if (oldVersion < 7) {
          if (!db.objectStoreNames.contains("drawings")) {
            const store = db.createObjectStore("drawings", { keyPath: "id" });
            store.createIndex("by_albumId", "albumId");
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
  // Store albumId as a field so the by_albumId index covers new records
  await db.put("images", { ...slot, id, albumId });
  if (albumId === DEFAULT_ALBUM_ID) {
    await db.delete("images", `${slot.pageIndex}-${slot.slotIndex}`);
  }
}
export async function getAllImages(): Promise<SlotImage[]> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  // Images encode albumId in the key string; scan all and filter by parsed key
  // (index covers new records; key-parse covers legacy records without albumId field)
  const all = await db.getAll("images");
  return all.flatMap((img) => {
    const parsed = parseImageId(img.id);
    if (!parsed || parsed.albumId !== albumId) return [];
    return [{ pageIndex: parsed.pageIndex, slotIndex: parsed.slotIndex, dataUrl: img.dataUrl, croppedAt: img.croppedAt }];
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
/** For moodboard (style-5) albums: checks moodboardImages first (style-5 stores
 *  photos there), then falls back to the regular images store, then returns null. */
export async function getAlbumAnyImage(albumId: string): Promise<string | null> {
  const db = await getDB();
  const normalizedAlbumId = normalizeAlbumId(albumId);

  // Check moodboardImages store first (style-5 photos live here)
  const moodAll = await db.getAll("moodboardImages");
  const moodMine = moodAll
    .filter((img) => normalizeAlbumId(img.albumId) === normalizedAlbumId)
    .sort((a, b) => ((a as any).pageIndex ?? 0) - ((b as any).pageIndex ?? 0));
  const moodSrc = moodMine[0];
  if (moodSrc) {
    const src = typeof moodSrc.src === "string" ? moodSrc.src : (moodSrc as any).dataUrl;
    if (src) return src;
  }

  // Fall back to slot images store
  const all = await db.getAll("images");
  const mine = all
    .flatMap((img) => {
      const parsed = parseImageId(img.id);
      if (!parsed || parsed.albumId !== normalizedAlbumId || !img.dataUrl) return [];
      return [{ pageIndex: parsed.pageIndex, slotIndex: parsed.slotIndex, dataUrl: img.dataUrl }];
    })
    .sort((a, b) => a.pageIndex - b.pageIndex || a.slotIndex - b.slotIndex);
  return mine[0]?.dataUrl ?? null;
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
  const [allImages, allStickers, allMoodboardImages, allMoodboardTexts] = await Promise.all([
    db.getAll("images"),
    db.getAll("stickers"),
    db.getAll("moodboardImages"),
    db.getAll("moodboardTexts"),
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

  await Promise.all(
    allMoodboardImages
      .filter((img) => normalizeAlbumId(img.albumId) === normalizedAlbumId)
      .map((img) => db.delete("moodboardImages", img.id))
  );
  await Promise.all(
    allMoodboardTexts
      .filter((txt) => normalizeAlbumId(txt.albumId) === normalizedAlbumId)
      .map((txt) => db.delete("moodboardTexts", txt.id))
  );

  // Clean up album background
  await db.delete("albumBackgrounds", normalizedAlbumId);
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
  // Use index; also fetch legacy records without albumId for default album
  const [indexed, legacy] = await Promise.all([
    db.getAllFromIndex("stickers", "by_albumId", albumId),
    albumId === DEFAULT_ALBUM_ID ? db.getAll("stickers") : Promise.resolve<StoredSticker[]>([]),
  ]);
  const seen = new Set<string>();
  const result: Sticker[] = [];
  for (const s of [...indexed, ...legacy]) {
    const storedAlbumId = typeof s.albumId === "string" ? normalizeAlbumId(s.albumId) : DEFAULT_ALBUM_ID;
    if (storedAlbumId !== albumId || seen.has(s.id)) continue;
    seen.add(s.id);
    const { albumId: _a, ...rest } = s;
    result.push(rest as Sticker);
  }
  return result;
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

// ── Moodboard Images ──────────────────────────────────────────────────────────
export async function saveMoodboardImages(images: MoodboardImage[]): Promise<void> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);

  const tx = db.transaction("moodboardImages", "readwrite");
  const store = tx.objectStore("moodboardImages");
  const index = store.index("by_albumId");

  // Get all existing entries for this album to delete them
  const existingKeys = await index.getAllKeys(albumId);
  for (const key of existingKeys) {
    await store.delete(key);
  }

  // Add the new entries
  const next = images
    .filter((img) => normalizeAlbumId(img.albumId) === albumId)
    .map((img) => ({
      ...img,
      albumId,
      src: img.src,
      zIndex: Number.isFinite(img.zIndex) ? img.zIndex : 1,
    }));

  for (const img of next) {
    await store.put(img);
  }

  await tx.done;
}

export async function getAllMoodboardImages(): Promise<MoodboardImage[]> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  const all = await db.getAllFromIndex("moodboardImages", "by_albumId", albumId);

  return all
    .filter((img) => normalizeAlbumId(img.albumId) === albumId)
    .map((img) => ({
      id: img.id,
      albumId,
      src: typeof img.src === "string" ? img.src : (img.dataUrl ?? ""),
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
      rotation: img.rotation,
      zIndex: Number.isFinite(img.zIndex) ? img.zIndex : 1,
      pageIndex: typeof img.pageIndex === "number" ? img.pageIndex : undefined,
      frame: img.frame,
      frameColor: img.frameColor,
      frameText: img.frameText,
      frameEmoji: img.frameEmoji,
      borderRadius: typeof img.borderRadius === "number" ? img.borderRadius : undefined,
      src2: img.src2,
    }))
    .sort((a, b) => a.zIndex - b.zIndex);
}

export async function saveMoodboardTexts(texts: MoodboardText[]): Promise<void> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);

  const tx = db.transaction("moodboardTexts", "readwrite");
  const store = tx.objectStore("moodboardTexts");
  const index = store.index("by_albumId");

  // Get all existing keys to delete
  const existingKeys = await index.getAllKeys(albumId);
  for (const key of existingKeys) {
    await store.delete(key);
  }

  const next = texts
    .filter((txt) => normalizeAlbumId(txt.albumId) === albumId)
    .map((txt) => ({ ...txt, albumId }));

  for (const txt of next) {
    await store.put(txt);
  }

  await tx.done;
}

export async function getAllMoodboardTexts(): Promise<MoodboardText[]> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  const all = await db.getAllFromIndex("moodboardTexts", "by_albumId", albumId);

  return all
    .filter((txt) => normalizeAlbumId(txt.albumId) === albumId)
    .map((txt) => ({
      id: txt.id,
      albumId,
      pageIndex: txt.pageIndex,
      text: txt.text ?? "Text",
      x: txt.x,
      y: txt.y,
      width: Number.isFinite((txt as any).width) ? (txt as any).width : 180,
      fontSize: Number.isFinite(txt.fontSize) ? txt.fontSize : 28,
      fontFamily: txt.fontFamily || "Georgia, serif",
      color: txt.color || "#3F3F46",
      rotation: Number.isFinite((txt as any).rotation) ? (txt as any).rotation : 0,
      zIndex: Number.isFinite(txt.zIndex) ? txt.zIndex : 1,
    }))
    .sort((a, b) => a.zIndex - b.zIndex);
}

// ── Album Backgrounds ──────────────────────────────────────────────────────────
export async function saveAlbumBackground(albumId: string, dataUrl: string): Promise<void> {
  const db = await getDB();
  const id = normalizeAlbumId(albumId);
  await db.put("albumBackgrounds", { id, dataUrl });
}

export async function deleteAlbumBackground(albumId: string): Promise<void> {
  const db = await getDB();
  const id = normalizeAlbumId(albumId);
  await db.delete("albumBackgrounds", id);
}

export async function getAlbumBackground(albumId: string): Promise<string | null> {
  const db = await getDB();
  const id = normalizeAlbumId(albumId);
  const entry = await db.get("albumBackgrounds", id);
  return entry?.dataUrl ?? null;
}

// ── Drawings ──────────────────────────────────────────────────────────────────
export async function saveDrawing(pageIndex: number, dataUrl: string): Promise<void> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  const id = `${albumId}:${pageIndex}`;
  await db.put("drawings", { id, albumId, pageIndex, dataUrl });
}

export async function getAllDrawings(): Promise<Record<number, string>> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  const all = await db.getAllFromIndex("drawings", "by_albumId", albumId);
  const result: Record<number, string> = {};
  all.forEach((d) => {
    result[d.pageIndex] = d.dataUrl;
  });
  return result;
}

export async function deleteDrawing(pageIndex: number): Promise<void> {
  const db = await getDB();
  const albumId = normalizeAlbumId(activeAlbumId);
  await db.delete("drawings", `${albumId}:${pageIndex}`);
}
