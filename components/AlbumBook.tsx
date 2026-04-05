"use client";

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import HTMLFlipBook from "react-pageflip";
import { motion, AnimatePresence } from "framer-motion";
import AlbumPage, { PAGE_W, PAGE_H, SLOT_ASPECT } from "./AlbumPage";
import CropModal from "./CropModal";
import StickerPanel from "./StickerPanel";
import { SlotImage, Sticker, LibrarySticker, PendingCrop } from "@/lib/types";
import {
  getAllImages,
  saveImage,
  getAllStickers,
  getAllLibraryStickers,
  saveLibrarySticker,
  deleteSticker,
  deleteAlbumData,
  getAlbumFirstSlotImage,
  setActiveAlbumId as setDbActiveAlbumId,
} from "@/lib/db";
// MOBILE FIX: shared flags so ImageSlot can suppress clicks from corner-taps
import { markCornerTap, wasCornerTapRecent } from "@/lib/stickerInteraction";

const TOTAL_PAGES = 20;
const ALBUMS_STORAGE_KEY = "digital-photo-album:albums:v1";
const ACTIVE_ALBUM_STORAGE_KEY = "digital-photo-album:active-album:v1";

type AlbumMeta = {
  id: string;
  name: string;
  createdAt: number;
  isFavorite: boolean;
  lastOpenedAt: number;
};

type AlbumTab = "all" | "favourite" | "recent";
type AlbumDialog =
  | { type: "rename"; albumId: string }
  | { type: "delete"; albumId: string };

const DEFAULT_ALBUMS: AlbumMeta[] = [
  { id: "album-1", name: "Album 1", createdAt: 1, isFavorite: false, lastOpenedAt: Date.now() },
];

function normalizeAlbums(raw: unknown): AlbumMeta[] {
  const rawAlbums = Array.isArray(raw)
    ? raw.filter(
        (a): a is AlbumMeta =>
          Boolean(a) &&
          typeof (a as AlbumMeta).id === "string" &&
          typeof (a as AlbumMeta).name === "string" &&
          typeof (a as AlbumMeta).createdAt === "number"
      )
    : [];

  const hasModernAlbum1 = rawAlbums.some((a) => a.id.trim() === "album-1");

  const fromStorage = rawAlbums
    .map((a) => {
      const rawId = a.id.trim();
      if (!rawId) return null;

      const isLegacy = rawId === "all-albums" || rawId === "favourite-album";
      if (isLegacy && hasModernAlbum1) return null;

      const resolvedId = isLegacy ? "album-1" : rawId;
      const rawName = a.name.trim();
      const resolvedName = isLegacy ? "Album 1" : rawName;
      if (!resolvedName) return null;

      return {
        id: resolvedId,
        name: resolvedName,
        createdAt: a.createdAt,
        isFavorite: Boolean((a as any).isFavorite),
        lastOpenedAt: typeof (a as any).lastOpenedAt === "number" ? (a as any).lastOpenedAt : a.createdAt,
      } as AlbumMeta;
    })
    .filter((a): a is AlbumMeta => a !== null);

  // Merge defaults + persisted values by id, allowing persisted albums
  // (including album-1 rename/favourite state) to override defaults.
  const byId = new Map<string, AlbumMeta>(
    DEFAULT_ALBUMS.map((a) => [a.id, { ...a }])
  );

  for (const a of fromStorage) {
    const prev = byId.get(a.id);
    byId.set(a.id, prev ? { ...prev, ...a } : a);
  }

  const merged = Array.from(byId.values());
  merged.sort((a, b) => {
    if (a.id === "album-1") return -1;
    if (b.id === "album-1") return 1;
    return a.createdAt - b.createdAt;
  });
  return merged;
}

function readStoredAlbums(): AlbumMeta[] {
  if (typeof window === "undefined") return DEFAULT_ALBUMS;
  try {
    const raw = window.localStorage.getItem(ALBUMS_STORAGE_KEY);
    if (!raw) return DEFAULT_ALBUMS;
    return normalizeAlbums(JSON.parse(raw));
  } catch {
    return DEFAULT_ALBUMS;
  }
}

function persistAlbums(albums: AlbumMeta[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ALBUMS_STORAGE_KEY, JSON.stringify(albums));
}

function readStoredActiveAlbum(albums: AlbumMeta[]): string {
  if (typeof window === "undefined") return albums[0]?.id ?? "album-1";
  const stored = window.localStorage.getItem(ACTIVE_ALBUM_STORAGE_KEY);
  const fallback = albums[0]?.id ?? "album-1";
  if (!stored) return fallback;
  const normalized = stored === "all-albums" || stored === "favourite-album" ? "album-1" : stored;
  return albums.some((a) => a.id === normalized) ? normalized : fallback;
}

function persistActiveAlbum(albumId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_ALBUM_STORAGE_KEY, albumId);
}

export default function AlbumBook() {
  const bookRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cornerTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [images, setImages] = useState<Record<string, string>>({});
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [libraryStickers, setLibraryStickers] = useState<LibrarySticker[]>([]);
  const [pendingCrop, setPendingCrop] = useState<PendingCrop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [bookScale, setBookScale] = useState(1);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [stickerPanelPage, setStickerPanelPage] = useState(0);
  const [albums, setAlbums] = useState<AlbumMeta[]>(DEFAULT_ALBUMS);
  const [activeAlbumId, setActiveAlbumId] = useState("album-1");
  const [activeTab, setActiveTab] = useState<AlbumTab>("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [menuAlbumId, setMenuAlbumId] = useState<string | null>(null);
  const [albumDialog, setAlbumDialog] = useState<AlbumDialog | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [albumFirstSlotImages, setAlbumFirstSlotImages] = useState<Record<string, string>>({});

  // â”€â”€ Load + migrate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadAlbumData = useCallback(async (albumId: string, includeLibrary: boolean) => {
    setDbActiveAlbumId(albumId);
    const [imgs, stks, libStks] = await Promise.all([
      getAllImages(),
      getAllStickers(),
      includeLibrary ? getAllLibraryStickers() : Promise.resolve<LibrarySticker[]>([]),
    ]);

    const imgMap: Record<string, string> = {};
    imgs.forEach((img) => { imgMap[`${img.pageIndex}-${img.slotIndex}`] = img.dataUrl; });
    setImages(imgMap);

    const legacyLibraryStickers = stks.filter((s) => s.pageIndex === -1);
    const placedStickers = stks.filter((s) => s.pageIndex !== -1);
    setStickers(placedStickers);

    if (!includeLibrary) return;

    const existingSrcs = new Set(libStks.map((ls) => ls.src));
    const migrated: LibrarySticker[] = [];
    for (const old of legacyLibraryStickers) {
      if (!existingSrcs.has(old.dataUrl)) {
        const entry: LibrarySticker = {
          id: old.id,
          src: old.dataUrl,
          createdAt: Date.now(),
        };
        await saveLibrarySticker(entry);
        migrated.push(entry);
        existingSrcs.add(old.dataUrl);
      }
      await deleteSticker(old.id);
    }

    setLibraryStickers(
      [...libStks, ...migrated].sort((a, b) => a.createdAt - b.createdAt)
    );
  }, []);

  // â”€â”€ Load + migrate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    (async () => {
      try {
        const storedAlbums = readStoredAlbums();
        setAlbums(storedAlbums);
        persistAlbums(storedAlbums);

        const initialAlbumId = readStoredActiveAlbum(storedAlbums);
        setActiveAlbumId(initialAlbumId);
        persistActiveAlbum(initialAlbumId);
        await loadAlbumData(initialAlbumId, true);
      } catch (e) {
        console.error("Load error:", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadAlbumData]);

  // â”€â”€ Responsive scale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    function compute() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        // Book is shown rotated 90° — PAGE_H becomes the visual width
        setBookScale(Math.min(1.1, (window.innerWidth - 16) / PAGE_H));
      } else {
        const availW = window.innerWidth - (44 + 20) * 2 - 32;
        const availH = window.innerHeight - 160;
        const bookW = PAGE_W * 2;
        setBookScale(Math.min(1.15, availW / bookW, availH / PAGE_H));
      }
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuAlbumId(null);
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!menuAlbumId) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-album-menu-root]")) {
        setMenuAlbumId(null);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [menuAlbumId]);

  useEffect(() => {
    if (albumDialog?.type !== "rename") return;
    const t = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 10);
    return () => window.clearTimeout(t);
  }, [albumDialog]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        albums.map(async (album) => {
          try {
            const src = await getAlbumFirstSlotImage(album.id);
            return [album.id, src] as const;
          } catch {
            return [album.id, null] as const;
          }
        })
      );

      if (cancelled) return;

      const next: Record<string, string> = {};
      for (const [albumId, src] of entries) {
        if (src) next[albumId] = src;
      }
      setAlbumFirstSlotImages(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [albums, images]);

  // â”€â”€ Image upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSlotClick = useCallback((pageIndex: number, slotIndex: number) => {
    if (!fileInputRef.current) return;
    fileInputRef.current.dataset.page = String(pageIndex);
    fileInputRef.current.dataset.slot = String(slotIndex);
    fileInputRef.current.click();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pageIndex = Number(fileInputRef.current?.dataset.page ?? 0);
    const slotIndex = Number(fileInputRef.current?.dataset.slot ?? 0);
    setPendingCrop({ file, objectUrl: URL.createObjectURL(file), pageIndex, slotIndex, aspectRatio: SLOT_ASPECT });
    e.target.value = "";
  }, []);

  const handleSlotDrop = useCallback((file: File, pageIndex: number, slotIndex: number) => {
    if (!file.type.startsWith("image/")) return;
    setPendingCrop({
      file,
      objectUrl: URL.createObjectURL(file),
      pageIndex,
      slotIndex,
      aspectRatio: SLOT_ASPECT,
    });
  }, []);

  const handleCropDone = useCallback(async (dataUrl: string, pageIndex: number, slotIndex: number) => {
    setImages((prev) => ({ ...prev, [`${pageIndex}-${slotIndex}`]: dataUrl }));
    await saveImage({ pageIndex, slotIndex, dataUrl, croppedAt: Date.now() });
    if (pendingCrop?.objectUrl) URL.revokeObjectURL(pendingCrop.objectUrl);
    setPendingCrop(null);
  }, [pendingCrop]);

  const handleCropCancel = useCallback(() => {
    if (pendingCrop?.objectUrl) URL.revokeObjectURL(pendingCrop.objectUrl);
    setPendingCrop(null);
  }, [pendingCrop]);

  const handleStickersChange = useCallback((u: Sticker[]) => setStickers(u), []);
  const handleLibraryChange = useCallback((ls: LibrarySticker[]) => setLibraryStickers(ls), []);
  const handleStickerPanelOpen = useCallback((pi: number) => { setStickerPanelPage(pi); setStickerPanelOpen(true); }, []);
  const updateAlbums = useCallback((updater: (prev: AlbumMeta[]) => AlbumMeta[]) => {
    setAlbums((prev) => {
      const next = updater(prev);
      persistAlbums(next);
      return next;
    });
  }, []);
  const handleSelectAlbum = useCallback(async (albumId: string) => {
    if (albumId === activeAlbumId) {
      setMenuAlbumId(null);
      setIsSidebarOpen(false);
      return;
    }
    if (pendingCrop?.objectUrl) URL.revokeObjectURL(pendingCrop.objectUrl);
    setPendingCrop(null);
    setMenuAlbumId(null);
    setIsSidebarOpen(false);
    setStickerPanelOpen(false);
    setCurrentPage(0);
    setActiveAlbumId(albumId);
    persistActiveAlbum(albumId);
    const openAt = Date.now();
    updateAlbums((prev) => prev.map((a) => (a.id === albumId ? { ...a, lastOpenedAt: openAt } : a)));
    try {
      await loadAlbumData(albumId, false);
    } catch (e) {
      console.error("Album switch error:", e);
    }
  }, [activeAlbumId, loadAlbumData, pendingCrop, updateAlbums]);
  const handleAddNewAlbum = useCallback(async () => {
    const nextNumber = albums.length + 1;
    const createdAt = Date.now();
    const nextAlbum: AlbumMeta = {
      id: `album-${createdAt}`,
      name: `Album ${nextNumber}`,
      createdAt,
      isFavorite: false,
      lastOpenedAt: createdAt,
    };
    if (pendingCrop?.objectUrl) URL.revokeObjectURL(pendingCrop.objectUrl);
    setPendingCrop(null);
    updateAlbums((prev) => [...prev, nextAlbum]);
    setActiveAlbumId(nextAlbum.id);
    persistActiveAlbum(nextAlbum.id);
    setActiveTab("all");
    setMenuAlbumId(null);
    setIsSidebarOpen(false);
    setStickerPanelOpen(false);
    setCurrentPage(0);
    try {
      await loadAlbumData(nextAlbum.id, false);
    } catch (e) {
      console.error("New album load error:", e);
      setImages({});
      setStickers([]);
    }
  }, [albums.length, loadAlbumData, pendingCrop, updateAlbums]);
  const handleToggleFavorite = useCallback((albumId: string) => {
    updateAlbums((prev) =>
      prev.map((a) => (a.id === albumId ? { ...a, isFavorite: !a.isFavorite } : a))
    );
  }, [updateAlbums]);
  const closeAlbumDialog = useCallback(() => {
    setAlbumDialog(null);
    setRenameValue("");
  }, []);
  const confirmRenameAlbum = useCallback(() => {
    if (!albumDialog || albumDialog.type !== "rename") return;
    const name = renameValue.trim();
    if (!name) return;
    updateAlbums((prev) => prev.map((a) => (a.id === albumDialog.albumId ? { ...a, name } : a)));
    closeAlbumDialog();
  }, [albumDialog, closeAlbumDialog, renameValue, updateAlbums]);
  const handleRenameAlbum = useCallback((albumId: string) => {
    const current = albums.find((a) => a.id === albumId);
    if (!current) return;
    setRenameValue(current.name);
    setAlbumDialog({ type: "rename", albumId });
    setMenuAlbumId(null);
  }, [albums]);
  const confirmDeleteAlbum = useCallback(async () => {
    if (!albumDialog || albumDialog.type !== "delete") return;
    const albumId = albumDialog.albumId;
    closeAlbumDialog();
    await deleteAlbumData(albumId);
    updateAlbums((prev) => {
      const remaining = prev.filter((a) => a.id !== albumId);
      return remaining.length > 0 ? remaining : DEFAULT_ALBUMS;
    });
    if (activeAlbumId === albumId) {
      const fallbackId = "album-1";
      setActiveAlbumId(fallbackId);
      persistActiveAlbum(fallbackId);
      setCurrentPage(0);
      await loadAlbumData(fallbackId, false);
    }
  }, [activeAlbumId, albumDialog, closeAlbumDialog, loadAlbumData, updateAlbums]);
  const handleDeleteAlbum = useCallback((albumId: string) => {
    if (albumId === "album-1") {
      setMenuAlbumId(null);
      return;
    }
    setAlbumDialog({ type: "delete", albumId });
    setMenuAlbumId(null);
  }, []);
  const handleShareAlbum = useCallback(async (albumId: string) => {
    const album = albums.find((a) => a.id === albumId);
    if (!album) return;
    const shareText = `Check out my album: ${album.name}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: album.name, text: shareText });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        window.alert("Album text copied to clipboard.");
      } else {
        window.alert(shareText);
      }
    } catch {
      // no-op
    } finally {
      setMenuAlbumId(null);
    }
  }, [albums]);
  const dialogAlbumName =
    (albumDialog ? albums.find((a) => a.id === albumDialog.albumId)?.name : null) ?? "this album";
  const activeAlbumName = albums.find((a) => a.id === activeAlbumId)?.name ?? "My Photo Album";
  const visibleAlbums = useMemo(() => {
    if (activeTab === "favourite") return albums.filter((a) => a.isFavorite);
    if (activeTab === "recent") return [...albums].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    return albums;
  }, [activeTab, albums]);

  const pageSequence = Array.from({ length: TOTAL_PAGES }, (_, i) => i);

  // â”€â”€ Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // MOBILE FIX: removed `currentPage` from deps â€” it was unused inside the callback
  // and caused the function to be recreated on every flip. The dots' onClick
  // captures `fn = goNext/goPrev` once; a stale reference still called the
  // correct pf.flipNext/Prev(), but removing the dep makes the function
  // stable so the closure is always fresh.
  const goNext = useCallback(() => {
    bookRef.current?.pageFlip()?.flipNext();
  }, []);
  const goPrev = useCallback(() => {
    bookRef.current?.pageFlip()?.flipPrev();
  }, []);

  const getPageImages = useCallback((pi: number): Record<number, string> => {
    const r: Record<number, string> = {};
    for (let i = 0; i < 9; i++) { const v = images[`${pi}-${i}`]; if (v) r[i] = v; }
    return r;
  }, [images]);

  const spreadIndex = Math.floor(currentPage / 2);
  const totalSpreads = Math.ceil(TOTAL_PAGES / 2);
  const atStart = currentPage === 0;
  const atEnd = currentPage >= TOTAL_PAGES - 2;

  // Always two-page spread. On mobile the book is rotated 90° so the
  // landscape spread fits in a portrait viewport — dimensions swap.
  const bookNaturalW = PAGE_W * 2;
  const visualW = isMobile ? PAGE_H * bookScale : bookNaturalW * bookScale;
  const visualH = isMobile ? bookNaturalW * bookScale : PAGE_H * bookScale;

  // â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen"
        style={{ background: "linear-gradient(135deg,#F5F5F4 0%,#E7E5E4 100%)" }}>
        <motion.div className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <motion.div className="w-9 h-9 rounded-full border-[2.5px] border-stone-300 border-t-stone-500"
            animate={{ rotate: 360 }} transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }} />
          <p className="text-stone-500 text-sm font-medium font-sans tracking-wide">Opening your album...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full min-h-screen select-none"
      style={{ background: "linear-gradient(160deg,#F5F5F4 0%,#EAE8E6 60%,#E2DFDC 100%)" }}>

      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <motion.header className="w-full flex items-center justify-between px-6 pt-6 pb-3"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.4 }}>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Open album sidebar"
            onClick={() => setIsSidebarOpen(true)}
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{ border: "1px solid rgba(0,0,0,0.12)", color: "#79716B", background: "rgba(255,255,255,0.55)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="flex flex-col leading-tight">
            <span className="font-serif text-lg tracking-wide" style={{ color: "#57534E", fontWeight: 500 }}>
              My Photo Album
            </span>
            <span className="text-[11px] font-sans" style={{ color: "#A8A29E" }}>
              {activeAlbumName}
            </span>
          </div>
        </div>
        <span className="text-xs font-sans" style={{ color: "#A8A29E" }}>
          {Object.keys(images).length} / {TOTAL_PAGES * 9} photos
        </span>
      </motion.header>

      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close album sidebar"
              className="fixed inset-0 z-40"
              style={{ background: "rgba(0,0,0,0.28)", backdropFilter: "blur(2px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
            />
            <motion.aside
              className="fixed top-0 left-0 bottom-0 z-50 w-[290px] max-w-[85vw] p-4 flex flex-col"
              style={{
                background: "rgba(255,255,255,0.97)",
                borderRight: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 14px 36px rgba(0,0,0,0.16)",
              }}
              initial={{ x: -320, opacity: 0.75 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0.75 }}
              transition={{ type: "spring", stiffness: 280, damping: 32 }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-serif text-lg tracking-wide" style={{ color: "#44403C", fontWeight: 500 }}>
                  Albums
                </span>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ color: "#A8A29E", background: "rgba(0,0,0,0.03)" }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <button
                type="button"
                onClick={handleAddNewAlbum}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-sans"
                style={{ background: "#1E1E1E", color: "#FFFFFF", border: "1px solid #1E1E1E", fontWeight: 600 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z"
                  />
                </svg>
                <span>Add New Album</span>
              </button>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {([
                  { id: "all", label: "All Albums" },
                  { id: "favourite", label: "Favourite" },
                  { id: "recent", label: "Recent" },
                ] as { id: AlbumTab; label: string }[]).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="px-2 py-1.5 rounded-lg text-[11px] font-sans"
                    style={{
                      background: activeTab === tab.id ? "rgba(68,64,60,0.14)" : "rgba(0,0,0,0.03)",
                      color: activeTab === tab.id ? "#292524" : "#78716C",
                      border: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 pt-3 flex-1 overflow-y-auto" style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <div className="grid grid-cols-2 gap-2">
                  {visibleAlbums.map((album) => (
                    <div
                      key={album.id}
                      className="rounded-xl p-2.5"
                      style={{
                        background: activeAlbumId === album.id ? "rgba(68,64,60,0.10)" : "rgba(0,0,0,0.03)",
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectAlbum(album.id)}
                        className="w-full text-left"
                      >
                        {(() => {
                          const coverSrc = albumFirstSlotImages[album.id];
                          if (coverSrc) {
                            return (
                              <div className="w-full h-14 rounded-md overflow-hidden"
                                style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.06)" }}>
                                <img
                                  src={coverSrc}
                                  alt={`${album.name} cover`}
                                  className="w-full h-full object-cover"
                                  draggable={false}
                                />
                              </div>
                            );
                          }

                          return (
                            <div className="w-full h-14 rounded-md flex items-center justify-center"
                              style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.06)" }}>
                              <svg width="28" height="22" viewBox="0 0 28 22" fill="none" stroke="#79716B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 6.2C2 4.4 3.4 3 5.2 3h6.6l1.7 2h9.3c1.8 0 3.2 1.4 3.2 3.2v8.6c0 1.8-1.4 3.2-3.2 3.2H5.2C3.4 20 2 18.6 2 16.8V6.2Z" />
                              </svg>
                            </div>
                          );
                        })()}
                        <p className="mt-1.5 text-[11px] font-sans truncate" style={{ color: "#44403C" }}>
                          {album.name}
                        </p>
                      </button>
                      <div className="mt-1.5 flex items-center justify-between" data-album-menu-root>
                        <button
                          type="button"
                          onClick={() => handleToggleFavorite(album.id)}
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(255,255,255,0.75)" }}
                        >
                          {album.isFavorite ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#EF4444" }}>
                              <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={{ color: "#A8A29E" }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                            </svg>
                          )}
                        </button>
                        <div className="relative" data-album-menu-root>
                          <button
                            type="button"
                            onClick={() => setMenuAlbumId((prev) => (prev === album.id ? null : album.id))}
                            className="w-6 h-6 rounded-full flex items-center justify-center"
                            style={{ background: "rgba(255,255,255,0.75)", color: "#78716C" }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="5" cy="12" r="1.6" />
                              <circle cx="12" cy="12" r="1.6" />
                              <circle cx="19" cy="12" r="1.6" />
                            </svg>
                          </button>
                          <AnimatePresence>
                            {menuAlbumId === album.id && (
                              <motion.div
                                className="absolute right-0 mt-1 w-28 rounded-lg overflow-hidden z-[90]"
                                style={{ background: "white", border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 10px 26px rgba(0,0,0,0.16)" }}
                                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                              >
                                <button type="button" onClick={() => handleRenameAlbum(album.id)} className="w-full text-left px-2.5 py-1.5 text-xs font-sans" style={{ color: "#44403C" }}>Rename</button>
                                <button type="button" onClick={() => handleDeleteAlbum(album.id)} className="w-full text-left px-2.5 py-1.5 text-xs font-sans" style={{ color: album.id === "album-1" ? "#A8A29E" : "#44403C" }} disabled={album.id === "album-1"}>Delete</button>
                                <button type="button" onClick={() => handleShareAlbum(album.id)} className="w-full text-left px-2.5 py-1.5 text-xs font-sans" style={{ color: "#44403C" }}>Share</button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* â”€â”€ Book Stage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex-1 flex items-center justify-center w-full px-4">
        <div className="flex items-center justify-center gap-5">

          {/* LEFT ARROW â€” desktop only; on mobile the button overlays the book */}
          {!isMobile && (
            <div style={{ flexShrink: 0, position: "relative", zIndex: 20 }}>
              <NavButton direction="prev" onClick={goPrev} disabled={atStart} />
            </div>
          )}

          {/* BOOK */}
          <motion.div
            className="relative flex-shrink-0"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.12, type: "spring", stiffness: 180, damping: 24 }}
            style={{ width: visualW, height: visualH }}
            onPointerDown={(e) => {
              if ((e.target as Element).closest?.("[data-sticker]")) return;

              if (isMobile && (e.target as Element).closest?.("[data-slot]")) {
                // MOBILE FIX: photo slots and page corners physically overlap.
                // Compute the corner zone here so we can decide:
                //  â€¢ tap is in corner zone  â†’ set cornerTapRef (page flip wins)
                //                             AND mark corner so ImageSlot suppresses click
                //  â€¢ tap is NOT in corner   â†’ skip (let slot handle its own onClick)
                const rect = e.currentTarget.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;
                const edgeW = Math.max(44, Math.floor(rect.width  * 0.2));
                // Rotated mobile: top strip = prev, bottom strip = next (full width)
                const inCorner = isMobile
                  ? (cy < rect.height * 0.28 || cy > rect.height * 0.72)
                  : (cy > rect.height * 0.72 && (cx < edgeW || cx > rect.width - edgeW));
                if (!inCorner) return; // non-corner slot tap: let slot handle it
                markCornerTap();       // corner slot tap: suppress slot, allow flip
              }

              cornerTapRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
            }}
            onPointerCancel={() => { cornerTapRef.current = null; }}
            onPointerUp={(e) => {
              if (!cornerTapRef.current) return;
              const dx = Math.abs(e.clientX - cornerTapRef.current.x);
              const dy = Math.abs(e.clientY - cornerTapRef.current.y);
              const dt = Date.now() - cornerTapRef.current.time;
              cornerTapRef.current = null;
              if (dx > 10 || dy > 10 || dt > 450) return;

              const rect = e.currentTarget.getBoundingClientRect();
              const cx = e.clientX - rect.left;
              const cy = e.clientY - rect.top;

              if (isMobile) {
                // Rotated mobile layout: top strip advances, bottom strip goes back.
                const liveIdx = bookRef.current?.pageFlip()?.getCurrentPageIndex() ?? currentPage;
                const stripH = Math.max(44, Math.floor(rect.height * 0.22));
                if (cy < stripH && liveIdx < TOTAL_PAGES - 2) { markCornerTap(); goNext(); }
                else if (cy > rect.height - stripH && liveIdx > 0) { markCornerTap(); goPrev(); }
              } else {
                // Desktop: bottom-left = prev, bottom-right = next
                const rightClear  = Math.max(20, Math.floor(34 * bookScale));
                const leftClear   = Math.max(18, Math.floor(28 * bookScale));
                const bottomClear = Math.max(28, Math.floor(49 * bookScale));
                const inBottomStrip = cy > rect.height - bottomClear;
                if (inBottomStrip && cx > rect.width - rightClear && !atEnd) { goNext(); }
                else if (inBottomStrip && cx < leftClear && !atStart) { goPrev(); }
              }
            }}
          >
            {/* Ground shadow */}
            <div className="absolute pointer-events-none"
              style={{
                bottom: -14, left: "8%", right: "8%", height: 28,
                background: "radial-gradient(ellipse at center, rgba(0,0,0,0.20) 0%, transparent 70%)",
                filter: "blur(8px)", zIndex: 0,
              }} />

            {/* Drop shadow ring */}
            <div className="absolute inset-0 pointer-events-none rounded-sm"
              style={{
                boxShadow: "0 28px 70px rgba(0,0,0,0.18), 0 10px 28px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.07)",
                zIndex: 0,
              }} />

            <div style={{ position: "relative", width: visualW, height: visualH, overflow: "hidden", zIndex: 1 }}>
              {/* Centre spine shadow */}
              <div className="absolute top-0 h-full pointer-events-none"
                style={{
                  left: isMobile
                    ? PAGE_W * bookScale - 3          // spine inside rotation wrapper — unused visually but harmless
                    : PAGE_W * bookScale - 3,
                  width: 6, zIndex: 20,
                  background: "linear-gradient(to right,rgba(0,0,0,0.10) 0%,rgba(0,0,0,0.20) 40%,rgba(0,0,0,0.20) 60%,rgba(0,0,0,0.10) 100%)",
                  display: isMobile ? "none" : "block", // spine drawn inside rotation on mobile
                }} />

              {/* On mobile the book is rotated -90° (CCW) so the landscape spread
                  fits in a portrait viewport. visualW = PAGE_H*scale (viewport width),
                  visualH = PAGE_W*2*scale. The rotation wrapper has the unrotated
                  dimensions, centered via negative margins. */}
              <div style={{
                position: "absolute",
                ...(isMobile ? {
                  width:  visualH,                        // unrotated width
                  height: visualW,                        // unrotated height
                  left:   (visualW - visualH) / 2,       // negative → centered
                  top:    (visualH - visualW) / 2,       // positive → centered
                  transform: "rotate(-90deg)",
                  transformOrigin: "center",
                } : {
                  top: 0, left: 0,
                  width: bookNaturalW * bookScale,
                  height: PAGE_H * bookScale,
                }),
                overflow: "hidden",
              }}>
                {/* Spine inside rotation so it appears correctly on mobile */}
                {isMobile && (
                  <div className="absolute top-0 h-full pointer-events-none"
                    style={{
                      left: PAGE_W * bookScale - 3, width: 6, zIndex: 20,
                      background: "linear-gradient(to right,rgba(0,0,0,0.10) 0%,rgba(0,0,0,0.20) 40%,rgba(0,0,0,0.20) 60%,rgba(0,0,0,0.10) 100%)",
                    }} />
                )}
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: bookNaturalW, height: PAGE_H,
                  transform: `scale(${bookScale})`, transformOrigin: "top left",
                }}>
                  <HTMLFlipBook
                    key={`${activeAlbumId}-flip`}
                    ref={bookRef}
                    width={PAGE_W}
                    height={PAGE_H}
                    size="fixed"
                    minWidth={PAGE_W} maxWidth={PAGE_W}
                    minHeight={PAGE_H} maxHeight={PAGE_H}
                    drawShadow={true}
                    flippingTime={720}
                    usePortrait={false}
                    startPage={0}
                    showCover={false}
                    mobileScrollSupport={false}
                    onFlip={(e: any) => setCurrentPage(e.data)}
                    className="album-flip"
                    style={{ position: "relative", zIndex: 5 }}
                    startZIndex={5}
                    autoSize={false}
                    clickEventForward={false}
                    useMouseEvents={false}
                    swipeDistance={0}
                    showPageCorners={false}
                    disableFlipByClick={true}
                    maxShadowOpacity={0.22}
                  >
                    {pageSequence.map((pageIdx, renderIdx) => (
                      <AlbumPage
                        key={`${pageIdx}-${renderIdx}`}
                        pageIndex={pageIdx}
                        isLeft={pageIdx % 2 === 0}
                        images={getPageImages(pageIdx)}
                        stickers={stickers}
                        onSlotClick={handleSlotClick}
                        onSlotDrop={handleSlotDrop}
                        onStickersChange={handleStickersChange}
                        onStickerPanelOpen={handleStickerPanelOpen}
                        pageNumber={pageIdx + 1}
                      />
                    ))}
                  </HTMLFlipBook>
                </div>
              </div>
            </div>

            {/* Mobile nav overlays â€” float inside the book bounds so they're
                always reachable even when the book fills the full viewport */}
            {isMobile && (
              <>
                <div style={{
                  position: "absolute", left: "50%", top: 6,
                  transform: "translateX(-50%)", zIndex: 20,
                }}>
                  <NavButton direction="next" onClick={goNext} disabled={atEnd} rotated />
                </div>
                <div style={{
                  position: "absolute", left: "50%", bottom: 6,
                  transform: "translateX(-50%)", zIndex: 20,
                }}>
                  <NavButton direction="prev" onClick={goPrev} disabled={atStart} rotated />
                </div>
              </>
            )}
          </motion.div>

          {/* RIGHT ARROW â€” desktop only; on mobile the button overlays the book */}
          {!isMobile && (
            <div style={{ flexShrink: 0, position: "relative", zIndex: 20 }}>
              <NavButton direction="next" onClick={goNext} disabled={atEnd} />
            </div>
          )}

        </div>
      </div>

      {/* â”€â”€ Pagination dots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <motion.div className="flex flex-col items-center gap-2.5 pb-7 pt-3"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSpreads }).map((_, i) => (
            <motion.button key={i}
              className="rounded-full border-none p-0 cursor-pointer"
              // MOBILE FIX: touch-action:manipulation removes iOS 300 ms tap delay
              style={{ height: 6, borderRadius: 999, touchAction: "manipulation" }}
              onClick={() => {
                const target = i * 2;
                const diff = target - currentPage;
                if (diff === 0) return;
                const steps = Math.abs(diff / 2);
                const fn = diff > 0 ? goNext : goPrev;
                for (let j = 0; j < steps; j++) setTimeout(fn, j * 740);
              }}
              animate={{ width: i === spreadIndex ? 20 : 6, background: i === spreadIndex ? "#79716B" : "#C8C4C0" }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            />
          ))}
        </div>
        <p className="text-xs font-sans tracking-wide" style={{ color: "#A8A29E" }}>
          Spread {spreadIndex + 1} / {totalSpreads}
        </p>
      </motion.div>

      {/* â”€â”€ Onboarding tip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <AnimatePresence>
        {!isLoading && Object.keys(images).length === 0 && (
          <motion.div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-sans whitespace-nowrap"
            style={{ background: "rgba(87,83,78,0.90)", color: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", zIndex: 40 }}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ delay: 0.6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            Tap any slot to add a photo &middot; Tap &#128522; to add stickers
          </motion.div>
        )}
      </AnimatePresence>

      {/* â”€â”€ Hidden file input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <AnimatePresence>
        {albumDialog && (
          <>
            <motion.button
              type="button"
              aria-label="Close album dialog"
              className="fixed inset-0 z-[120]"
              style={{ background: "rgba(0,0,0,0.30)", backdropFilter: "blur(2px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAlbumDialog}
            />
            <motion.div
              className="fixed inset-0 z-[130] flex items-center justify-center px-4 sm:px-6"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
            >
              <div
                className="w-[331px] max-w-[calc(100vw-2rem)] rounded-2xl px-4 py-5 sm:w-[420px] sm:max-w-[calc(100vw-3rem)] sm:rounded-[24px] sm:px-6 sm:py-6 md:w-[460px] md:max-w-[460px] md:px-7 md:py-7 lg:w-[480px] lg:max-w-[480px]"
                style={{ background: "#F5F5F4", boxShadow: "0 22px 48px rgba(0,0,0,0.20)" }}
              >
                {albumDialog.type === "delete" ? (
                  <>
                    <p className="text-center font-sans text-[17px] leading-[1.3] tracking-[-0.01em] sm:text-[21px] md:text-[25px]" style={{ color: "#1C1917", fontWeight: 500 }}>
                      Are you sure, you want to delete
                      <br />
                      {dialogAlbumName}?
                    </p>
                    <div className="mt-6 grid grid-cols-2 place-items-center gap-2 sm:mt-6 sm:grid-cols-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={confirmDeleteAlbum}
                        className="h-[46px] w-[132px] rounded-full text-[16px] font-sans sm:h-[46px] sm:w-full sm:text-[16px] md:h-12 md:text-[17px]"
                        style={{ border: "3px solid #3F3F46", color: "#1C1917", background: "transparent", fontWeight: 400 }}
                      >
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        onClick={closeAlbumDialog}
                        className="h-[46px] w-[132px] rounded-full text-[16px] font-sans sm:h-[46px] sm:w-full sm:text-[16px] md:h-12 md:text-[17px]"
                        style={{ color: "#FAFAF9", background: "#18181B", fontWeight: 500 }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-center font-sans text-[17px] leading-[1.3] tracking-[-0.01em] sm:text-[21px] md:text-[25px]" style={{ color: "#1C1917", fontWeight: 500 }}>
                      Rename Album
                    </p>
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmRenameAlbum();
                        if (e.key === "Escape") closeAlbumDialog();
                      }}
                      className="mt-5 w-full h-12 rounded-xl px-3.5 text-base font-sans outline-none sm:mt-5 sm:h-12 sm:rounded-xl sm:px-4 sm:text-[17px] md:h-[50px]"
                      style={{ border: "2px solid #D6D3D1", color: "#1C1917", background: "rgba(255,255,255,0.95)" }}
                      placeholder="Album name"
                    />
                    <div className="mt-5 grid grid-cols-2 place-items-center gap-2 sm:mt-5 sm:grid-cols-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={confirmRenameAlbum}
                        className="h-[46px] w-[132px] rounded-full text-[16px] font-sans sm:h-[46px] sm:w-full sm:text-[16px] md:h-12 md:text-[17px]"
                        style={{ color: "#FAFAF9", background: "#18181B", fontWeight: 500 }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={closeAlbumDialog}
                        className="h-[46px] w-[132px] rounded-full text-[16px] font-sans sm:h-[46px] sm:w-full sm:text-[16px] md:h-12 md:text-[17px]"
                        style={{ border: "3px solid #3F3F46", color: "#1C1917", background: "transparent", fontWeight: 400 }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {/* â”€â”€ Modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <CropModal pending={pendingCrop} onDone={handleCropDone} onCancel={handleCropCancel} />
      <StickerPanel
        isOpen={stickerPanelOpen}
        onClose={() => setStickerPanelOpen(false)}
        allStickers={stickers}
        currentPage={stickerPanelPage}
        onStickersChange={handleStickersChange}
        libraryStickers={libraryStickers}
        onLibraryChange={handleLibraryChange}
      />
    </div>
  );
}

// â”€â”€ NavButton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function NavButton({ direction, onClick, disabled, rotated }: {
  direction: "prev" | "next";
  onClick: () => void;
  disabled: boolean;
  rotated?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded-full bg-white"
      style={{
        width: 44, height: 44,
        boxShadow: "0 2px 14px rgba(0,0,0,0.12)",
        border: "1px solid rgba(0,0,0,0.04)",
        cursor: disabled ? "default" : "pointer",
        flexShrink: 0,
      }}
      animate={{ opacity: disabled ? 0.28 : 1 }}
      whileHover={!disabled ? { scale: 1.1, boxShadow: "0 4px 20px rgba(0,0,0,0.17)" } : {}}
      whileTap={!disabled ? { scale: 0.91 } : {}}
      transition={{ duration: 0.15 }}
    >
      {direction === "prev"
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#57534E" strokeWidth="2.3" strokeLinecap="round" style={rotated ? { transform: "rotate(-90deg)" } : undefined}><polyline points="15 18 9 12 15 6" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#57534E" strokeWidth="2.3" strokeLinecap="round" style={rotated ? { transform: "rotate(-90deg)" } : undefined}><polyline points="9 18 15 12 9 6" /></svg>
      }
    </motion.button>
  );
}
