"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
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
} from "@/lib/db";

const TOTAL_PAGES = 20;

export default function AlbumBook() {
  const bookRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cornerTapRef = useRef<{ x: number; y: number; time: number } | null>(null);

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

  // ── Load + migrate ────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [imgs, stks, libStks] = await Promise.all([
          getAllImages(),
          getAllStickers(),
          getAllLibraryStickers(),
        ]);

        const imgMap: Record<string, string> = {};
        imgs.forEach((img) => { imgMap[`${img.pageIndex}-${img.slotIndex}`] = img.dataUrl; });
        setImages(imgMap);
        const legacyLibraryStickers = stks.filter((s) => s.pageIndex === -1);
        const placedStickers = stks.filter((s) => s.pageIndex !== -1);
        setStickers(placedStickers);

        // Migrate legacy sentinel stickers into the dedicated library store,
        // then remove all legacy sentinel records so they cannot reappear.
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
      } catch (e) {
        console.error("Load error:", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ── Responsive scale ──────────────────────────────────────────────────────
  useEffect(() => {
    function compute() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setBookScale(Math.min(1.1, (window.innerWidth - 16) / PAGE_W));
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

  // ── Image upload ──────────────────────────────────────────────────────────
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

  const pageSequence = Array.from({ length: TOTAL_PAGES }, (_, i) => i);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    const pf = bookRef.current?.pageFlip();
    if (!pf) return;
    if (isMobile) {
      const target = Math.min(TOTAL_PAGES - 1, currentPage + 1);
      pf.flip(target);
      return;
    }
    pf.flipNext();
  }, [currentPage, isMobile]);
  const goPrev = useCallback(() => {
    const pf = bookRef.current?.pageFlip();
    if (!pf) return;
    if (isMobile) {
      const idx = pf.getCurrentPageIndex();
      if (idx <= 0) return;
      const target = idx - 1;
      pf.flip(target);
      return;
    }
    pf.flipPrev();
  }, [currentPage, isMobile]);

  const getPageImages = useCallback((pi: number): Record<number, string> => {
    const r: Record<number, string> = {};
    for (let i = 0; i < 9; i++) { const v = images[`${pi}-${i}`]; if (v) r[i] = v; }
    return r;
  }, [images]);

  const spreadIndex = isMobile ? currentPage : Math.floor(currentPage / 2);
  const totalSpreads = isMobile ? TOTAL_PAGES : Math.ceil(TOTAL_PAGES / 2);
  const atStart = currentPage === 0;
  const atEnd = isMobile
    ? currentPage >= TOTAL_PAGES - 1
    : currentPage >= TOTAL_PAGES - 2;

  const bookNaturalW = isMobile ? PAGE_W : PAGE_W * 2;
  const visualW = bookNaturalW * bookScale;
  const visualH = PAGE_H * bookScale;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen"
        style={{ background: "linear-gradient(135deg,#F5F5F4 0%,#E7E5E4 100%)" }}>
        <motion.div className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <motion.div className="w-9 h-9 rounded-full border-[2.5px] border-stone-300 border-t-stone-500"
            animate={{ rotate: 360 }} transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }} />
          <p className="text-stone-500 text-sm font-medium font-sans tracking-wide">Opening your album…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full min-h-screen select-none"
      style={{ background: "linear-gradient(160deg,#F5F5F4 0%,#EAE8E6 60%,#E2DFDC 100%)" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.header className="w-full flex items-center justify-between px-6 pt-6 pb-3"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.4 }}>
        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#79716B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span className="font-serif text-lg tracking-wide" style={{ color: "#57534E", fontWeight: 500 }}>
            My Photo Album
          </span>
        </div>
        <span className="text-xs font-sans" style={{ color: "#A8A29E" }}>
          {Object.keys(images).length} / {TOTAL_PAGES * 9} photos
        </span>
      </motion.header>

      {/* ── Book Stage ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center w-full px-4">
        <div className="flex items-center justify-center gap-5">

          {/* LEFT ARROW */}
          <div style={{ flexShrink: 0, position: "relative", zIndex: 200 }}>
            <NavButton direction="prev" onClick={goPrev} disabled={atStart} />
          </div>

          {/* BOOK */}
          <motion.div
            className="relative flex-shrink-0"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.12, type: "spring", stiffness: 180, damping: 24 }}
            style={{ width: visualW, height: visualH }}
            onPointerDown={(e) => {
              if ((e.target as Element).closest?.("[data-sticker]")) return;
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
              const pf = bookRef.current?.pageFlip();
              const liveIndex = pf ? pf.getCurrentPageIndex() : currentPage;
              const mobileAtStart = isMobile ? liveIndex <= 0 : atStart;
              const mobileAtEnd = isMobile ? liveIndex >= TOTAL_PAGES - 1 : atEnd;

              const rightClear = isMobile
                ? Math.max(44, Math.floor(rect.width * 0.2))
                : Math.max(20, Math.floor(34 * bookScale));
              const leftClear = isMobile
                ? Math.max(44, Math.floor(rect.width * 0.2))
                : Math.max(18, Math.floor(28 * bookScale));
              const bottomClear = isMobile
                ? Math.max(44, Math.floor(rect.height * 0.22))
                : Math.max(28, Math.floor(49 * bookScale));

              const inBottomStrip = cy > rect.height - bottomClear;
              const inMobileBottomHalf = isMobile && cy > rect.height * 0.55;
              if ((inBottomStrip || inMobileBottomHalf) && cx > rect.width - rightClear && !mobileAtEnd) goNext();
              else if ((inBottomStrip || inMobileBottomHalf) && cx < leftClear && !mobileAtStart) goPrev();
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
              {!isMobile && (
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
                  key={isMobile ? "flip-mobile" : "flip-desktop"}
                  ref={bookRef}
                  width={PAGE_W}
                  height={PAGE_H}
                  size="fixed"
                  minWidth={PAGE_W} maxWidth={PAGE_W}
                  minHeight={PAGE_H} maxHeight={PAGE_H}
                  drawShadow={true}
                  flippingTime={720}
                  usePortrait={isMobile}
                  startPage={0}
                  showCover={false}
                  mobileScrollSupport={isMobile}
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
          </motion.div>

          {/* RIGHT ARROW */}
          <div style={{ flexShrink: 0, position: "relative", zIndex: 200 }}>
            <NavButton direction="next" onClick={goNext} disabled={atEnd} />
          </div>

        </div>
      </div>

      {/* ── Pagination dots ─────────────────────────────────────────────── */}
      <motion.div className="flex flex-col items-center gap-2.5 pb-7 pt-3"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSpreads }).map((_, i) => (
            <motion.button key={i}
              className="rounded-full border-none p-0 cursor-pointer"
              onClick={() => {
                const target = isMobile ? i : i * 2;
                if (isMobile) {
                  const pf = bookRef.current?.pageFlip();
                  if (!pf) return;
                  const current = pf.getCurrentPageIndex();
                  if (target !== current) pf.flip(target);
                  return;
                }
                const diff = target - currentPage;
                if (diff === 0) return;
                const stepSize = isMobile ? 1 : 2;
                const steps = Math.abs(diff / stepSize);
                const fn = diff > 0 ? goNext : goPrev;
                for (let j = 0; j < steps; j++) setTimeout(fn, j * 740);
              }}
              animate={{ width: i === spreadIndex ? 20 : 6, background: i === spreadIndex ? "#79716B" : "#C8C4C0" }}
              style={{ height: 6, borderRadius: 999 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            />
          ))}
        </div>
        <p className="text-xs font-sans tracking-wide" style={{ color: "#A8A29E" }}>
          Spread {spreadIndex + 1} / {totalSpreads}
        </p>
      </motion.div>

      {/* ── Onboarding tip ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {!isLoading && Object.keys(images).length === 0 && (
          <motion.div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-sans whitespace-nowrap"
            style={{ background: "rgba(87,83,78,0.90)", color: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", zIndex: 40 }}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ delay: 0.6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            Tap any slot to add a photo · Tap 😊 to add stickers
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hidden file input ────────────────────────────────────────────── */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {/* ── Modals ───────────────────────────────────────────────────────── */}
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

// ── NavButton ─────────────────────────────────────────────────────────────────
function NavButton({ direction, onClick, disabled }: {
  direction: "prev" | "next";
  onClick: () => void;
  disabled: boolean;
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
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#57534E" strokeWidth="2.3" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#57534E" strokeWidth="2.3" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
      }
    </motion.button>
  );
}
