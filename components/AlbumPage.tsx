"use client";

import React, { forwardRef, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import ImageSlot from "./ImageSlot";
import StickerLayer from "./StickerLayer";
import MoodboardImageLayer from "./MoodboardImageLayer";
import MoodboardTextLayer from "./MoodboardTextLayer";
import DrawingLayer from "./DrawingLayer";
import { Sticker, MoodboardImage, MoodboardText } from "@/lib/types";

// ─── Figma-exact dimensions ──────────────────────────────────────────────────
export const PAGE_W = 478;
export const PAGE_H = 650;

const GRID_X = 28;
const GRID_Y = 47;
const GRID_W = 416;
const GRID_H = 554;
const COLS = 3;
const ROWS = 3;
const COL_GAP = 8;
const ROW_GAP = 10;

const SLOT_W = (GRID_W - (COLS - 1) * COL_GAP) / COLS;
const SLOT_H = (GRID_H - (ROWS - 1) * ROW_GAP) / ROWS;
const INNER_PAD_X = 5;
const INNER_PAD_Y = 6;

export const SLOT_ASPECT = SLOT_W / SLOT_H;

// ─── Template slot helpers ────────────────────────────────────────────────────
const SLOT_COL_W = Math.floor((GRID_W - COL_GAP) / 2); // 204
const SLOT_COL2_X = SLOT_COL_W + COL_GAP;              // 212
const T3_LT_H = 344;
const T3_RT_H = 170;
const T4_TOP_H = 344;

type SlotDef = { x: number; y: number; w: number; h: number };

function getSlotDefs(templateId: number, isLeft: boolean): SlotDef[] {
  if (templateId === 2) {
    return Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: 2 }, (_, c) => ({
        x: c * (SLOT_COL_W + COL_GAP),
        y: r * (SLOT_H + ROW_GAP),
        w: SLOT_COL_W,
        h: SLOT_H,
      }))
    ).flat();
  }
  if (templateId === 3) {
    return [
      { x: 0, y: 0, w: SLOT_COL_W, h: T3_LT_H },
      { x: 0, y: T3_LT_H + ROW_GAP, w: SLOT_COL_W, h: GRID_H - T3_LT_H - ROW_GAP },
      { x: SLOT_COL2_X, y: 0, w: SLOT_COL_W, h: T3_RT_H },
      { x: SLOT_COL2_X, y: T3_RT_H + ROW_GAP, w: SLOT_COL_W, h: GRID_H - T3_RT_H - ROW_GAP },
    ];
  }
  if (templateId === 4) {
    const BOT_H = GRID_H - T4_TOP_H - ROW_GAP;
    if (!isLeft) {
      return [
        { x: 0, y: 0, w: SLOT_COL_W, h: BOT_H },
        { x: SLOT_COL2_X, y: 0, w: SLOT_COL_W, h: BOT_H },
        { x: 0, y: BOT_H + ROW_GAP, w: GRID_W, h: T4_TOP_H },
      ];
    }
    return [
      { x: 0, y: 0, w: GRID_W, h: T4_TOP_H },
      { x: 0, y: T4_TOP_H + ROW_GAP, w: SLOT_COL_W, h: BOT_H },
      { x: SLOT_COL2_X, y: T4_TOP_H + ROW_GAP, w: SLOT_COL_W, h: BOT_H },
    ];
  }
  // Template 1 (default)
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({
      x: c * (SLOT_W + COL_GAP),
      y: r * (SLOT_H + ROW_GAP),
      w: SLOT_W,
      h: SLOT_H,
    }))
  ).flat();
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface AlbumPageProps {
  albumId: string;
  pageIndex: number;
  isLeft: boolean;
  images: Record<number, string>;
  stickers: Sticker[];
  onSlotClick: (pageIndex: number, slotIndex: number) => void;
  onSlotDrop: (file: File, pageIndex: number, slotIndex: number) => void;
  onStickersChange: (stickers: Sticker[]) => void;
  /** Called when the sticker emoji button is tapped – parent opens StickerPanel */
  onStickerPanelOpen: (pageIndex: number) => void;
  pageNumber: number;
  templateId?: 1 | 2 | 3 | 4 | 5;
  moodboardImages?: MoodboardImage[];
  onMoodboardImagesChange?: (imgs: MoodboardImage[]) => void;
  moodboardTexts?: MoodboardText[];
  onMoodboardTextsChange?: (txts: MoodboardText[]) => void;
  bgImageUrl?: string | null;
  drawings?: Record<number, string>;
  onDrawingSave?: (pageIndex: number, dataUrl: string) => void;
  isDrawingActive?: boolean;
  onStartDrawing?: (pageIndex: number) => void;
  onStopDrawing?: (onStop: () => void) => void;
  /** Hide toolbar UI buttons (used during export/share capture) */
  hideUI?: boolean;
  /** Disable contain/transform optimisations so html2canvas captures correctly */
  forExport?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────
const AlbumPage = forwardRef<HTMLDivElement, AlbumPageProps>(
  (
    {
      albumId,
      pageIndex,
      isLeft,
      images,
      stickers,
      onSlotClick,
      onSlotDrop,
      onStickersChange,
      onStickerPanelOpen,
      pageNumber,
      templateId = 1,
      moodboardImages = [],
      onMoodboardImagesChange,
      moodboardTexts = [],
      onMoodboardTextsChange,
      bgImageUrl,
      drawings = {},
      onDrawingSave,
      isDrawingActive,
      onStartDrawing,
      onStopDrawing,
      hideUI = false,
      forExport = false,
    },
    ref
  ) => {
    const [localMoodboardImages, setLocalMoodboardImages] = useState<MoodboardImage[]>([]);
    const [localMoodboardTexts, setLocalMoodboardTexts] = useState<MoodboardText[]>([]);
    // ── Moodboard "Add Image" file input (template 5 only) ─────────────────
    const mbFileInputRef = useRef<HTMLInputElement>(null);

    const addMoodboardImageFromFile = useCallback(
      (file: File) => {
        if (!file.type.startsWith("image/") || !onMoodboardImagesChange) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (!dataUrl) return;
          const img = new window.Image();
          img.onload = () => {
            // Default size: fit within 240×180, preserving aspect ratio
            const maxW = 240, maxH = 180;
            const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
            const w = Math.round(img.naturalWidth * ratio);
            const h = Math.round(img.naturalHeight * ratio);
            // Centered placement
            const x = Math.round((PAGE_W - w) / 2);
            const y = Math.round((PAGE_H - h) / 2);
            const nextZ = moodboardImages.reduce((max, entry) => Math.max(max, entry.zIndex ?? 1), 1) + 1;
            const newImg: MoodboardImage = {
              id: `mb-${albumId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              albumId,
              pageIndex,
              src: dataUrl,
              x, y, width: w, height: h,
              rotation: 0,
              zIndex: nextZ,
            };
            onMoodboardImagesChange([...moodboardImages, newImg]);
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      },
      [albumId, moodboardImages, onMoodboardImagesChange, pageIndex],
    );

    const handleMbFileSelect = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        addMoodboardImageFromFile(file);
        e.target.value = "";
      },
      [addMoodboardImageFromFile],
    );

    const handleMbDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
    }, []);

    const handleMbDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        addMoodboardImageFromFile(file);
        return;
      }

      const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      const cleaned = uri.split("\n").find((line) => line && !line.startsWith("#"))?.trim();
      if (!cleaned) return;

      fetch(cleaned)
        .then((res) => res.blob())
        .then((blob) => {
          if (!blob.type.startsWith("image/")) return;
          const name = cleaned.split("/").pop()?.split("?")[0] || "dropped-image";
          const dropped = new File([blob], name, { type: blob.type });
          addMoodboardImageFromFile(dropped);
        })
        .catch(() => { });
    }, [addMoodboardImageFromFile]);

    const handleAddMoodboardText = useCallback(() => {
      if (!onMoodboardTextsChange) return;
      const nextZ = moodboardTexts.reduce((max, entry) => Math.max(max, entry.zIndex ?? 1), 1) + 1;
      const newText: MoodboardText = {
        id: `mbtxt-${albumId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        albumId,
        pageIndex,
        text: "Text",
        x: Math.round(PAGE_W * 0.35),
        y: Math.round(PAGE_H * 0.45),
        width: 180,
        fontSize: 28,
        fontFamily: "'Dancing Script', cursive",
        fontWeight: "normal" as const,
        fontStyle: "normal" as const,
        color: "#3F3F46",
        rotation: 0,
        zIndex: nextZ,
      };
      onMoodboardTextsChange([...moodboardTexts, newText]);
    }, [albumId, moodboardTexts, onMoodboardTextsChange, pageIndex]);

    if (templateId === 5) {
      return (
        <div
          ref={ref}
          className="album-page"
          onDragOver={handleMbDragOver}
          onDrop={handleMbDrop}
          style={{
            width: PAGE_W,
            height: PAGE_H,
            background: "#FFFFFF",
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
            isolation: forExport ? undefined : "isolate",
            backfaceVisibility: forExport ? undefined : "hidden",
            WebkitBackfaceVisibility: forExport ? undefined : "hidden",
            transform: forExport ? undefined : "translateZ(0)",
            contain: forExport ? undefined : "strict",
          }}
        >
          {/* Hidden file input for moodboard images */}
          <input
            ref={mbFileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleMbFileSelect}
          />

          {/* Add Image button */}
          <motion.button
            onClick={() => mbFileInputRef.current?.click()}
            className="absolute flex items-center justify-center rounded-full"
            style={{
              top: 14,
              right: isLeft ? 96 : undefined,
              left: isLeft ? undefined : 96,
              width: 32,
              height: 32,
              background: "rgba(255,255,255,0.94)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.09)",
              border: "1.5px solid rgba(0,0,0,0.05)",
              zIndex: 60,
              display: hideUI ? "none" : undefined,
            }}
            whileHover={{ scale: 1.1, boxShadow: "0 3px 12px rgba(0,0,0,0.14)" }}
            whileTap={{ scale: 0.92 }}
            title="Add image"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#79716B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </motion.button>

          {/* Add Text button */}
          <motion.button
            onClick={handleAddMoodboardText}
            className="absolute flex items-center justify-center rounded-full"
            style={{
              top: 14,
              right: isLeft ? 56 : undefined,
              left: isLeft ? undefined : 56,
              width: 32,
              height: 32,
              background: "rgba(255,255,255,0.94)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.09)",
              border: "1.5px solid rgba(0,0,0,0.05)",
              zIndex: 60,
              fontSize: 14,
              fontWeight: 700,
              color: "#57534E",
              fontFamily: "Georgia, serif",
              display: hideUI ? "none" : undefined,
            }}
            whileHover={{ scale: 1.1, boxShadow: "0 3px 12px rgba(0,0,0,0.14)" }}
            whileTap={{ scale: 0.92 }}
            title="Add text"
          >
            T
          </motion.button>

          {/* Sticker panel button */}
          <motion.button
            onClick={() => onStickerPanelOpen(pageIndex)}
            className="absolute flex items-center justify-center rounded-full"
            style={{
              top: 14,
              right: isLeft ? 16 : undefined,
              left: isLeft ? undefined : 16,
              width: 32,
              height: 32,
              background: "rgba(255,255,255,0.94)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.09)",
              border: "1.5px solid rgba(0,0,0,0.05)",
              zIndex: 60,
              display: hideUI ? "none" : undefined,
            }}
            whileHover={{ scale: 1.1, boxShadow: "0 3px 12px rgba(0,0,0,0.14)" }}
            whileTap={{ scale: 0.92 }}
            title="Sticker library"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#79716B"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
              <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
            </svg>
          </motion.button>

          {/* Pencil (Drawing) button */}
          <button
            onClick={() => onStartDrawing?.(pageIndex)}
            className="absolute flex items-center justify-center rounded-full"
            style={{
              top: 14,
              right: isLeft ? 136 : undefined,
              left: isLeft ? undefined : 136,
              width: 32,
              height: 32,
              background: isDrawingActive ? "#1E1E1E" : "rgba(255,255,255,0.94)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.09)",
              border: "1.5px solid rgba(0,0,0,0.05)",
              zIndex: 60,
              color: isDrawingActive ? "#FFFFFF" : "#79716B",
              display: hideUI ? "none" : undefined,
            }}
            title="Freehand Drawing"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l5 5"/></svg>
          </button>

          {/* Moodboard images layer (below stickers/washi) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 45,
              pointerEvents: "none",
            }}
          >
            <MoodboardImageLayer
              albumId={albumId}
              images={moodboardImages}
              pageIndex={pageIndex}
              containerWidth={PAGE_W}
              containerHeight={PAGE_H}
              onImagesChange={onMoodboardImagesChange ?? (() => { })}
              forExport={forExport}
            />
          </div>

          {/* Moodboard text layer — above stickers (50) and moodboard images (45) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 55,
              pointerEvents: "none",
            }}
          >
            <MoodboardTextLayer
              albumId={albumId}
              pageIndex={pageIndex}
              texts={moodboardTexts}
              containerWidth={PAGE_W}
              containerHeight={PAGE_H}
              onTextsChange={onMoodboardTextsChange ?? (() => { })}
            />
          </div>

          {/* Saved Drawing Layer (non-interactive display) */}
          {drawings[pageIndex] && !isDrawingActive && (
            <div className="absolute inset-0 z-[58] pointer-events-none">
              <img 
                src={drawings[pageIndex]} 
                alt="drawing" 
                className="w-full h-full object-contain" 
              />
            </div>
          )}

          {/* Active Drawing Layer (full interactive canvas) */}
          {isDrawingActive && (
            <DrawingLayer
              width={PAGE_W}
              height={PAGE_H}
              initialDataUrl={drawings?.[pageIndex]}
              onSave={(dataUrl) => onDrawingSave?.(pageIndex, dataUrl)}
              onClose={() => onStopDrawing?.(() => {})}
            />
          )}

          {/* Sticker layer */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 50,
              pointerEvents: "none",
            }}
          >
            <StickerLayer
              stickers={stickers}
              pageIndex={pageIndex}
              containerWidth={PAGE_W}
              containerHeight={PAGE_H}
              onStickersChange={onStickersChange}
              forExport={forExport}
            />
          </div>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className="album-page"
        style={{
          width: PAGE_W,
          height: PAGE_H,
          background: "#FFFFFF",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
          isolation: forExport ? undefined : "isolate",
          backfaceVisibility: forExport ? undefined : "hidden",
          WebkitBackfaceVisibility: forExport ? undefined : "hidden",
          transform: forExport ? undefined : "translateZ(0)",
          contain: forExport ? undefined : "strict",
        }}
      >
        {/* ── Page-edge gradient ───────────────────────────────────── z:1 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isLeft
              ? "linear-gradient(to right, rgba(245,243,241,0.55) 0%, transparent 12%)"
              : "linear-gradient(to left,  rgba(245,243,241,0.55) 0%, transparent 12%)",
            zIndex: 1,
          }}
        />

        {/* ── Top paper texture ────────────────────────────────────── z:1 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(180deg, rgba(250,249,247,0.4) 0%, transparent 30%)",
            zIndex: 1,
          }}
        />

        {/* ── Sticker button ───────────────────────────────────────── z:60 */}
        <motion.button
          onClick={() => onStickerPanelOpen(pageIndex)}
          className="absolute flex items-center justify-center rounded-full"
          style={{
            top: 14,
            right: isLeft ? 16 : undefined,
            left: isLeft ? undefined : 16,
            width: 32,
            height: 32,
            background: "rgba(255,255,255,0.94)",
            boxShadow: "0 1px 6px rgba(0,0,0,0.09)",
            border: "1.5px solid rgba(0,0,0,0.05)",
            zIndex: 60,
            display: hideUI ? "none" : undefined,
          }}
          whileHover={{ scale: 1.1, boxShadow: "0 3px 12px rgba(0,0,0,0.14)" }}
          whileTap={{ scale: 0.92 }}
          title="Sticker library"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#79716B"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
            <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
          </svg>
        </motion.button>

        {/* ── Photo grid ───────────────────────────────────────────── z:2 */}
        <div
          className="absolute"
          style={{
            left: GRID_X,
            top: GRID_Y,
            width: GRID_W,
            height: GRID_H,
            zIndex: 2,
          }}
        >
          <GridLines templateId={templateId} isLeft={isLeft} />

          {getSlotDefs(templateId, isLeft).map((slot, slotIndex) => (
            <div
              key={slotIndex}
              className="absolute"
              style={{ left: slot.x + INNER_PAD_X, top: slot.y + INNER_PAD_Y }}
            >
              <ImageSlot
                imageUrl={images[slotIndex] ?? null}
                onClick={() => onSlotClick(pageIndex, slotIndex)}
                onDropFile={(file) => onSlotDrop(file, pageIndex, slotIndex)}
                slotWidth={slot.w - INNER_PAD_X * 2}
                slotHeight={slot.h - INNER_PAD_Y * 2}
              />
            </div>
          ))}
        </div>

        {/* ── Sticker layer ────────────────────────────── z:50 (above all) */}
        {/*
            FIX: Use position:absolute + zIndex:50 so stickers always
            render above photos (z:2) and the page-number (z:4).
            StickerLayer itself is also position:absolute inset-0.
        */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            pointerEvents: "none", // layer itself passes events through
          }}
        >
          <StickerLayer
            stickers={stickers}
            pageIndex={pageIndex}
            containerWidth={PAGE_W}
            containerHeight={PAGE_H}
            onStickersChange={onStickersChange}
            forExport={forExport}
          />
        </div>

        {/* ── Page number ──────────────────────────────────────────── z:4 */}
        <div
          className="absolute font-sans"
          style={{
            bottom: 20,
            right: isLeft ? 24 : undefined,
            left: isLeft ? undefined : 24,
            fontSize: 12,
            color: "#717182",
            letterSpacing: "0.04em",
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          {pageNumber}
        </div>

        {/* ── Spine line ───────────────────────────────────────────── z:3 */}
        <div
          className="absolute top-0 bottom-0 w-px pointer-events-none"
          style={{
            [isLeft ? "right" : "left"]: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.07) 0%, rgba(0,0,0,0.04) 100%)",
            zIndex: 3,
          }}
        />
      </div>
    );
  }
);

AlbumPage.displayName = "AlbumPage";
export default AlbumPage;

// ─── Grid Lines ──────────────────────────────────────────────────────────────
function GridLines({ templateId = 1, isLeft = false }: { templateId?: number; isLeft?: boolean }) {
  const c = "rgba(233,233,233,1)";
  const svgProps = {
    className: "absolute inset-0 pointer-events-none",
    width: GRID_W, height: GRID_H,
    style: { overflow: "visible" as const, zIndex: 1 },
  };

  if (templateId === 2) {
    const midX = SLOT_COL_W + COL_GAP / 2;
    return (
      <svg {...svgProps}>
        <line x1={midX} y1={0} x2={midX} y2={GRID_H} stroke={c} strokeWidth={1} />
        {Array.from({ length: ROWS - 1 }).map((_, i) => {
          const y = (i + 1) * (SLOT_H + ROW_GAP) - ROW_GAP / 2;
          return <line key={i} x1={0} y1={y} x2={GRID_W} y2={y} stroke={c} strokeWidth={1} />;
        })}
      </svg>
    );
  }

  if (templateId === 3) {
    const midX = SLOT_COL_W + COL_GAP / 2;
    return (
      <svg {...svgProps}>
        <line x1={midX} y1={0} x2={midX} y2={GRID_H} stroke={c} strokeWidth={1} />
        <line x1={0} y1={T3_LT_H + ROW_GAP / 2} x2={SLOT_COL_W} y2={T3_LT_H + ROW_GAP / 2} stroke={c} strokeWidth={1} />
        <line x1={SLOT_COL2_X} y1={T3_RT_H + ROW_GAP / 2} x2={GRID_W} y2={T3_RT_H + ROW_GAP / 2} stroke={c} strokeWidth={1} />
      </svg>
    );
  }

  if (templateId === 4) {
    const BOT_H = GRID_H - T4_TOP_H - ROW_GAP;
    const midX = SLOT_COL_W + COL_GAP / 2;
    const divY = isLeft ? T4_TOP_H + ROW_GAP / 2 : BOT_H + ROW_GAP / 2;
    const vY1 = isLeft ? T4_TOP_H + ROW_GAP : 0;
    const vY2 = isLeft ? GRID_H : BOT_H;
    return (
      <svg {...svgProps}>
        <line x1={0} y1={divY} x2={GRID_W} y2={divY} stroke={c} strokeWidth={1} />
        <line x1={midX} y1={vY1} x2={midX} y2={vY2} stroke={c} strokeWidth={1} />
      </svg>
    );
  }

  // Template 1 (original)
  const lineColor = c;
  const verticals = Array.from({ length: COLS - 1 }).map((_, i) => ({
    x: (i + 1) * (SLOT_W + COL_GAP) - COL_GAP / 2,
  }));
  const horizontals = Array.from({ length: ROWS - 1 }).map((_, i) => ({
    y: (i + 1) * (SLOT_H + ROW_GAP) - ROW_GAP / 2,
  }));
  return (
    <svg {...svgProps}>
      {verticals.map((v, i) => (
        <line key={`v${i}`} x1={v.x} y1={0} x2={v.x} y2={GRID_H} stroke={lineColor} strokeWidth={1} />
      ))}
      {horizontals.map((h, i) => (
        <line key={`h${i}`} x1={0} y1={h.y} x2={GRID_W} y2={h.y} stroke={lineColor} strokeWidth={1} />
      ))}
    </svg>
  );
}
