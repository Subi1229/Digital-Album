"use client";

import React, { useRef, useState, useCallback, useEffect, useMemo, startTransition } from "react";
import HTMLFlipBook from "react-pageflip";
import SplashScreen from "@/components/SplashScreen";
import { motion, AnimatePresence } from "framer-motion";
import AlbumPage, { PAGE_W, PAGE_H, SLOT_ASPECT } from "./AlbumPage";
import MoodboardImageLayer from "./MoodboardImageLayer";
import MoodboardTextLayer from "./MoodboardTextLayer";
import StickerLayer from "./StickerLayer";
import DrawingLayer from "./DrawingLayer";
import CropModal from "./CropModal";
import StickerPanel from "./StickerPanel";
import ShareModal from "./ShareModal";
import { SlotImage, Sticker, LibrarySticker, PendingCrop, MoodboardImage, MoodboardText } from "@/lib/types";
import {
  getAllImages,
  saveImage,
  getAllStickers,
  getAllMoodboardImages,
  getAllMoodboardTexts,
  saveMoodboardImages,
  saveMoodboardTexts,
  getAllLibraryStickers,
  saveLibrarySticker,
  deleteSticker,
  deleteAlbumData,
  getAlbumFirstSlotImage,
  getAlbumAnyImage,
  setActiveAlbumId as setDbActiveAlbumId,
  saveAlbumBackground,
  getAlbumBackground,
  getAllDrawings,
  saveDrawing,
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
  templateId: 1 | 2 | 3 | 4 | 5 | 6;
  pageTemplates?: Record<number, 1 | 2 | 3 | 4>;
};

type AlbumTab = "all" | "favourite" | "recent";
type AlbumDialog =
  | { type: "rename"; albumId: string }
  | { type: "delete"; albumId: string };

const DEFAULT_ALBUMS: AlbumMeta[] = [
  { id: "album-1", name: "Album 1", createdAt: 1, isFavorite: false, lastOpenedAt: Date.now(), templateId: 1 },
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
        templateId: ([1, 2, 3, 4, 5, 6].includes((a as any).templateId) ? (a as any).templateId : 1) as 1 | 2 | 3 | 4 | 5 | 6,
        pageTemplates: (() => {
          const raw = (a as any).pageTemplates;
          if (!raw || typeof raw !== "object") return undefined;
          const result: Record<number, 1 | 2 | 3 | 4> = {};
          for (const [k, v] of Object.entries(raw)) {
            const num = Number(k);
            if (!isNaN(num) && [1, 2, 3, 4].includes(Number(v))) result[num] = Number(v) as 1 | 2 | 3 | 4;
          }
          return Object.keys(result).length > 0 ? result : undefined;
        })(),
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
  const bgInputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [drawingPageIndex, setDrawingPageIndex] = useState<number | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [moodboardImages, setMoodboardImages] = useState<MoodboardImage[]>([]);
  const [moodboardTexts, setMoodboardTexts] = useState<MoodboardText[]>([]);
  const [libraryStickers, setLibraryStickers] = useState<LibrarySticker[]>([]);
  const [drawings, setDrawings] = useState<Record<number, string>>({});
  const [pendingCrop, setPendingCrop] = useState<PendingCrop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isFlipAnimating, setIsFlipAnimating] = useState(false);
  const spreadCanvasRef = useRef<HTMLDivElement>(null);
  const pickScrollRef = useRef<HTMLDivElement>(null);
  const customScrollRef = useRef<HTMLDivElement>(null);
  const flipHalfTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [bookScale, setBookScale] = useState(1);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [stickerPanelPage, setStickerPanelPage] = useState(0);
  const [albums, setAlbums] = useState<AlbumMeta[]>(DEFAULT_ALBUMS);
  const [activeAlbumId, setActiveAlbumId] = useState("album-1");
  const [activeTab, setActiveTab] = useState<AlbumTab>("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [menuAlbumId, setMenuAlbumId] = useState<string | null>(null);
  const [shareAlbumId, setShareAlbumId] = useState<string | null>(null);
  const [albumDialog, setAlbumDialog] = useState<AlbumDialog | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [albumFirstSlotImages, setAlbumFirstSlotImages] = useState<Record<string, string>>({});
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateModalStep, setTemplateModalStep] = useState<"pick" | "custom">("pick");
  const [pendingCustomStyles, setPendingCustomStyles] = useState<(1 | 2 | 3 | 4)[]>([]);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [isBgDark, setIsBgDark] = useState(false);
  const [navDirection, setNavDirection] = useState<"next" | "prev">("next");

  useEffect(() => {
    if (!bgImageUrl) {
      setIsBgDark(false);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 50, 50);
      try {
        const data = ctx.getImageData(0, 0, 50, 50).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }
        setIsBgDark(sum / (50 * 50) < 128);
      } catch {
        setIsBgDark(false);
      }
    };
    img.src = bgImageUrl;
  }, [bgImageUrl]);

  // ————————————————————————————————————————————————————————————————————————————————
  const loadAlbumData = useCallback(async (albumId: string, includeLibrary: boolean) => {
    setDbActiveAlbumId(albumId);
    const [imgs, stks, moodImgs, moodTxts, libStks, bgUrl, drws] = await Promise.all([
      getAllImages(),
      getAllStickers(),
      getAllMoodboardImages(),
      getAllMoodboardTexts(),
      includeLibrary ? getAllLibraryStickers() : Promise.resolve<LibrarySticker[]>([]),
      getAlbumBackground(albumId),
      getAllDrawings(),
    ]);

    const imgMap: Record<string, string> = {};
    imgs.forEach((img) => { imgMap[`${img.pageIndex}-${img.slotIndex}`] = img.dataUrl; });
    setImages(imgMap);

    const legacyLibraryStickers = stks.filter((s) => s.pageIndex === -1);
    const placedStickers = stks.filter((s) => s.pageIndex !== -1);
    setStickers(placedStickers);
    setMoodboardImages(moodImgs);
    setMoodboardTexts(moodTxts);
    setBgImageUrl(bgUrl);
    setDrawings(drws);

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

  // ————————————————————————————————————————————————————————————————————————————————
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

  useEffect(() => {
    if (isLoading) return;
    saveMoodboardImages(moodboardImages).catch((e) => {
      console.error("Moodboard save error:", e);
    });
  }, [isLoading, moodboardImages]);
  useEffect(() => {
    if (isLoading) return;
    saveMoodboardTexts(moodboardTexts).catch((e) => {
      console.error("Moodboard text save error:", e);
    });
  }, [isLoading, moodboardTexts]);

  // Template modal scroll — non-passive touch listeners so scroll works on tablets
  useEffect(() => {
    function attachScroll(el: HTMLDivElement | null) {
      if (!el) return () => {};
      let lastX = 0;
      const onStart = (e: TouchEvent) => { lastX = e.touches[0].clientX; };
      const onMove = (e: TouchEvent) => {
        e.preventDefault();
        el.scrollTop += lastX - e.touches[0].clientX;
        lastX = e.touches[0].clientX;
      };
      el.addEventListener("touchstart", onStart, { passive: true });
      el.addEventListener("touchmove", onMove, { passive: false });
      return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); };
    }
    const c1 = attachScroll(pickScrollRef.current);
    const c2 = attachScroll(customScrollRef.current);
    return () => { c1(); c2(); };
  });

  // ————————————————————————————————————————————————————————————————————————————————
  useEffect(() => {
    function isLandscapeNow(): boolean {
      // screen.orientation.type is most reliable in PWA standalone
      if (screen.orientation?.type) {
        return screen.orientation.type.startsWith("landscape");
      }
      // fallback for iOS Safari
      if (typeof window.orientation === "number") {
        return Math.abs(window.orientation) === 90;
      }
      return window.innerWidth > window.innerHeight;
    }

    function compute() {
      const isTouch = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
      const landscape = isLandscapeNow();
      // shortSide = portrait width regardless of current orientation
      const shortSide = Math.min(window.innerWidth, window.innerHeight);
      const mobile = isTouch && (shortSide < 768 || (shortSide < 1024 && landscape));
      setIsMobile(mobile);
      if (mobile) {
        setBookScale(Math.min(1.6, (window.innerWidth - 24 - 64 - 8) / PAGE_H));
      } else {
        const availW = window.innerWidth - (44 + 8) * 2 - 16;
        const availH = window.innerHeight - 110;
        const bookW = PAGE_W * 2;
        setBookScale(Math.min(2.2, availW / bookW, availH / PAGE_H));
      }
    }

    function onOrientationChange() {
      // Multiple delays to catch both fast and slow rotation updates
      setTimeout(compute, 50);
      setTimeout(compute, 200);
      setTimeout(compute, 500);
    }

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", onOrientationChange);
    screen.orientation?.addEventListener("change", onOrientationChange);
    visualViewport?.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", onOrientationChange);
      screen.orientation?.removeEventListener("change", onOrientationChange);
      visualViewport?.removeEventListener("resize", compute);
    };
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
            const src = (album.templateId === 5 || album.templateId === 6)
              ? await getAlbumAnyImage(album.id)
              : await getAlbumFirstSlotImage(album.id);
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
  }, [albums, images, moodboardImages]);

  // ————————————————————————————————————————————————————————————————————————————————
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
  const handleMoodboardImagesChange = useCallback((imgs: MoodboardImage[]) => setMoodboardImages(imgs), []);
  const handleMoodboardTextsChange = useCallback((txts: MoodboardText[]) => setMoodboardTexts(txts), []);
  const handleLibraryChange = useCallback((ls: LibrarySticker[]) => setLibraryStickers(ls), []);
  const handleStickerPanelOpen = useCallback((pi: number) => { setStickerPanelPage(pi); setStickerPanelOpen(true); }, []);
  const updateAlbums = useCallback((updater: (prev: AlbumMeta[]) => AlbumMeta[]) => {
    setAlbums((prev) => {
      const next = updater(prev);
      persistAlbums(next);
      return next;
    });
  }, []);
  const handleDrawingSave = useCallback(async (pageIndex: number, dataUrl: string) => {
    setDrawings((prev) => ({ ...prev, [pageIndex]: dataUrl }));
    await saveDrawing(pageIndex, dataUrl);
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
    setIsLoading(true);
    setCurrentPage(0);
    setActiveAlbumId(albumId);
    persistActiveAlbum(albumId);
    // Clear stale data synchronously so old album content disappears before new data loads
    setImages({});
    setStickers([]);
    setMoodboardImages([]);
    setMoodboardTexts([]);
    setBgImageUrl(null);
    setDrawings({});
    const openAt = Date.now();
    updateAlbums((prev) => prev.map((a) => (a.id === albumId ? { ...a, lastOpenedAt: openAt } : a)));
    try {
      await loadAlbumData(albumId, false);
    } catch (e) {
      console.error("Album switch error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [activeAlbumId, loadAlbumData, pendingCrop, updateAlbums]);
  const handleAddNewAlbum = useCallback(() => {
    setTemplateModalStep("pick");
    setPendingCustomStyles([]);
    setShowTemplateModal(true);
  }, []);

  const handleConfirmTemplate = useCallback(async (tid: 1 | 2 | 3 | 4 | 5 | 6) => {
    setShowTemplateModal(false);
    const nextNumber = albums.length + 1;
    const createdAt = Date.now();
    const nextAlbum: AlbumMeta = {
      id: `album-${createdAt}`,
      name: `Album ${nextNumber}`,
      createdAt,
      isFavorite: false,
      lastOpenedAt: createdAt,
      templateId: tid,
    };
    if (pendingCrop?.objectUrl) URL.revokeObjectURL(pendingCrop.objectUrl);
    setPendingCrop(null);
    setIsLoading(true);
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
      setMoodboardImages([]);
      setMoodboardTexts([]);
    } finally {
      setIsLoading(false);
    }
  }, [albums.length, loadAlbumData, pendingCrop, updateAlbums]);
  const handleConfirmCustomStyle = useCallback(async (styles: (1 | 2 | 3 | 4)[]) => {
    setShowTemplateModal(false);
    const pageTemplates: Record<number, 1 | 2 | 3 | 4> = {};
    for (let i = 0; i < TOTAL_PAGES; i++) {
      pageTemplates[i] = styles[Math.floor(Math.random() * styles.length)];
    }
    const nextNumber = albums.length + 1;
    const createdAt = Date.now();
    const nextAlbum: AlbumMeta = {
      id: `album-${createdAt}`,
      name: `Album ${nextNumber}`,
      createdAt,
      isFavorite: false,
      lastOpenedAt: createdAt,
      templateId: 1,
      pageTemplates,
    };
    if (pendingCrop?.objectUrl) URL.revokeObjectURL(pendingCrop.objectUrl);
    setPendingCrop(null);
    setIsLoading(true);
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
      setMoodboardImages([]);
      setMoodboardTexts([]);
    } finally {
      setIsLoading(false);
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
      setIsLoading(true);
      const fallbackId = "album-1";
      setActiveAlbumId(fallbackId);
      persistActiveAlbum(fallbackId);
      setCurrentPage(0);
      try {
        await loadAlbumData(fallbackId, false);
      } finally {
        setIsLoading(false);
      }
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
  const handleShareAlbum = useCallback((albumId: string) => {
    setMenuAlbumId(null);
    setIsSidebarOpen(false);
    setShareAlbumId(albumId);
  }, []);
  const dialogAlbumName =
    (albumDialog ? albums.find((a) => a.id === albumDialog.albumId)?.name : null) ?? "this album";
  const activeAlbumName = albums.find((a) => a.id === activeAlbumId)?.name ?? "My Photo Album";
  const activeTemplateId = (albums.find((a) => a.id === activeAlbumId)?.templateId ?? 1) as 1 | 2 | 3 | 4 | 5 | 6;
  const activePageTemplateFallback: 1 | 2 | 3 | 4 | 5 | 6 = activeTemplateId;
  const getPageTemplateId = useCallback((pageIdx: number): 1 | 2 | 3 | 4 | 5 | 6 => {
    const album = albums.find((a) => a.id === activeAlbumId);
    if (album?.pageTemplates) return album.pageTemplates[pageIdx] ?? activePageTemplateFallback;
    return activePageTemplateFallback;
  }, [albums, activeAlbumId, activePageTemplateFallback]);
  const visibleAlbums = useMemo(() => {
    if (activeTab === "favourite") return albums.filter((a) => a.isFavorite);
    if (activeTab === "recent") return [...albums].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    return albums;
  }, [activeTab, albums]);

  const pageSequence = Array.from({ length: TOTAL_PAGES }, (_, i) => i);

  // ————————————————————————————————————————————————————————————————————————————————
  const goNext = useCallback(() => {
    setNavDirection("next");
    bookRef.current?.pageFlip()?.flipNext();
  }, []);
  const goPrev = useCallback(() => {
    setNavDirection("prev");
    bookRef.current?.pageFlip()?.flipPrev();
  }, []);

  const getPageImages = useCallback((pi: number): Record<number, string> => {
    const r: Record<number, string> = {};
    for (let i = 0; i < 9; i++) { const v = images[`${pi}-${i}`]; if (v) r[i] = v; }
    return r;
  }, [images]);
  const moodboardCount = useMemo(() => moodboardImages.length, [moodboardImages]);
  const albumImageLimit = useMemo(() => {
    const slotsPerTemplate: Record<1 | 2 | 3 | 4, number> = {
      1: 9,
      2: 6,
      3: 4,
      4: 3,
    };
    let total = 0;
    for (let pageIdx = 0; pageIdx < TOTAL_PAGES; pageIdx++) {
      const tid = getPageTemplateId(pageIdx);
      if (tid === 5 || tid === 6) continue;
      total += slotsPerTemplate[tid as 1 | 2 | 3 | 4];
    }
    return total;
  }, [getPageTemplateId]);

  const spreadIndex = Math.floor(currentPage / 2);
  const totalSpreads = Math.ceil(TOTAL_PAGES / 2);
  const atStart = currentPage === 0;
  const atEnd = currentPage >= TOTAL_PAGES - 2;

  // Always two-page spread. On mobile the book is rotated 90° so the
  // landscape spread fits in a portrait viewport — dimensions swap.
  const bookNaturalW = PAGE_W * 2;
  const visualW = isMobile ? PAGE_H * bookScale : bookNaturalW * bookScale;
  const visualH = isMobile ? bookNaturalW * bookScale : PAGE_H * bookScale;

  const handleBgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      await saveAlbumBackground(activeAlbumId, dataUrl);
      setBgImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ————————————————————————————————————————————————————————————————————————————————
  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <div className={`flex flex-col items-center w-full select-none ${isMobile ? "min-h-screen overflow-y-auto" : "h-screen overflow-hidden"}`}
      style={{
        background: bgImageUrl && !isMobile
          ? `url(${bgImageUrl}) center/cover no-repeat fixed`
          : bgImageUrl ? "transparent" : "#ffffff",
        imageRendering: "high-quality" as React.CSSProperties["imageRendering"],
        position: "relative",
      }}>

      {/* Rotated background for mobile/tablet landscape */}
      {bgImageUrl && isMobile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{
            position: "absolute",
            width: "100vh",
            height: "100vw",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%) rotate(-90deg)",
            backgroundImage: `url(${bgImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }} />
        </div>
      )}

      <input type="file" accept="image/*" className="hidden" ref={bgInputRef} onChange={handleBgChange} />

      {/* ———————————————————————————————————————————————————————————————————————————————— */}
      {/* Desktop/tablet: normal header in document flow */}
      {!isMobile && (
        <motion.header className="w-full flex items-center justify-between px-6 pt-6 pb-3"
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.4 }}>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Open album sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ border: "1px solid rgba(0,0,0,0.12)", color: "#334a52", background: "rgba(224,244,255,0.55)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>

            <button
              type="button"
              aria-label="Change album background"
              onClick={() => bgInputRef.current?.click()}
              className="w-8 h-8 rounded-md flex items-center justify-center ml-1"
              style={{ border: "1px solid rgba(0,0,0,0.12)", color: "#334a52", background: "rgba(224,244,255,0.55)" }}
              title="Set Album Background"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>

            <div className="flex flex-col leading-tight ml-2">
              <span className="font-serif text-lg tracking-wide transition-colors" style={{ color: isBgDark ? "#fcfcd4" : "#1e1e1e", fontWeight: 500 }}>
                {activeAlbumName}
              </span>
            </div>
          </div>
          <span className="text-[13px] font-sans transition-colors" style={{ color: isBgDark ? "rgba(255,255,255,0.8)" : "#334a52" }}>
            {(activeTemplateId === 5 || activeTemplateId === 6)
              ? `${moodboardCount} photos`
              : `${Object.keys(images).length} / ${albumImageLimit} photos`}
          </span>
        </motion.header>
      )}

      {/* Mobile: header rotated -90° to match book landscape orientation, pinned to right (= landscape top) */}
      {isMobile && (
        <div style={{
          position: "fixed",
          zIndex: 30,
          width: "100vh",
          top: "50%",
          left: "calc(100vw - 32px)",
          transform: "translate(-50%, -50%) rotate(-90deg)",
          pointerEvents: "none",
        }}>
          <motion.header className="w-full flex items-center justify-between px-6 pt-3 pb-2"
            style={{ pointerEvents: "auto" }}
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.4 }}>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label="Open album sidebar"
                onClick={() => setIsSidebarOpen(true)}
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ border: "1px solid rgba(0,0,0,0.12)", color: "#334a52", background: "rgba(224,244,255,0.55)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>

              <button
                type="button"
                aria-label="Change album background"
                onClick={() => bgInputRef.current?.click()}
                className="w-8 h-8 rounded-md flex items-center justify-center ml-1"
                style={{ border: "1px solid rgba(0,0,0,0.12)", color: "#334a52", background: "rgba(224,244,255,0.55)" }}
                title="Set Album Background"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>

              <div className="flex flex-col leading-tight ml-2">
                <span className="font-serif text-lg tracking-wide transition-colors" style={{ color: isBgDark ? "#fcfcd4" : "#1e1e1e", fontWeight: 500 }}>
                  {activeAlbumName}
                </span>
              </div>
            </div>
            <span className="text-[13px] font-sans transition-colors" style={{ color: isBgDark ? "rgba(255,255,255,0.8)" : "#334a52" }}>
              {activeTemplateId === 5
                ? `${moodboardCount} photos`
                : `${Object.keys(images).length} / ${albumImageLimit} photos`}
            </span>
          </motion.header>
        </div>
      )}

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
            {/* Sidebar rotation wrapper for mobile */}
            <div style={isMobile ? {
              position: "fixed",
              zIndex: 50,
              width: "100vh",
              height: "100vw",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%) rotate(-90deg)",
              pointerEvents: "none",
            } : { position: "contents" as React.CSSProperties["position"] }}>
              <motion.aside
                className={isMobile ? "p-4 flex flex-col" : "fixed top-0 left-0 bottom-0 z-50 w-[290px] max-w-[85vw] p-4 flex flex-col"}
                style={isMobile ? {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: 290,
                  pointerEvents: "auto",
                  background: "rgba(255,255,255,0.97)",
                  backdropFilter: "blur(16px) saturate(180%)",
                  WebkitBackdropFilter: "blur(16px) saturate(180%)",
                  borderRight: "1px solid rgba(255,255,255,0.55)",
                  boxShadow: "0 8px 32px rgba(51,74,82,0.12)",
                } : {
                  background: "rgba(255,255,255,0.97)",
                  backdropFilter: "blur(16px) saturate(180%)",
                  WebkitBackdropFilter: "blur(16px) saturate(180%)",
                  borderRight: "1px solid rgba(255,255,255,0.55)",
                  boxShadow: "0 8px 32px rgba(51,74,82,0.12)",
                }}
                initial={{ x: -320, opacity: 0.75 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -320, opacity: 0.75 }}
                transition={{ type: "spring", stiffness: 280, damping: 32 }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-serif text-lg tracking-wide" style={{ color: "#1e1e1e", fontWeight: 500 }}>
                    Albums
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(false)}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ color: "#334a52", background: "rgba(0,0,0,0.03)" }}
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
                  style={{ background: "#1e1e1e", color: "#ffffff", border: "1px solid #1e1e1e", fontWeight: 600 }}
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
                        background: activeTab === tab.id ? "rgba(0,50,66,0.14)" : "rgba(0,0,0,0.03)",
                        color: activeTab === tab.id ? "#1e1e1e" : "#334a52",
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
                          background: activeAlbumId === album.id ? "rgba(0,50,66,0.12)" : "rgba(255,255,255,0.35)",
                          border: activeAlbumId === album.id ? "1px solid rgba(0,50,66,0.25)" : "1px solid rgba(0,0,0,0.10)",
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
                                  style={{ background: "rgba(240,240,240,0.85)", border: "1px solid rgba(255,255,255,0.55)" }}>
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
                                style={{ background: "rgba(240,240,240,0.85)", border: "1px solid rgba(255,255,255,0.55)" }}>
                                <svg width="28" height="22" viewBox="0 0 28 22" fill="none" stroke="#003242" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 6.2C2 4.4 3.4 3 5.2 3h6.6l1.7 2h9.3c1.8 0 3.2 1.4 3.2 3.2v8.6c0 1.8-1.4 3.2-3.2 3.2H5.2C3.4 20 2 18.6 2 16.8V6.2Z" />
                                </svg>
                              </div>
                            );
                          })()}
                          <p className="mt-1.5 text-[11px] font-sans truncate" style={{ color: "#1e1e1e" }}>
                            {album.name}
                          </p>
                        </button>
                        <div className="mt-1.5 flex items-center justify-between" data-album-menu-root>
                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(album.id)}
                            className="w-6 h-6 rounded-full flex items-center justify-center"
                            style={{ background: "rgba(240,240,240,0.85)" }}
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
                              style={{ background: "rgba(240,240,240,0.85)", color: "#334a52" }}
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
                                  style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 8px 32px rgba(51,74,82,0.12)" }}
                                  initial={{ opacity: 0, y: 4, scale: 0.98 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                                >
                                  <button type="button" onClick={() => handleRenameAlbum(album.id)} className="w-full text-left px-2.5 py-1.5 text-xs font-sans" style={{ color: "#1e1e1e" }}>Rename</button>
                                  <button type="button" onClick={() => handleDeleteAlbum(album.id)} className="w-full text-left px-2.5 py-1.5 text-xs font-sans" style={{ color: album.id === "album-1" ? "#003242" : "#1e1e1e" }} disabled={album.id === "album-1"}>Delete</button>
                                  <button type="button" onClick={() => handleShareAlbum(album.id)} className="w-full text-left px-2.5 py-1.5 text-xs font-sans" style={{ color: "#1e1e1e" }}>Share</button>
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
            </div>{/* end sidebar rotation wrapper */}
          </>
        )}
      </AnimatePresence>

      {/* ———————————————————————————————————————————————————————————————————————————————— */}
      {/* Book Stage ————————————————————————————————————————————————————————————————————— */}
      <div className="flex-1 flex items-center justify-center w-full px-4" style={isMobile ? { paddingRight: 64, paddingLeft: 40, paddingTop: 20, paddingBottom: 20 } : {}}>
        <div className="flex items-center justify-center gap-5">

          {/* LEFT ARROW — desktop only; on mobile the button overlays the book */}
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

              if (isMobile) {
                // Kill event propagation so internal library logic doesn't steal taps.
                e.stopPropagation();

                // Image slots always take priority — never hijack slot taps for flipping.
                if ((e.target as Element).closest?.("[data-slot]")) return;
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
              if (dx > (isMobile ? 25 : 10) || dy > (isMobile ? 25 : 10) || dt > 450) return;

              const rect = e.currentTarget.getBoundingClientRect();
              const cx = e.clientX - rect.left;
              const cy = e.clientY - rect.top;

              if (isMobile) {
                // New Mobile Mapping: Top-Right (50% height) = Next, Bottom-Right (50% height) = Prev.
                const inRightEdge = cx > rect.width * 0.7;
                if (inRightEdge) {
                  if (cy < rect.height / 2 && !atEnd) {
                    markCornerTap();
                    goNext();
                  } else if (cy >= rect.height / 2 && !atStart) {
                    markCornerTap();
                    goPrev();
                  }
                }
              } else {
                // Desktop: bottom-left = prev, bottom-right = next.
                const rightClear = Math.max(20, Math.floor(34 * bookScale));
                const leftClear = Math.max(18, Math.floor(28 * bookScale));
                const bottomClear = Math.max(28, Math.floor(49 * bookScale));
                const inBottomStrip = cy > rect.height - bottomClear;
                if (inBottomStrip && cx > rect.width - rightClear && !atEnd) { markCornerTap(); goNext(); }
                else if (inBottomStrip && cx < leftClear && !atStart) { markCornerTap(); goPrev(); }
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
                    ? PAGE_W * bookScale - 3
                    : PAGE_W * bookScale - 3,
                  width: 6, zIndex: 20,
                  background: "linear-gradient(to right,rgba(0,0,0,0.10) 0%,rgba(0,0,0,0.20) 40%,rgba(0,0,0,0.20) 60%,rgba(0,0,0,0.10) 100%)",
                  display: isMobile ? "none" : "block",
                  opacity: isFlipping ? 0 : 1,
                  transition: "opacity 0.18s ease",
                }} />

              {/* On mobile the book is rotated -90° (CCW) so the landscape spread
                  fits in a portrait viewport. visualW = PAGE_H*scale (viewport width),
                  visualH = PAGE_W*2*scale. The rotation wrapper has the unrotated
                  dimensions, centered via negative margins. */}
              <div style={{
                position: "absolute",
                ...(isMobile ? {
                  width: visualH,                        // unrotated width
                  height: visualW,                        // unrotated height
                  left: (visualW - visualH) / 2,       // negative → centered
                  top: (visualH - visualW) / 2,       // positive → centered
                  transform: "rotate(-90deg)",
                  transformOrigin: "center",
                } : {
                  top: 0, left: 0,
                  width: bookNaturalW * bookScale,
                  height: PAGE_H * bookScale,
                }),
                overflow: "visible",
              }}>
                {/* Spine inside rotation so it appears correctly on mobile */}
                {isMobile && (
                  <div className="absolute top-0 h-full pointer-events-none"
                    style={{
                      left: PAGE_W * bookScale - 3, width: 6, zIndex: 20,
                      background: "linear-gradient(to right,rgba(0,0,0,0.10) 0%,rgba(0,0,0,0.20) 40%,rgba(0,0,0,0.20) 60%,rgba(0,0,0,0.10) 100%)",
                      opacity: isFlipping ? 0 : 1,
                      transition: "opacity 0.18s ease",
                    }} />
                )}
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: bookNaturalW, height: PAGE_H,
                  transform: `scale(${bookScale})`, transformOrigin: "top left",
                }}>
                  {/* Hardcover Base (Thick White Edge) */}
                  <div style={{
                    position: "absolute",
                    top: -4, left: -10, right: -10, bottom: -4,
                    backgroundColor: "#ffffff",
                    borderRadius: 12,
                    boxShadow: "inset -3px 0 6px rgba(0,0,0,0.05), inset 3px 0 6px rgba(0,0,0,0.05)",
                    zIndex: 0,
                  }}>
                    {/* Outer thick cylindrical highlight */}
                    <div className="absolute inset-0 rounded-xl pointer-events-none" style={{
                      background: "linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(200,200,200,0.1) 5%, rgba(200,200,200,0.1) 95%, rgba(255,255,255,1) 100%)",
                    }} />
                  </div>

                  {/* Template 6: full-spread overlay canvas — hidden imperatively during flip */}
                  {activeTemplateId === 6 && (
                    <div
                      ref={spreadCanvasRef}
                      style={{ position: "absolute", top: 0, left: 0, width: bookNaturalW, height: PAGE_H, zIndex: 10, overflow: "hidden" }}
                    >
                      <SpreadCanvas
                        key={`spread6-${activeAlbumId}-${spreadIndex}`}
                        albumId={activeAlbumId}
                        pageIndex={spreadIndex * 2}
                        width={bookNaturalW}
                        height={PAGE_H}
                        moodboardImages={moodboardImages}
                        onMoodboardImagesChange={handleMoodboardImagesChange}
                        moodboardTexts={moodboardTexts}
                        onMoodboardTextsChange={handleMoodboardTextsChange}
                        stickers={stickers}
                        onStickersChange={handleStickersChange}
                        drawings={drawings}
                        onDrawingSave={handleDrawingSave}
                        drawingActive={drawingPageIndex === spreadIndex * 2}
                        onStartDrawing={() => setDrawingPageIndex(spreadIndex * 2)}
                        onStopDrawing={() => setDrawingPageIndex(null)}
                        onStickerPanelOpen={() => handleStickerPanelOpen(spreadIndex * 2)}
                      />
                    </div>
                  )}

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
                    onChangeState={(e: any) => {
                      if (e.data === "flipping") {
                        // Hide spread canvas immediately (sync DOM) so flip animation is unobstructed
                        if (spreadCanvasRef.current) spreadCanvasRef.current.style.visibility = "hidden";
                        setIsFlipAnimating(true);
                        if (flipHalfTimerRef.current) clearTimeout(flipHalfTimerRef.current);
                        flipHalfTimerRef.current = setTimeout(() => setIsFlipping(true), 180);
                      } else {
                        if (flipHalfTimerRef.current) { clearTimeout(flipHalfTimerRef.current); flipHalfTimerRef.current = null; }
                        setIsFlipping(false);
                        setIsFlipAnimating(false);
                        // Restore after React has painted the new spread content
                        requestAnimationFrame(() => {
                          if (spreadCanvasRef.current) spreadCanvasRef.current.style.visibility = "";
                        });
                      }
                    }}
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
                        albumId={activeAlbumId}
                        pageIndex={pageIdx}
                        isLeft={pageIdx % 2 === 0}
                        images={getPageImages(pageIdx)}
                        stickers={stickers}
                        onSlotClick={handleSlotClick}
                        onSlotDrop={handleSlotDrop}
                        onStickersChange={handleStickersChange}
                        onStickerPanelOpen={handleStickerPanelOpen}
                        pageNumber={pageIdx + 1}
                        templateId={getPageTemplateId(pageIdx)}
                        moodboardImages={moodboardImages}
                        onMoodboardImagesChange={handleMoodboardImagesChange}
                        moodboardTexts={moodboardTexts}
                        onMoodboardTextsChange={handleMoodboardTextsChange}
                        bgImageUrl={bgImageUrl}
                        drawings={drawings}
                        onDrawingSave={handleDrawingSave}
                        isDrawingActive={drawingPageIndex === pageIdx}
                        onStartDrawing={(idx) => setDrawingPageIndex(idx)}
                        onStopDrawing={() => setDrawingPageIndex(null)}
                      />
                    ))}
                  </HTMLFlipBook>
                </div>
              </div>
            </div>

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
      {isMobile ? (
        /* Mobile: fixed vertical dots on left side (= left of landscape view) */
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          style={{
            position: "fixed",
            left: 6,
            top: "50%",
            transform: "translateY(-50%) rotate(180deg)",
            zIndex: 30,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}>
          {Array.from({ length: totalSpreads }).map((_, i) => (
            <motion.button key={i}
              className="rounded-full border-none p-0 cursor-pointer"
              style={{ width: 6, borderRadius: 999, touchAction: "manipulation" }}
              onClick={() => {
                const target = i * 2;
                const diff = target - currentPage;
                if (diff === 0) return;
                const steps = Math.abs(diff / 2);
                const fn = diff > 0 ? goNext : goPrev;
                for (let j = 0; j < steps; j++) setTimeout(fn, j * 740);
              }}
              animate={{
                height: i === spreadIndex ? 20 : 6,
                background: i === spreadIndex
                  ? (isBgDark ? "#fcfcd4" : "#003242")
                  : (isBgDark ? "rgba(255,255,255,0.35)" : "#96afb9")
              }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            />
          ))}
        </motion.div>
      ) : (
        <motion.div className="flex flex-col items-center gap-2.5 pb-7 pt-6"
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
                animate={{
                  width: i === spreadIndex ? 20 : 6,
                  background: i === spreadIndex
                    ? (isBgDark ? "#fcfcd4" : "#003242")
                    : (isBgDark ? "rgba(255,255,255,0.35)" : "#96afb9")
                }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ))}
          </div>
          <p className="text-xs font-sans tracking-wide transition-colors" style={{ color: isBgDark ? "rgba(255,255,255,0.8)" : "#334a52" }}>
            Page {spreadIndex + 1} / {totalSpreads}
          </p>
        </motion.div>
      )}

      {/* â”€â”€ Onboarding tip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <AnimatePresence>
        {!isLoading && Object.keys(images).length === 0 && stickers.length === 0 && moodboardImages.length === 0 && (
          <motion.div className="fixed flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-sans whitespace-nowrap"
            style={{ background: "rgba(87,83,78,0.90)", color: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", zIndex: 40, ...(isMobile ? { right: 24, top: "50%", transform: "translateY(-50%) rotate(-90deg)" } : { bottom: 24, left: "50%", transform: "translateX(-50%)" }) }}
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
            {/* Fixed overlay — plain div so rotation doesn't fight Framer Motion */}
            <div className="fixed inset-0 z-[130] pointer-events-none" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Rotation wrapper: -90° on mobile so modal matches book orientation */}
              <div style={isMobile ? {
                position: "absolute",
                width: "100vh", height: "100vw",
                left: "50%", top: "50%",
                transform: "translate(-50%, -50%) rotate(-90deg)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 16px",
              } : {
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 16px",
              }}>
                {/* Animated card — scale/opacity only, no position transform */}
                <motion.div
                  style={{ pointerEvents: "auto" }}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 280, damping: 26 }}
                >
                  <div
                    style={{
                      width: isMobile ? Math.min(400, window.innerHeight - 32) : 331,
                      background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)",
                      boxShadow: "0 8px 32px rgba(51,74,82,0.12)",
                      borderRadius: 16, padding: "20px 16px",
                    }}
                  >
                    {albumDialog.type === "delete" ? (
                      <>
                        <p className="text-center font-sans text-[17px] leading-[1.3] tracking-[-0.01em] sm:text-[21px] md:text-[25px]" style={{ color: "#1e1e1e", fontWeight: 500 }}>
                          Are you sure, you want to delete
                          <br />
                          {dialogAlbumName}?
                        </p>
                        <div className="mt-6 grid grid-cols-2 place-items-center gap-2 sm:mt-6 sm:grid-cols-2 sm:gap-3">
                          <button
                            type="button"
                            onClick={confirmDeleteAlbum}
                            className="h-[46px] w-[132px] rounded-full text-[16px] font-sans sm:h-[46px] sm:w-full sm:text-[16px] md:h-12 md:text-[17px]"
                            style={{ border: "3px solid #1e1e1e", color: "#1e1e1e", background: "transparent", fontWeight: 400 }}
                          >
                            Yes, delete
                          </button>
                          <button
                            type="button"
                            onClick={closeAlbumDialog}
                            className="h-[46px] w-[132px] rounded-full text-[16px] font-sans sm:h-[46px] sm:w-full sm:text-[16px] md:h-12 md:text-[17px]"
                            style={{ color: "#ffffff", background: "#1e1e1e", fontWeight: 500 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-center font-sans text-[17px] leading-[1.3] tracking-[-0.01em] sm:text-[21px] md:text-[25px]" style={{ color: "#1e1e1e", fontWeight: 500 }}>
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
                          style={{ border: "2px solid #003242", color: "#1e1e1e", background: "rgba(224,244,255,0.95)" }}
                          placeholder="Album name"
                        />
                        <div className="mt-5 grid grid-cols-2 place-items-center gap-2 sm:mt-5 sm:grid-cols-2 sm:gap-3">
                          <button
                            type="button"
                            onClick={confirmRenameAlbum}
                            className="h-[46px] w-[132px] rounded-full text-[16px] font-sans sm:h-[46px] sm:w-full sm:text-[16px] md:h-12 md:text-[17px]"
                            style={{ color: "#ffffff", background: "#1e1e1e", fontWeight: 500 }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={closeAlbumDialog}
                            className="h-[46px] w-[132px] rounded-full text-[16px] font-sans sm:h-[46px] sm:w-full sm:text-[16px] md:h-12 md:text-[17px]"
                            style={{ border: "3px solid #1e1e1e", color: "#1e1e1e", background: "transparent", fontWeight: 400 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ── Template selection modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showTemplateModal && (
          <>
            <motion.button
              type="button"
              aria-label="Close template modal"
              className="fixed inset-0 z-[120]"
              style={{ background: "rgba(0,0,0,0.30)", backdropFilter: "blur(2px)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowTemplateModal(false)}
            />
            <div className="fixed inset-0 z-[130] pointer-events-none" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={isMobile ? {
                position: "absolute",
                width: "100vh", height: "100vw",
                left: "50%", top: "50%",
                transform: "translate(-50%, -50%) rotate(-90deg)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 16px",
              } : {
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 16px",
              }}>
                <motion.div
                  style={{ pointerEvents: "auto" }}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 280, damping: 26 }}
                >
                  <div
                    style={{
                      width: isMobile ? 360 : 331,
                      height: isMobile ? 300 : 480,
                      flexShrink: 0,
                      background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)",
                      boxShadow: "0 8px 32px rgba(51,74,82,0.12)",
                      borderRadius: 16,
                      padding: isMobile ? "12px 10px" : "20px 16px",
                      display: "flex", flexDirection: "column",
                    }}
                  >
                    {templateModalStep === "pick" ? (
                      <>
                        <p className="text-center font-sans text-[17px] leading-[1.3] tracking-[-0.01em] sm:text-[20px]" style={{ color: "#1e1e1e", fontWeight: 500 }}>
                          Choose a Template
                        </p>
                        <div ref={pickScrollRef} className="mt-5 flex-1 overflow-y-auto overflow-x-hidden pr-2"
                          style={{ touchAction: "none" } as React.CSSProperties}
                        >
                          <div className="p-2">
                            <div className="grid grid-cols-2 gap-3">
                              {([1, 2, 3, 4, 5, 6] as (1 | 2 | 3 | 4 | 5 | 6)[]).map((tid) => (
                                <motion.button
                                  key={tid}
                                  type="button"
                                  onClick={() => handleConfirmTemplate(tid)}
                                  className="flex flex-col items-center gap-2 rounded-xl p-3"
                                  style={{ background: "rgba(224,244,255,0.45)", backdropFilter: "blur(16px) saturate(180%)", border: "1px solid rgba(255,255,255,0.55)", boxShadow: "0 8px 32px rgba(51,74,82,0.12)" }}
                                  whileHover={{ scale: 1.03, boxShadow: "0 4px 14px rgba(0,0,0,0.10)" }}
                                  whileTap={{ scale: 0.97 }}
                                >
                                  <TemplatePreview templateId={tid} />
                                  <span className="text-[11px] font-sans font-medium" style={{ color: "#1e1e1e" }}>
                                    Style {tid}
                                  </span>
                                </motion.button>
                              ))}
                              <motion.button
                                type="button"
                                className="col-span-2 flex items-center justify-center gap-2 rounded-xl p-3"
                                style={{ background: "rgba(255,255,255,0.90)", border: "1.5px solid rgba(0,0,0,0.09)" }}
                                whileHover={{ scale: 1.02, boxShadow: "0 4px 14px rgba(0,0,0,0.10)" }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setTemplateModalStep("custom")}
                              >
                                <span className="text-[13px] font-sans font-medium" style={{ color: "#1e1e1e" }}>Custom Mix</span>
                                <span className="text-[11px] font-sans" style={{ color: "#334a52" }}>— choose 2–4 styles</span>
                              </motion.button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() => setShowTemplateModal(false)}
                            className="w-full h-11 rounded-full text-[15px] font-sans"
                            style={{ background: "#1e1e1e", color: "#ffffff", fontWeight: 500 }}
                          >
                            Cancel
                          </button>
                        </div>

                      </>
                    ) : (
                      <>
                        <p className="text-center font-sans text-[17px] leading-[1.3] tracking-[-0.01em] sm:text-[20px]" style={{ color: "#1e1e1e", fontWeight: 500 }}>
                          Custom Mix
                        </p>
                        <p className="text-center text-[12px] font-sans mt-1" style={{ color: "#334a52" }}>
                          Select 2–4 styles to mix across pages
                        </p>
                        <div ref={customScrollRef} className="mt-4 flex-1 overflow-y-auto overflow-x-hidden pr-2"
                          style={{ touchAction: "none" } as React.CSSProperties}
                        >
                          <div className="p-2">
                            <div className="grid grid-cols-2 gap-3">
                              {([1, 2, 3, 4] as (1 | 2 | 3 | 4)[]).map((tid) => {
                                const selected = pendingCustomStyles.includes(tid);
                                return (
                                  <motion.button
                                    key={tid}
                                    type="button"
                                    className="flex flex-col items-center gap-2 rounded-xl p-3 relative"
                                    style={{
                                      background: selected ? "rgba(0,50,66,0.15)" : "rgba(224,244,255,0.45)",
                                      backdropFilter: "blur(16px) saturate(180%)",
                                      border: selected ? "1.5px solid #003242" : "1px solid rgba(255,255,255,0.55)",
                                      boxShadow: "0 8px 32px rgba(51,74,82,0.12)",
                                    }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => {
                                      setPendingCustomStyles((prev) =>
                                        prev.includes(tid)
                                          ? prev.filter((s) => s !== tid)
                                          : prev.length < 4 ? [...prev, tid] : prev
                                      );
                                    }}
                                  >
                                    <TemplatePreview templateId={tid} />
                                    <span className="text-[11px] font-sans font-medium" style={{ color: "#1e1e1e" }}>
                                      Style {tid}
                                    </span>
                                    {selected && (
                                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#1e1e1e" }}>
                                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                                          <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      </div>
                                    )}
                                  </motion.button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setTemplateModalStep("pick")}
                            className="h-11 rounded-full text-[15px] font-sans"
                            style={{ border: "2px solid #003242", color: "#334a52", background: "transparent" }}
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            disabled={pendingCustomStyles.length < 2}
                            onClick={() => handleConfirmCustomStyle(pendingCustomStyles)}
                            className="h-11 rounded-full text-[15px] font-sans"
                            style={{
                              background: pendingCustomStyles.length < 2 ? "rgba(30,30,30,0.35)" : "#1e1e1e",
                              color: "#ffffff",
                              fontWeight: 500,
                            }}
                          >
                            Create Album
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {/* â”€â”€ Modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <CropModal pending={pendingCrop} onDone={handleCropDone} onCancel={handleCropCancel} isMobile={isMobile} />

      {/* ── Share Modal ── */}
      <AnimatePresence>
        {shareAlbumId && (() => {
          const shareAlbum = albums.find((a) => a.id === shareAlbumId);
          if (!shareAlbum) return null;
          return (
            <ShareModal
              key="share-modal"
              albumId={shareAlbumId}
              albumName={shareAlbum.name}
              totalPages={TOTAL_PAGES}
              images={images}
              stickers={stickers}
              moodboardImages={moodboardImages}
              moodboardTexts={moodboardTexts}
              drawings={drawings}
              bgImageUrl={bgImageUrl}
              getPageTemplateId={getPageTemplateId}
              getPageImages={getPageImages}
              onClose={() => setShareAlbumId(null)}
              isMobile={isMobile}
            />
          );
        })()}
      </AnimatePresence>
      <StickerPanel
        isOpen={stickerPanelOpen}
        onClose={() => setStickerPanelOpen(false)}
        allStickers={stickers}
        currentPage={stickerPanelPage}
        onStickersChange={handleStickersChange}
        libraryStickers={libraryStickers}
        onLibraryChange={handleLibraryChange}
        showWashiTab={getPageTemplateId(stickerPanelPage) === 5 || getPageTemplateId(stickerPanelPage) === 6}
        isMobile={isMobile}
      />
    </div>
  );
}

// ── SpreadCanvas ─────────────────────────────────────────────────────────────
// Full-spread (PAGE_W*2 × PAGE_H) free canvas overlay for template 6.
// Rendered inside the book's scale wrapper so it inherits bookScale transforms.
function SpreadCanvas({
  albumId, pageIndex, width, height,
  moodboardImages, onMoodboardImagesChange,
  moodboardTexts, onMoodboardTextsChange,
  stickers, onStickersChange,
  drawings, onDrawingSave,
  drawingActive, onStartDrawing, onStopDrawing,
  onStickerPanelOpen,
}: {
  albumId: string;
  pageIndex: number;
  width: number;
  height: number;
  moodboardImages: MoodboardImage[];
  onMoodboardImagesChange: (imgs: MoodboardImage[]) => void;
  moodboardTexts: MoodboardText[];
  onMoodboardTextsChange: (txts: MoodboardText[]) => void;
  stickers: Sticker[];
  onStickersChange: (s: Sticker[]) => void;
  drawings: Record<number, string>;
  onDrawingSave: (pageIndex: number, dataUrl: string) => void;
  drawingActive: boolean;
  onStartDrawing: () => void;
  onStopDrawing: () => void;
  onStickerPanelOpen: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;
      const img = new window.Image();
      img.onload = () => {
        const maxW = 400, maxH = 300;
        const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
        const w = Math.round(img.naturalWidth * ratio);
        const h = Math.round(img.naturalHeight * ratio);
        const x = Math.round((width - w) / 2);
        const y = Math.round((height - h) / 2);
        const nextZ = moodboardImages.reduce((m, e) => Math.max(m, e.zIndex ?? 1), 1) + 1;
        onMoodboardImagesChange([...moodboardImages, {
          id: `mb-${albumId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          albumId, pageIndex, src: dataUrl, x, y, width: w, height: h, rotation: 0, zIndex: nextZ,
        }]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [albumId, moodboardImages, onMoodboardImagesChange, pageIndex, width, height]);

  const addText = useCallback(() => {
    const nextZ = moodboardTexts.reduce((m, e) => Math.max(m, e.zIndex ?? 1), 1) + 1;
    onMoodboardTextsChange([...moodboardTexts, {
      id: `mbtxt-${albumId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      albumId, pageIndex,
      text: "Text",
      x: Math.round(width * 0.35),
      y: Math.round(height * 0.45),
      width: 180, fontSize: 28,
      fontFamily: "'Dancing Script', cursive",
      fontWeight: "normal" as const,
      fontStyle: "normal" as const,
      color: "#3F3F46", rotation: 0, zIndex: nextZ,
    }]);
  }, [albumId, moodboardTexts, onMoodboardTextsChange, pageIndex, width, height]);

  return (
    <div
      style={{
        position: "absolute", top: 0, left: 0,
        width, height,
        background: "#FFFFFF",
        zIndex: 10,
        overflow: "hidden",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file?.type.startsWith("image/")) addImage(file);
      }}
    >
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { addImage(f); e.target.value = ""; } }} />

      {/* Toolbar buttons — top right */}
      <motion.button onClick={() => fileInputRef.current?.click()}
        className="absolute flex items-center justify-center rounded-full"
        style={{ top: 14, right: 16, width: 32, height: 32, background: "rgba(255,255,255,0.94)", boxShadow: "0 1px 6px rgba(0,0,0,0.09)", border: "1.5px solid rgba(0,0,0,0.05)", zIndex: 60 }}
        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }} title="Add image">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#79716B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
        </svg>
      </motion.button>

      <motion.button onClick={addText}
        className="absolute flex items-center justify-center rounded-full"
        style={{ top: 14, right: 56, width: 32, height: 32, background: "rgba(255,255,255,0.94)", boxShadow: "0 1px 6px rgba(0,0,0,0.09)", border: "1.5px solid rgba(0,0,0,0.05)", zIndex: 60, fontSize: 14, fontWeight: 700, color: "#57534E", fontFamily: "Georgia, serif" }}
        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }} title="Add text">T
      </motion.button>

      <motion.button onClick={onStickerPanelOpen}
        className="absolute flex items-center justify-center rounded-full"
        style={{ top: 14, right: 96, width: 32, height: 32, background: "rgba(255,255,255,0.94)", boxShadow: "0 1px 6px rgba(0,0,0,0.09)", border: "1.5px solid rgba(0,0,0,0.05)", zIndex: 60 }}
        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }} title="Sticker library">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#79716B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" /><line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
        </svg>
      </motion.button>

      <button onClick={onStartDrawing}
        className="absolute flex items-center justify-center rounded-full"
        style={{ top: 14, right: 136, width: 32, height: 32, background: drawingActive ? "#1E1E1E" : "rgba(255,255,255,0.94)", boxShadow: "0 1px 6px rgba(0,0,0,0.09)", border: "1.5px solid rgba(0,0,0,0.05)", zIndex: 60, color: drawingActive ? "#FFFFFF" : "#79716B" }}
        title="Freehand Drawing">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l5 5" /></svg>
      </button>

      {/* Layers */}
      <div style={{ position: "absolute", inset: 0, zIndex: 45, pointerEvents: "none" }}>
        <MoodboardImageLayer albumId={albumId} images={moodboardImages} pageIndex={pageIndex}
          containerWidth={width} containerHeight={height} onImagesChange={onMoodboardImagesChange} />
      </div>
      <div style={{ position: "absolute", inset: 0, zIndex: 55, pointerEvents: "none" }}>
        <MoodboardTextLayer albumId={albumId} pageIndex={pageIndex} texts={moodboardTexts}
          containerWidth={width} containerHeight={height} onTextsChange={onMoodboardTextsChange} />
      </div>
      {drawings[pageIndex] && !drawingActive && (
        <div className="absolute inset-0 z-[58] pointer-events-none">
          <img src={drawings[pageIndex]} alt="drawing" className="w-full h-full object-contain" />
        </div>
      )}
      {drawingActive && (
        <DrawingLayer width={width} height={height} initialDataUrl={drawings?.[pageIndex]}
          onSave={(dataUrl: string) => onDrawingSave(pageIndex, dataUrl)}
          onClose={() => onStopDrawing()} />
      )}
      <div style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none" }}>
        <StickerLayer stickers={stickers} pageIndex={pageIndex}
          containerWidth={width} containerHeight={height} onStickersChange={onStickersChange} />
      </div>
    </div>
  );
}

function TemplatePreview({ templateId }: { templateId: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const W = 90;
  const H = 120;
  const px = 8;
  const py = 8;
  const gw = W - px * 2;
  const gh = H - py * 2;
  const gap = 3;
  const slotFill = "rgb(200,200,200)";
  const slotBg = "rgb(255,255,255)";
  type R = { x: number; y: number; w: number; h: number };
  const slots: R[] = [];

  if (templateId === 5) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} rx={5} fill="rgb(240,240,240)" />
      </svg>
    );
  }

  if (templateId === 6) {
    // Full-spread single canvas — show as wide rectangle with a centre line hint
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} rx={5} fill="rgb(240,240,240)" />
        {/* spine hint */}
        <line x1={W / 2} y1={py} x2={W / 2} y2={H - py} stroke="rgb(200,200,200)" strokeWidth={1} strokeDasharray="3 2" />
        <text x={W / 2} y={H / 2 + 4} textAnchor="middle" fontSize={9} fill="rgb(160,160,160)" fontFamily="sans-serif">full spread</text>
      </svg>
    );
  }

  if (templateId === 1) {
    const sw = (gw - gap * 2) / 3;
    const sh = (gh - gap * 2) / 3;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        slots.push({ x: px + c * (sw + gap), y: py + r * (sh + gap), w: sw, h: sh });
  } else if (templateId === 2) {
    const sw = (gw - gap) / 2;
    const sh = (gh - gap * 2) / 3;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++)
        slots.push({ x: px + c * (sw + gap), y: py + r * (sh + gap), w: sw, h: sh });
  } else if (templateId === 3) {
    const cw = (gw - gap) / 2;
    const lth = Math.round(gh * (344 / 554));
    const lbh = gh - lth - gap;
    const rth = Math.round(gh * (170 / 554));
    const rbh = gh - rth - gap;
    slots.push(
      { x: px, y: py, w: cw, h: lth },
      { x: px, y: py + lth + gap, w: cw, h: lbh },
      { x: px + cw + gap, y: py, w: cw, h: rth },
      { x: px + cw + gap, y: py + rth + gap, w: cw, h: rbh },
    );
  } else {
    const cw = (gw - gap) / 2;
    const toph = Math.round(gh * (344 / 554));
    const both = gh - toph - gap;
    slots.push(
      { x: px, y: py, w: gw, h: toph },
      { x: px, y: py + toph + gap, w: cw, h: both },
      { x: px + cw + gap, y: py + toph + gap, w: cw, h: both },
    );
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect width={W} height={H} rx={5} fill={slotBg} />
      {slots.map((s, i) => (
        <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={2} fill={slotFill} />
      ))}
    </svg>
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
      className="flex items-center justify-center rounded-full"
      style={{
        width: 44, height: 44,
        background: "rgba(224,244,255,0.75)",
        boxShadow: "0 2px 14px rgba(51,74,82,0.12)",
        border: "1px solid rgba(180,235,255,0.55)",
        cursor: disabled ? "default" : "pointer",
        flexShrink: 0,
      }}
      animate={{ opacity: disabled ? 0.28 : 1 }}
      whileHover={!disabled ? { scale: 1.1, boxShadow: "0 4px 20px rgba(0,0,0,0.17)" } : {}}
      whileTap={!disabled ? { scale: 0.91 } : {}}
      transition={{ duration: 0.15 }}
    >
      {direction === "prev"
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334a52" strokeWidth="2.3" strokeLinecap="round" style={rotated ? { transform: "rotate(-90deg)" } : undefined}><polyline points="15 18 9 12 15 6" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334a52" strokeWidth="2.3" strokeLinecap="round" style={rotated ? { transform: "rotate(-90deg)" } : undefined}><polyline points="9 18 15 12 9 6" /></svg>
      }
    </motion.button>
  );
}

