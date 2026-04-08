"use client";

import React, { forwardRef } from "react";
import { motion } from "framer-motion";
import ImageSlot from "./ImageSlot";
import StickerLayer from "./StickerLayer";
import { Sticker } from "@/lib/types";

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
      { x: 0,          y: 0,                       w: SLOT_COL_W, h: T3_LT_H },
      { x: 0,          y: T3_LT_H + ROW_GAP,       w: SLOT_COL_W, h: GRID_H - T3_LT_H - ROW_GAP },
      { x: SLOT_COL2_X, y: 0,                       w: SLOT_COL_W, h: T3_RT_H },
      { x: SLOT_COL2_X, y: T3_RT_H + ROW_GAP,       w: SLOT_COL_W, h: GRID_H - T3_RT_H - ROW_GAP },
    ];
  }
  if (templateId === 4) {
    const BOT_H = GRID_H - T4_TOP_H - ROW_GAP;
    if (!isLeft) {
      return [
        { x: 0,          y: 0,               w: SLOT_COL_W, h: BOT_H },
        { x: SLOT_COL2_X, y: 0,              w: SLOT_COL_W, h: BOT_H },
        { x: 0,          y: BOT_H + ROW_GAP, w: GRID_W,     h: T4_TOP_H },
      ];
    }
    return [
      { x: 0,          y: 0,                 w: GRID_W,     h: T4_TOP_H },
      { x: 0,          y: T4_TOP_H + ROW_GAP, w: SLOT_COL_W, h: BOT_H },
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
}

// ─── Component ───────────────────────────────────────────────────────────────
const AlbumPage = forwardRef<HTMLDivElement, AlbumPageProps>(
  (
    {
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
    },
    ref
  ) => {
    if (templateId === 5) {
      return (
        <div
          ref={ref}
          className="album-page"
          style={{
            width: PAGE_W,
            height: PAGE_H,
            background: "#F3F2F0",
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
            isolation: "isolate",
          }}
        >
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
              zIndex: 5,
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
          // Creates an isolated stacking context so that child z-indices
          // (e.g. stickers at z:50) are self-contained and cannot paint
          // above sibling pages during the react-pageflip 3D transition.
          isolation: "isolate",
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

        {/* ── Sticker button ───────────────────────────────────────── z:5 */}
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
            zIndex: 5,
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
    const divY  = isLeft ? T4_TOP_H + ROW_GAP / 2 : BOT_H + ROW_GAP / 2;
    const vY1   = isLeft ? T4_TOP_H + ROW_GAP : 0;
    const vY2   = isLeft ? GRID_H : BOT_H;
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
