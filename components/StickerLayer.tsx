"use client";

import React, { useEffect, useLayoutEffect, useCallback, useRef, useState, startTransition } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
} from "framer-motion";
import { Sticker } from "@/lib/types";
import { saveSticker, deleteSticker } from "@/lib/db";
// MOBILE FIX: shared flag so ImageSlot can suppress ghost clicks from sticker taps
import { markStickerPress } from "@/lib/stickerInteraction";

// ── Rotate zone constants (mirrors MoodboardImageLayer) ──────────────────────
const ROT_SIZE = 26;  // invisible rotate hit-area size (px)
const ROT_OFF = 30;  // distance outside corner (positive = outside element)

// ─── StickerLayer ─────────────────────────────────────────────────────────────
interface StickerLayerProps {
  stickers: Sticker[];
  pageIndex: number;
  containerWidth: number;
  containerHeight: number;
  onStickersChange: (stickers: Sticker[]) => void;
  forExport?: boolean;
}

export default function StickerLayer(props: StickerLayerProps) {
  const { stickers, pageIndex, containerWidth, containerHeight, onStickersChange, forExport = false } = props;
  const pageStickers = stickers.filter((s) => s.pageIndex === pageIndex);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Selection state — only one sticker selected at a time ────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // ── Active manipulation — blocks pointer events on all other stickers ─────
  const [activeId, setActiveId] = useState<string | null>(null);
  // ── Z-order map: seeded from persisted zIndex, bumped on each selection ─────
  const [zOrders, setZOrders] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    stickers.filter((s) => s.pageIndex === pageIndex).forEach((s) => {
      init[s.id] = s.zIndex ?? 0;
    });
    return init;
  });
  const zCounterRef = useRef(
    stickers.filter((s) => s.pageIndex === pageIndex).reduce((max, s) => Math.max(max, s.zIndex ?? 0), 0)
  );

  // Keep zOrders in sync with persisted zIndex from props (covers initial load,
  // new stickers, and updates propagated from the SpreadCanvas to AlbumPage)
  useEffect(() => {
    setZOrders((prev) => {
      const next = { ...prev };
      let changed = false;
      stickers.filter((s) => s.pageIndex === pageIndex).forEach((s) => {
        const persisted = s.zIndex ?? 0;
        if ((prev[s.id] ?? -1) < persisted) {
          next[s.id] = persisted;
          if (persisted > zCounterRef.current) zCounterRef.current = persisted;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [stickers, pageIndex]);

  // ── Peeling stickers: removed from parent state immediately, kept locally for animation ─
  const [peelingStickers, setPeelingStickers] = useState<Array<{ sticker: Sticker; originX: number; originY: number; peelScale: number; zIndex: number }>>([]);

  // Stable refs so handlePeelStart never captures a stale closure
  const stickersRef = useRef(stickers);
  stickersRef.current = stickers;
  const onStickersChangeRef = useRef(onStickersChange);
  onStickersChangeRef.current = onStickersChange;
  const zOrdersRef = useRef(zOrders);
  zOrdersRef.current = zOrders;

  const handlePeelStart = useCallback((sticker: Sticker, originX: number, originY: number, peelScale: number) => {
    onStickersChangeRef.current(stickersRef.current.filter((s) => s.id !== sticker.id));
    setPeelingStickers((prev) => [...prev, { sticker, originX, originY, peelScale, zIndex: 5 + (zOrdersRef.current[sticker.id] ?? 0) }]);
  }, []);

  const handlePeelDone = useCallback((id: string) => {
    setPeelingStickers((prev) => prev.filter((p) => p.sticker.id !== id));
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    zCounterRef.current += 1;
    const newZ = zCounterRef.current;
    setZOrders((prev) => ({ ...prev, [id]: newZ }));
    // Persist zIndex so layer order survives page turns and export
    const updated = stickers.map((s) => s.id === id ? { ...s, zIndex: newZ } : s);
    onStickersChange(updated);
    const target = updated.find((s) => s.id === id);
    if (target) saveSticker(target).catch(() => {});
  }, [stickers, onStickersChange]);

  // Deselect on any tap that lands outside a sticker element.
  // Uses document capture phase (fires before any element handler) and checks
  // whether the event target is inside an element with [data-sticker] so that
  // tapping the sticker body, its resize handle, or dragging it never clears
  // the selection — only a genuine tap on non-sticker content does.
  useEffect(() => {
    if (!selectedId) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-sticker]")) {
        setSelectedId(null);
      }
    };
    document.addEventListener("pointerdown", onDown, true); // capture phase
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [selectedId]);

  if (pageStickers.length === 0 && peelingStickers.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >

      <AnimatePresence initial={false}>
        {pageStickers.map((sticker) => (
          <DraggableSticker
            key={sticker.id}
            sticker={sticker}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            containerRef={containerRef}
            allStickers={stickers}
            onStickersChange={onStickersChange}
            isSelected={selectedId === sticker.id}
            onSelect={() => handleSelect(sticker.id)}
            zOrder={zOrders[sticker.id] ?? 0}
            isBlocked={activeId !== null && activeId !== sticker.id}
            onManipulateStart={() => startTransition(() => setActiveId(sticker.id))}
            onManipulateEnd={() => startTransition(() => setActiveId(null))}
            forExport={forExport}
            onPeelStart={handlePeelStart}
          />
        ))}
        {peelingStickers.map(({ sticker, originX, originY, peelScale, zIndex }) => (
          <PeelAnimation
            key={sticker.id}
            sticker={sticker}
            originX={originX}
            originY={originY}
            peelScale={peelScale}
            zIndex={zIndex}
            onDone={() => handlePeelDone(sticker.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── PeelAnimation ────────────────────────────────────────────────────────────
//
// Realistic sticker peeling logic adapted to arbitrary PNG shapes.
//
// ── Architecture ────────────────────────────────────────────────────────────
//
//   container (absolute, full width/height)
//   ├─ shadow : follows flap rotation and fades out
//   ├─ stuck  : Base image. Masked by linear-gradient(to bottom right, black, transparent)
//   └─ flap   : The peeling part, preserved-3d.
//      │        Origin moves exactly along the fold line.
//      ├─ front : front mask (transparent to black), transparent backface
//      └─ back  : rotated 180° Y, mirrored mask (to bottom left), paper textured
//                 masked again by the sticker outline (url)
//
interface PeelAnimationProps {
  sticker: Sticker;
  originX: number;
  originY: number;
  /** Visual scale at the moment the peel was triggered — keeps size consistent. */
  peelScale?: number;
  zIndex?: number;
  onDone: () => void;
}

function PeelAnimation({ sticker, originX, originY, peelScale = 1, zIndex = 20, onDone }: PeelAnimationProps) {
  const stuckRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let rafId: number;
    let timerID: ReturnType<typeof setTimeout>;
    let startTime: number | null = null;
    const PEEL_DURATION = 820;  // ms
    const VANISH_DELAY = 5000; // ms

    const tick = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const rawP = Math.min((timestamp - startTime) / PEEL_DURATION, 1);

      // Two-phase easing:
      //   0 → 25 %  ease-out-quart  — corner snaps up instantly
      //   25 → 100 % ease-in-out-cubic — crease sweeps smoothly across
      let p: number;
      if (rawP < 0.25) {
        const t = rawP / 0.25;
        p = (1 - Math.pow(1 - t, 4)) * 0.25;
      } else {
        const t = (rawP - 0.25) / 0.75;
        const eio = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;
        p = 0.25 + eio * 0.75;
      }

      // ── Mask gradient stop: 100 % → 0 % ─────────────────────────────
      const stop = (1 - p) * 100;
      const s0 = Math.max(0, stop - 1);
      const s1 = Math.min(100, stop + 1);
      const stuckMask = `linear-gradient(to bottom right, black ${s0}%, transparent ${s1}%)`;
      const frontMask = `linear-gradient(to bottom right, transparent ${s0}%, black ${s1}%)`;

      // ── Crease pivot: top-right (100%,0%) → bottom-left (0%,100%) ────
      const pivotX = stop;        // 100 → 0
      const pivotY = 100 - stop;  // 0   → 100

      // ── Gentle, realistic fold — face stays clearly visible (90–96 %) ─
      // 20°→38°: cos(38°)=0.79 → face always 79 %+ visible (not edge-on),
      // but foreshortening at the corner is perceptibly 3D.
      // perspective(150px) in element's own transform — immune to GPU promotion.
      // Negative angle: bottom-right corner lifts toward viewer (+Z).
      const FOLD = 20 + p * 18; // 20° → 38°

      if (stuckRef.current) {
        stuckRef.current.style.webkitMaskImage = stuckMask;
        (stuckRef.current.style as CSSStyleDeclaration).maskImage = stuckMask;
      }
      if (flapRef.current) {
        flapRef.current.style.transformOrigin = `${pivotX}% ${pivotY}%`;
        flapRef.current.style.transform =
          `perspective(150px) rotate3d(-1, 1, 0, -${FOLD.toFixed(1)}deg)`;
      }
      if (frontRef.current) {
        frontRef.current.style.webkitMaskImage = frontMask;
        (frontRef.current.style as CSSStyleDeclaration).maskImage = frontMask;
      }
      if (rawP < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        if (flapRef.current) flapRef.current.style.opacity = "0";
        if (stuckRef.current) stuckRef.current.style.opacity = "0";
        timerID = setTimeout(() => onDoneRef.current(), VANISH_DELAY);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerID);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const imgStyle: React.CSSProperties = {
    width: "100%", height: "100%", objectFit: "contain",
    display: "block", userSelect: "none",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        // peelScale preserves the visual size the sticker had at the moment
        // of the double-tap — prevents the "snap back to base size" glitch.
        // transformOrigin matches DraggableSticker so position doesn't jump.
        transform: `translate(${originX}px, ${originY}px) rotate(${sticker.rotation}deg) scale(${peelScale})`,
        transformOrigin: "center center",
        width: sticker.width,
        height: sticker.height,
        // MOBILE FIX: "auto" instead of "none" so the ~300 ms ghost click that
        // the browser synthesises after touchend lands here and goes no further,
        // preventing it from reaching the ImageSlot underneath.
        pointerEvents: "auto",
        zIndex,
      }}
    >
      {/* Stuck layer — part still adhered; mask retreats toward top-left */}
      <div
        ref={stuckRef}
        style={{
          position: "absolute",
          inset: 0,
          WebkitMaskImage: `linear-gradient(to bottom right, black 100%, transparent 100%)`,
          willChange: "mask-image",
        }}
      >
        <img src={sticker.dataUrl} alt="sticker" style={imgStyle} draggable={false} />
      </div>

      {/* Flap 3D container — pivot tracks the advancing crease line */}
      <div
        ref={flapRef}
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "100% 0%",  // updated each frame
        }}
      >
        {/* Peeling face — inverse mask reveals only the lifted portion */}
        <div
          ref={frontRef}
          style={{
            position: "absolute",
            inset: 0,
            WebkitMaskImage: `linear-gradient(to bottom right, transparent 100%, black 100%)`,
            willChange: "mask-image",
          }}
        >
          <img src={sticker.dataUrl} alt="" style={imgStyle} draggable={false} />
        </div>

      </div>
    </div>
  );
}

// ─── DraggableSticker ─────────────────────────────────────────────────────────
interface DraggableStickerProps {
  sticker: Sticker;
  containerWidth: number;
  containerHeight: number;
  containerRef: React.RefObject<HTMLDivElement>;
  allStickers: Sticker[];
  onStickersChange: (s: Sticker[]) => void;
  isSelected: boolean;
  onSelect: () => void;
  zOrder: number;
  isBlocked: boolean;
  onManipulateStart: () => void;
  onManipulateEnd: () => void;
  forExport?: boolean;
  onPeelStart: (sticker: Sticker, originX: number, originY: number, peelScale: number) => void;
}

function DraggableSticker({
  sticker,
  containerWidth,
  containerHeight,
  containerRef,
  allStickers,
  onStickersChange,
  isSelected,
  onSelect,
  zOrder,
  isBlocked,
  onManipulateStart,
  onManipulateEnd,
  forExport = false,
  onPeelStart,
}: DraggableStickerProps) {
  // Tight content bounds in element-px space (non-transparent pixel area of the PNG)
  const [contentBounds, setContentBounds] = useState<{ left: number; top: number; bw: number; bh: number } | null>(null);

  const x = useMotionValue(sticker.x * containerWidth);
  const y = useMotionValue(sticker.y * containerHeight);
  // scaleMotion drives CSS transform scale so it composes cleanly with
  // Framer Motion's x/y/rotate without interfering with whileDrag.
  const scaleMotion = useMotionValue(sticker.scale ?? 1);

  const peelOrigin = useRef({ x: 0, y: 0 });
  const peelScale = useRef(1);   // scale captured at peel time
  const lastTapRef = useRef(0);
  const pointerDownPos = useRef({ x: 0, y: 0 });
  const lastPointerTypeRef = useRef<string>("");

  // Resize drag state
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const resizeStartRef = useRef({ clientX: 0, clientY: 0, scale: 1 });

  // Rotate state (reuses moodboard angle-from-center logic)
  const rotateMotion = useMotionValue(sticker.rotation ?? 0);
  const rotateActiveRef = useRef<{ cx: number; cy: number; startAngle: number; startRot: number } | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  // ── Mobile detection (client-only) ──────────────────────────────────────
  // Used to: skip mouse-compat pointer events, enable pinch.
  const isMobileRef = useRef(false);
  useLayoutEffect(() => {
    isMobileRef.current =
      window.innerWidth < 768 || navigator.maxTouchPoints > 0;
  }, []);

  // ── Ref to the DOM node — needed for native touch listeners ─────────────
  const divRef = useRef<HTMLDivElement>(null);

  // ── Pivot ref: 1×1 div at TL corner gives exact screen position of the
  //    rotation pivot (transformOrigin:"top left") via getBoundingClientRect()
  const pivotRef = useRef<HTMLDivElement>(null);

  // ── Stable refs for manipulate callbacks (safe in useEffect) ─────────────
  const onManipulateStartRef = useRef(onManipulateStart);
  const onManipulateEndRef = useRef(onManipulateEnd);
  onManipulateStartRef.current = onManipulateStart;
  onManipulateEndRef.current = onManipulateEnd;

  // ── Refs so event handlers always see current prop values ────────────────
  // (avoids adding sticker/allStickers/onStickersChange to every useEffect dep)
  const stickerRef = useRef(sticker);
  const allStickersR = useRef(allStickers);
  const onChangeRef = useRef(onStickersChange);
  stickerRef.current = sticker;
  allStickersR.current = allStickers;
  onChangeRef.current = onStickersChange;


  // ── Pinch-to-resize + two-finger rotate (mobile) ────────────────────────────
  const pinchRef = useRef<{ dist: number; angle0: number; scale: number; rot0: number } | null>(null);
  // Tracks whether a two-finger gesture is active so drag is suppressed
  const [isGesturing, setIsGesturing] = useState(false);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      e.stopImmediatePropagation();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = {
          dist: Math.hypot(dx, dy),
          angle0: Math.atan2(dy, dx),
          scale: scaleMotion.get(),
          rot0: rotateMotion.get(),
        };
        setIsGesturing(true);
        onManipulateStartRef.current();
      } else {
        pinchRef.current = null;
        setIsGesturing(false);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current || e.touches.length !== 2) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const ratio = Math.hypot(dx, dy) / pinchRef.current.dist;
      const dAngle = (Math.atan2(dy, dx) - pinchRef.current.angle0) * (180 / Math.PI);
      scaleMotion.set(Math.max(0.25, Math.min(5, pinchRef.current.scale * ratio)));
      rotateMotion.set(pinchRef.current.rot0 + dAngle);
    };

    const onTouchEnd = async () => {
      if (!pinchRef.current) return;
      const newScale = scaleMotion.get();
      const newRot = rotateMotion.get();
      pinchRef.current = null;
      setIsGesturing(false);
      onManipulateEndRef.current();
      const updated = { ...stickerRef.current, scale: newScale, rotation: newRot };
      onChangeRef.current(allStickersR.current.map((s) => s.id === updated.id ? updated : s));
      await saveSticker(updated);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scaleMotion, rotateMotion]); // eslint-disable-line

  useEffect(() => {
    x.set(sticker.x * containerWidth);
    y.set(sticker.y * containerHeight);
  }, [sticker.x, sticker.y, containerWidth, containerHeight]); // eslint-disable-line

  // Keep scaleMotion in sync when the persisted sticker.scale changes (e.g. page load)
  useEffect(() => {
    scaleMotion.set(sticker.scale ?? 1);
  }, [sticker.scale]); // eslint-disable-line

  // Keep rotateMotion in sync when the persisted sticker.rotation changes (e.g. page load)
  useEffect(() => {
    rotateMotion.set(sticker.rotation ?? 0);
  }, [sticker.rotation]); // eslint-disable-line

  // Convert screen/page coordinates to page-local coordinates, accounting for
  // the book's scale and optional -90° mobile rotation. Used by transformPagePoint
  // so Framer Motion computes drag deltas in the correct coordinate space.
  const screenToPage = useCallback((sx: number, sy: number): { x: number; y: number } => {
    const el = containerRef.current;
    if (!el) return { x: sx, y: sy };
    const rect = el.getBoundingClientRect();
    const scaleFlat = rect.width / containerWidth;
    const scaleRot = rect.width / containerHeight;
    const isRotated =
      Math.abs(rect.height - containerWidth * scaleRot) <
      Math.abs(rect.height - containerHeight * scaleFlat);
    if (!isRotated) {
      const scale = rect.width / containerWidth;
      return { x: (sx - rect.left) / scale, y: (sy - rect.top) / scale };
    }
    const scale = rect.width / containerHeight;
    const rectCx = rect.left + rect.width / 2;
    const rectCy = rect.top + rect.height / 2;
    return {
      x: containerWidth / 2 - (sy - rectCy) / scale,
      y: containerHeight / 2 + (sx - rectCx) / scale,
    };
  }, [containerRef, containerWidth, containerHeight]);

  const handleDragEnd = useCallback(async () => {
    const rawX = x.get();
    const rawY = y.get();
    const curScale = scaleMotion.get();
    // With transformOrigin:"center center", the visual center = (x + w/2, y + h/2)
    // and stays fixed regardless of scale. Clamp so the center stays inside the page.
    const hw = sticker.width / 2;
    const hh = sticker.height / 2;
    const clampedX = Math.max(-hw, Math.min(containerWidth - hw, rawX));
    const clampedY = Math.max(-hh, Math.min(containerHeight - hh, rawY));
    x.set(clampedX);
    y.set(clampedY);
    const nx = clampedX / containerWidth;
    const ny = clampedY / containerHeight;
    startTransition(() => {
      onStickersChange(allStickers.map((s) => s.id === sticker.id ? { ...s, x: nx, y: ny } : s));
    });
    await saveSticker({ ...sticker, x: nx, y: ny });
    onManipulateEnd();
  }, [x, y, sticker, containerWidth, containerHeight, allStickers, onStickersChange, scaleMotion, onManipulateEnd]);

  // ── Corner resize handlers (desktop) ────────────────────────────────────────
  // Invisible corner zones capture pointer events so FM drag never starts —
  // stopImmediatePropagation on the native event prevents Framer Motion from
  // seeing the pointer sequence. setPointerCapture keeps events arriving even
  // when the pointer moves outside the corner zone during a fast resize gesture.
  const handleCornerPointerDown = useCallback((e: React.PointerEvent) => {
    // Double-tap on a corner zone should still trigger peel (same as body double-tap)
    const now = Date.now();
    const delta = now - lastTapRef.current;
    const maxGap = e.pointerType === "touch" ? 600 : 350;
    if (delta < maxGap && delta > 30) {
      e.stopPropagation();
      (e.nativeEvent as Event).stopImmediatePropagation();
      peelOrigin.current = { x: x.get(), y: y.get() };
      peelScale.current = scaleMotion.get();
      deleteSticker(sticker.id);
      onPeelStart(stickerRef.current, peelOrigin.current.x, peelOrigin.current.y, peelScale.current);
      return;
    }
    lastTapRef.current = now;
    e.stopPropagation();
    (e.nativeEvent as Event).stopImmediatePropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isResizingRef.current = true;
    setIsResizing(true);
    onManipulateStart();
    resizeStartRef.current = { clientX: e.clientX, clientY: e.clientY, scale: scaleMotion.get() };
  }, [scaleMotion]);

  const handleCornerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isResizingRef.current) return;
    const dx = e.clientX - resizeStartRef.current.clientX;
    const dy = e.clientY - resizeStartRef.current.clientY;
    // Diagonal direction: bottom-right = grow, top-left = shrink
    const dist = Math.hypot(dx, dy) * (dx + dy >= 0 ? 1 : -1);
    const delta = dist / (sticker.width * 2); // normalise to base size
    const newScale = Math.max(0.25, Math.min(5.0, resizeStartRef.current.scale + delta));
    scaleMotion.set(newScale);
  }, [sticker.width, scaleMotion]);

  const handleCornerPointerUp = useCallback(async (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    setIsResizing(false);
    onManipulateEnd();
    const newScale = scaleMotion.get();
    const updated = { ...sticker, scale: newScale };
    onStickersChange(allStickers.map((s) => s.id === sticker.id ? updated : s));
    await saveSticker(updated);
  }, [sticker, allStickers, onStickersChange, scaleMotion]);

  // ── Rotate handlers (reuses moodboard angle-from-center logic) ─────────────
  const handleRotatePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.nativeEvent as Event).stopImmediatePropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Use the element's bounding rect CENTER — with transformOrigin:"center center"
    // this point stays fixed during rotation so angle math never drifts.
    const rect = divRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    rotateActiveRef.current = { cx, cy, startAngle, startRot: rotateMotion.get() };
    setIsRotating(true);
    onManipulateStart();
  }, [rotateMotion]);

  const handleRotatePointerMove = useCallback((e: React.PointerEvent) => {
    const act = rotateActiveRef.current;
    if (!act) return;
    const ang = Math.atan2(e.clientY - act.cy, e.clientX - act.cx) * (180 / Math.PI);
    rotateMotion.set(act.startRot + (ang - act.startAngle));
  }, [rotateMotion]);

  const handleRotatePointerUp = useCallback(async (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!rotateActiveRef.current) return;
    rotateActiveRef.current = null;
    setIsRotating(false);
    onManipulateEnd();
    const newRotation = rotateMotion.get();
    const updated = { ...stickerRef.current, rotation: newRotation };
    onChangeRef.current(allStickersR.current.map((s) => s.id === updated.id ? updated : s));
    await saveSticker(updated);
  }, [rotateMotion]);

  // ── Prevent react-pageflip from stealing drag events (desktop) ────────────
  // On desktop, react-pageflip attaches a native mousedown listener. React's
  // stopPropagation only stops React's synthetic event system.
  // stopImmediatePropagation on the native event stops ALL handlers on ALL
  // ancestor elements, including react-pageflip's native listeners.
  // On mobile, touchstart is handled by the native listener in the useEffect
  // above — no need to duplicate it here.
  const stopNative = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    (e.nativeEvent as Event).stopImmediatePropagation();
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    stopNative(e);
    // MOBILE FIX: mark so ImageSlot.onClick can suppress ghost clicks that
    // arrive ~300 ms after touchend when the sticker is no longer intercepting.
    markStickerPress();
    lastPointerTypeRef.current = e.pointerType;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    onSelect(); // select immediately on press — instant visual feedback
  }, [stopNative, onSelect]);

  // For large stickers: content-area child handles selection but does NOT call
  // stopImmediatePropagation on the native event so it still bubbles to the
  // motion.div where Framer Motion's drag listener picks it up.
  const handlePointerDownContent = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); // stops React synthetic bubbling only
    markStickerPress();
    lastPointerTypeRef.current = e.pointerType;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    onSelect();
  }, [onSelect]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (false) return; // isPeeling removed; peel is now handled in StickerLayer

    // ── Mobile: skip mouse-compat pointer events ─────────────────────────
    // After touchend, mobile browsers synthesise mousedown/mouseup (pointerType
    // "mouse") for backwards compatibility. These arrive ~0–300 ms after the
    // real touch pointerup and would reset lastTapRef, making double-tap
    // detection unreliable. Skip them on touch-capable devices.
    if (lastPointerTypeRef.current === "touch" && e.pointerType === "mouse") return;

    const dx = Math.abs(e.clientX - pointerDownPos.current.x);
    const dy = Math.abs(e.clientY - pointerDownPos.current.y);
    if (dx > 8 || dy > 8) return; // was a drag — ignore

    const now = Date.now();
    const delta = now - lastTapRef.current;
    // Touch double-taps have a wider natural gap than mouse double-clicks,
    // so allow up to 600 ms between taps on touch devices.
    const maxGap = e.pointerType === "touch" ? 600 : 350;
    if (delta < maxGap && delta > 30) {
      // Double-tap: snapshot position AND current scale before re-render so
      // PeelAnimation starts at the exact same visual state — no size jump.
      peelOrigin.current = { x: x.get(), y: y.get() };
      peelScale.current = scaleMotion.get();
      deleteSticker(sticker.id);
      onPeelStart(stickerRef.current, peelOrigin.current.x, peelOrigin.current.y, peelScale.current);
    }
    lastTapRef.current = now;
  }, [x, y, scaleMotion, onPeelStart]);

  // Shared props for all four invisible corner resize zones
  const cornerZoneProps = {
    onPointerDown: handleCornerPointerDown,
    onPointerMove: handleCornerPointerMove,
    onPointerUp: handleCornerPointerUp,
    onPointerCancel: handleCornerPointerUp,
  };
  const CORNER = 20; // hit-area size in px

  return (
    <motion.div
      // [data-sticker] lets the document capture listener distinguish sticker
      // taps from outside-taps so selection is never cleared mid-drag or on
      // a tap on the sticker body / resize handle.
      data-sticker={sticker.id}
      ref={divRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        x,
        y,
        width: sticker.width,
        height: sticker.height,
        rotate: rotateMotion,
        // transform-based scale: no pixel re-rasterisation, preserves source quality
        scale: scaleMotion,
        // center origin: sticker spins in place (matches moodboard image behavior)
        transformOrigin: "center center",
        cursor: isBlocked ? "default" : "grab",
        pointerEvents: isBlocked ? "none" : (contentBounds && Math.max(sticker.width, sticker.height) * (sticker.scale ?? 1) > 100 ? "none" : "auto"),
        touchAction: "none",
        userSelect: "none",
        willChange: forExport ? undefined : "transform",
        zIndex: 5 + zOrder,
        boxSizing: "border-box",
        border: (() => {
          if (!isSelected) return "2px dashed transparent";
          const vis = Math.max(sticker.width, sticker.height) * (sticker.scale ?? 1);
          return vis > 100 ? "2px dashed transparent" : "2px dashed #A4A4A4";
        })(),
        transition: "border-color 0.15s ease",
      }}
      drag={!isGesturing && !isRotating && !isResizing}
      dragMomentum={false}
      dragElastic={0}
      // @ts-ignore — transformPagePoint removed from FM types but still works at runtime
      transformPagePoint={(p: { x: number; y: number }) => screenToPage(p.x, p.y)}
      onPointerDown={handlePointerDown}
      onMouseDown={stopNative}    // stops react-pageflip's mousedown listener (desktop)
      onPointerUp={handlePointerUp}
      onDragStart={() => { setIsDragging(true); onManipulateStart(); }}
      onDragEnd={(e, i) => { setIsDragging(false); handleDragEnd(); }}
      // Shadow and hover effects removed
      whileDrag={{ cursor: "grabbing", zIndex: 20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      exit={{ opacity: 0, scale: 0, transition: { duration: 0 } }}
    >
      {/* 1×1 pivot marker at TL — getBoundingClientRect() gives exact screen
          position of the rotation origin (transformOrigin:"top left") */}
      <div ref={pivotRef} style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, pointerEvents: "none" }} />

      {/* Selection border tightly wrapping non-transparent pixel content — large stickers only */}
      {isSelected && contentBounds && Math.max(sticker.width, sticker.height) * (sticker.scale ?? 1) > 100 && (
        <div style={{
          position: "absolute",
          left: contentBounds.left,
          top: contentBounds.top,
          width: contentBounds.bw,
          height: contentBounds.bh,
          border: "2px dashed #A4A4A4",
          borderRadius: 2,
          pointerEvents: "none",
          boxSizing: "border-box",
        }} />
      )}

      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <img
          src={sticker.dataUrl}
          alt="sticker"
          onLoad={(e) => {
            const imgEl = e.currentTarget;
            const nw = imgEl.naturalWidth;
            const nh = imgEl.naturalHeight;
            if (!nw || !nh) return;
            const ew = sticker.width, eh = sticker.height;
            // Defer pixel scan off the render cycle so the sticker renders immediately
            setTimeout(() => {
              try {
                const canvas = document.createElement("canvas");
                // Downsample large images for faster scanning (max 256px side)
                const maxSide = 256;
                const scanScale = Math.min(1, maxSide / Math.max(nw, nh));
                const sw = Math.round(nw * scanScale);
                const sh = Math.round(nh * scanScale);
                canvas.width = sw;
                canvas.height = sh;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.drawImage(imgEl, 0, 0, sw, sh);
                const { data } = ctx.getImageData(0, 0, sw, sh);
                let minX = sw, maxX = -1, minY = sh, maxY = -1;
                for (let py = 0; py < sh; py++) {
                  for (let px = 0; px < sw; px++) {
                    if (data[(py * sw + px) * 4 + 3] > 10) {
                      if (px < minX) minX = px;
                      if (px > maxX) maxX = px;
                      if (py < minY) minY = py;
                      if (py > maxY) maxY = py;
                    }
                  }
                }
                if (maxX >= minX && maxY >= minY) {
                  // Map back from scan space → element space
                  const fitScale = Math.min(ew / nw, eh / nh);
                  const imgW = nw * fitScale, imgH = nh * fitScale;
                  const offX = (ew - imgW) / 2, offY = (eh - imgH) / 2;
                  const pixelScale = fitScale / scanScale;
                  setContentBounds({
                    left: offX + minX * pixelScale,
                    top: offY + minY * pixelScale,
                    bw: (maxX - minX + 1) * pixelScale,
                    bh: (maxY - minY + 1) * pixelScale,
                  });
                }
              } catch {
                // Canvas taint or other error — leave contentBounds null so the
                // full element stays interactive (pointerEvents: auto fallback).
              }
            }, 0);
          }}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            display: "block",
            pointerEvents: "none",
            userSelect: "none",
            imageRendering: "auto",
          } as React.CSSProperties}
          draggable={false}
        />
      </div>

      {/* ── Content-area hit div for large stickers (limits drag/hover to visible area) ── */}
      {contentBounds && Math.max(sticker.width, sticker.height) * (sticker.scale ?? 1) > 100 && (
        <div
          data-sticker={sticker.id}
          style={{
            position: "absolute",
            left: contentBounds.left,
            top: contentBounds.top,
            width: contentBounds.bw,
            height: contentBounds.bh,
            pointerEvents: isBlocked ? "none" : "auto",
            cursor: isBlocked ? "default" : "grab",
            touchAction: "none",
            zIndex: 1,
          }}
          onPointerDown={handlePointerDownContent}
          onPointerUp={handlePointerUp}
        />
      )}

      {/* ── Invisible corner resize zones — only active when selected ── */}
      <div {...cornerZoneProps} style={{ position: "absolute", top: 0, left: 0, width: CORNER, height: CORNER, cursor: "nwse-resize", touchAction: "none", pointerEvents: isSelected && !isDragging && !isRotating ? "auto" : "none", zIndex: 10 }} />
      <div {...cornerZoneProps} style={{ position: "absolute", top: 0, right: 0, width: CORNER, height: CORNER, cursor: "nesw-resize", touchAction: "none", pointerEvents: isSelected && !isDragging && !isRotating ? "auto" : "none", zIndex: 10 }} />
      <div {...cornerZoneProps} style={{ position: "absolute", bottom: 0, left: 0, width: CORNER, height: CORNER, cursor: "nesw-resize", touchAction: "none", pointerEvents: isSelected && !isDragging && !isRotating ? "auto" : "none", zIndex: 10 }} />
      <div {...cornerZoneProps} style={{ position: "absolute", bottom: 0, right: 0, width: CORNER, height: CORNER, cursor: "nwse-resize", touchAction: "none", pointerEvents: isSelected && !isDragging && !isRotating ? "auto" : "none", zIndex: 10 }} />

      {/* ── Invisible rotate zones — only active when selected ── */}
      {(() => {
        const rotPE = isSelected && !isDragging && !isResizing ? "auto" : "none";
        const cb = contentBounds;
        const isLarge = Math.max(sticker.width, sticker.height) * (sticker.scale ?? 1) > 100 && !!cb;
        // Small stickers: zones outside element corners (standard -ROT_OFF)
        // Large stickers: zones outside contentBounds corners so they sit just
        //   beyond the visible inner border and are easy to find
        const tlR = isLarge && cb ? { top: cb.top - ROT_OFF, left: cb.left - ROT_OFF } : { top: -ROT_OFF, left: -ROT_OFF };
        const trR = isLarge && cb ? { top: cb.top - ROT_OFF, left: cb.left + cb.bw + ROT_OFF - ROT_SIZE } : { top: -ROT_OFF, right: -ROT_OFF };
        const blR = isLarge && cb ? { top: cb.top + cb.bh + ROT_OFF - ROT_SIZE, left: cb.left - ROT_OFF } : { bottom: -ROT_OFF, left: -ROT_OFF };
        const brR = isLarge && cb ? { top: cb.top + cb.bh + ROT_OFF - ROT_SIZE, left: cb.left + cb.bw + ROT_OFF - ROT_SIZE } : { bottom: -ROT_OFF, right: -ROT_OFF };
        const rp = { onPointerDown: handleRotatePointerDown, onPointerMove: handleRotatePointerMove, onPointerUp: handleRotatePointerUp, onPointerCancel: handleRotatePointerUp };
        const rs: React.CSSProperties = { position: "absolute", width: ROT_SIZE, height: ROT_SIZE, cursor: "grab", touchAction: "none", pointerEvents: rotPE as any, zIndex: 8, background: "transparent" };
        return (<>
          <div {...rp} style={{ ...rs, ...tlR }} />
          <div {...rp} style={{ ...rs, ...trR }} />
          <div {...rp} style={{ ...rs, ...blR }} />
          <div {...rp} style={{ ...rs, ...brR }} />
        </>);
      })()}
    </motion.div>
  );
}
