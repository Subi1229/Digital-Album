"use client";

import React, { useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
} from "framer-motion";
import { Sticker } from "@/lib/types";
import { saveSticker, deleteSticker } from "@/lib/db";
// MOBILE FIX: shared flag so ImageSlot can suppress ghost clicks from sticker taps
import { markStickerPress } from "@/lib/stickerInteraction";

// ─── StickerLayer ─────────────────────────────────────────────────────────────
interface StickerLayerProps {
  stickers: Sticker[];
  pageIndex: number;
  containerWidth: number;
  containerHeight: number;
  onStickersChange: (stickers: Sticker[]) => void;
}

export default function StickerLayer(props: StickerLayerProps) {
  const { stickers, pageIndex, containerWidth, containerHeight, onStickersChange } = props;
  const pageStickers = stickers.filter((s) => s.pageIndex === pageIndex);

  // ── Selection state — only one sticker selected at a time ────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  if (pageStickers.length === 0) return null;

  return (
    <div
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
            allStickers={stickers}
            onStickersChange={onStickersChange}
            isSelected={selectedId === sticker.id}
            onSelect={() => setSelectedId(sticker.id)}
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
  onDone: () => void;
}

function PeelAnimation({ sticker, originX, originY, peelScale = 1, onDone }: PeelAnimationProps) {
  const stuckRef = useRef<HTMLDivElement>(null);
  const flapRef  = useRef<HTMLDivElement>(null);
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
        if (flapRef.current)  flapRef.current.style.opacity  = "0";
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
        position:        "absolute",
        top:             0,
        left:            0,
        // peelScale preserves the visual size the sticker had at the moment
        // of the double-tap — prevents the "snap back to base size" glitch.
        // transformOrigin matches DraggableSticker so position doesn't jump.
        transform:       `translate(${originX}px, ${originY}px) rotate(${sticker.rotation}deg) scale(${peelScale})`,
        transformOrigin: "top left",
        width:           sticker.width,
        height:          sticker.height,
        // MOBILE FIX: "auto" instead of "none" so the ~300 ms ghost click that
        // the browser synthesises after touchend lands here and goes no further,
        // preventing it from reaching the ImageSlot underneath.
        pointerEvents:   "auto",
        zIndex:          20,
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
  allStickers: Sticker[];
  onStickersChange: (s: Sticker[]) => void;
  isSelected: boolean;
  onSelect: () => void;
}

function DraggableSticker({
  sticker,
  containerWidth,
  containerHeight,
  allStickers,
  onStickersChange,
  isSelected,
  onSelect,
}: DraggableStickerProps) {
  const x = useMotionValue(sticker.x * containerWidth);
  const y = useMotionValue(sticker.y * containerHeight);
  // scaleMotion drives CSS transform scale so it composes cleanly with
  // Framer Motion's x/y/rotate without interfering with whileDrag.
  const scaleMotion = useMotionValue(sticker.scale ?? 1);

  const [isPeeling, setIsPeeling] = useState(false);
  const peelOrigin = useRef({ x: 0, y: 0 });
  const peelScale = useRef(1);   // scale captured at peel time
  const lastTapRef = useRef(0);
  const pointerDownPos = useRef({ x: 0, y: 0 });

  // Resize drag state
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ clientX: 0, clientY: 0, scale: 1 });

  // ── Mobile detection (client-only) ──────────────────────────────────────
  // Used to: skip mouse-compat pointer events, enlarge handles, enable pinch.
  const isMobileRef = useRef(false);
  useLayoutEffect(() => {
    isMobileRef.current =
      window.innerWidth < 768 || navigator.maxTouchPoints > 0;
  }, []);

  // ── Ref to the DOM node — needed for native touch listeners ─────────────
  const divRef = useRef<HTMLDivElement>(null);

  // ── Refs so event handlers always see current prop values ────────────────
  // (avoids adding sticker/allStickers/onStickersChange to every useEffect dep)
  const stickerRef    = useRef(sticker);
  const allStickersR  = useRef(allStickers);
  const onChangeRef   = useRef(onStickersChange);
  stickerRef.current   = sticker;
  allStickersR.current = allStickers;
  onChangeRef.current  = onStickersChange;

  // ── Pinch-to-resize (mobile) ─────────────────────────────────────────────
  // Attach native touch listeners directly on the element so stopImmediatePropagation
  // fires at the element level — preventing react-pageflip's ancestor listener from
  // seeing the touch and triggering a page flip, while keeping pointer events alive
  // (we do NOT call preventDefault on touchstart, which would cancel pointer events).
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      // Stop page-flip without cancelling pointer events.
      // stopImmediatePropagation prevents bubbling to react-pageflip on ancestors;
      // omitting preventDefault keeps the pointer event sequence alive so Framer
      // Motion drag still works via pointerdown/pointermove/pointerup.
      e.stopImmediatePropagation();

      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { dist: Math.hypot(dx, dy), scale: scaleMotion.get() };
      } else {
        pinchRef.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current || e.touches.length !== 2) return;
      // Prevent scroll/page during a two-finger pinch on the sticker.
      e.preventDefault();
      e.stopImmediatePropagation();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const ratio = Math.hypot(dx, dy) / pinchRef.current.dist;
      scaleMotion.set(Math.max(0.25, Math.min(5, pinchRef.current.scale * ratio)));
    };

    const onTouchEnd = async () => {
      if (!pinchRef.current) return;
      const newScale = scaleMotion.get();
      pinchRef.current = null;
      // Persist the new scale
      const updated = { ...stickerRef.current, scale: newScale };
      onChangeRef.current(allStickersR.current.map((s) => s.id === updated.id ? updated : s));
      await saveSticker(updated);
    };

    el.addEventListener("touchstart",  onTouchStart,  { passive: true  });
    el.addEventListener("touchmove",   onTouchMove,   { passive: false }); // needs preventDefault
    el.addEventListener("touchend",    onTouchEnd,    { passive: true  });
    el.addEventListener("touchcancel", onTouchEnd,    { passive: true  });

    return () => {
      el.removeEventListener("touchstart",  onTouchStart);
      el.removeEventListener("touchmove",   onTouchMove);
      el.removeEventListener("touchend",    onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scaleMotion]); // only scaleMotion needed — sticker/allStickers accessed via refs

  useEffect(() => {
    x.set(sticker.x * containerWidth);
    y.set(sticker.y * containerHeight);
  }, [sticker.x, sticker.y, containerWidth, containerHeight]); // eslint-disable-line

  // Keep scaleMotion in sync when the persisted sticker.scale changes (e.g. page load)
  useEffect(() => {
    scaleMotion.set(sticker.scale ?? 1);
  }, [sticker.scale]); // eslint-disable-line

  const handleDragEnd = useCallback(async () => {
    const rawX = x.get();
    const rawY = y.get();
    const curScale = scaleMotion.get();
    // Clamp using the visual (scaled) footprint so the sticker stays on-page
    const clampedX = Math.max(0, Math.min(containerWidth - sticker.width * curScale, rawX));
    const clampedY = Math.max(0, Math.min(containerHeight - sticker.height * curScale, rawY));
    x.set(clampedX);
    y.set(clampedY);
    const nx = clampedX / containerWidth;
    const ny = clampedY / containerHeight;
    onStickersChange(allStickers.map((s) => s.id === sticker.id ? { ...s, x: nx, y: ny } : s));
    await saveSticker({ ...sticker, x: nx, y: ny });
  }, [x, y, sticker, containerWidth, containerHeight, allStickers, onStickersChange, scaleMotion]);

  const handleDelete = useCallback(async () => {
    // Library items are persisted in the dedicated library store.
    // Deleting a placed sticker should only remove this placed instance.
    onStickersChange(allStickers.filter((s) => s.id !== sticker.id));
    await deleteSticker(sticker.id);
  }, [sticker.id, allStickers, onStickersChange]);

  // ── Resize handlers ─────────────────────────────────────────────────────────
  // Pointer is captured on the handle so moves are tracked globally (even if
  // the pointer moves fast outside the handle bounds).
  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.nativeEvent as Event).stopImmediatePropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isResizingRef.current = true;
    resizeStartRef.current = { clientX: e.clientX, clientY: e.clientY, scale: scaleMotion.get() };
  }, [scaleMotion]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isResizingRef.current) return;
    const dx = e.clientX - resizeStartRef.current.clientX;
    const dy = e.clientY - resizeStartRef.current.clientY;
    // Diagonal direction: bottom-right = grow, top-left = shrink
    const dist = Math.hypot(dx, dy) * (dx + dy >= 0 ? 1 : -1);
    const delta = dist / (sticker.width * 2); // normalise to base size
    const newScale = Math.max(0.25, Math.min(5.0, resizeStartRef.current.scale + delta));
    scaleMotion.set(newScale);
  }, [sticker.width, scaleMotion]);

  const handleResizePointerUp = useCallback(async (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    const newScale = scaleMotion.get();
    const updated = { ...sticker, scale: newScale };
    onStickersChange(allStickers.map((s) => s.id === sticker.id ? updated : s));
    await saveSticker(updated);
  }, [sticker, allStickers, onStickersChange, scaleMotion]);

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
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    onSelect(); // select immediately on press — instant visual feedback
  }, [stopNative, onSelect]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isPeeling) return;

    // ── Mobile: skip mouse-compat pointer events ─────────────────────────
    // After touchend, mobile browsers synthesise mousedown/mouseup (pointerType
    // "mouse") for backwards compatibility. These arrive ~0–300 ms after the
    // real touch pointerup and would reset lastTapRef, making double-tap
    // detection unreliable. Skip them on touch-capable devices.
    if (isMobileRef.current && e.pointerType === "mouse") return;

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
      setIsPeeling(true);
    }
    lastTapRef.current = now;
  }, [isPeeling, x, y, scaleMotion]);

  // Switch to the peel branch on double-tap
  if (isPeeling) {
    return (
      <PeelAnimation
        sticker={sticker}
        originX={peelOrigin.current.x}
        originY={peelOrigin.current.y}
        peelScale={peelScale.current}
        onDone={handleDelete}
      />
    );
  }

  // Resize handle dimensions — larger on touch devices for easier tapping.
  const handleSize   = isMobileRef.current ? 28 : 16;
  const handleOffset = -(handleSize / 2);

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
        rotate: sticker.rotation,
        // transform-based scale: no pixel re-rasterisation, preserves source quality
        scale: scaleMotion,
        // top-left origin: visual footprint grows toward bottom-right,
        // which matches the bottom-right resize handle position intuitively
        transformOrigin: "top left",
        cursor: "grab",
        pointerEvents: "auto",
        touchAction: "none",
        userSelect: "none",
        zIndex: 5,
        border: isSelected ? "2px dashed #A4A4A4" : "2px dashed transparent",
        boxSizing: "border-box",
        transition: "border-color 0.15s ease",
      }}
      drag
      dragMomentum={false}
      dragElastic={0}
      onPointerDown={handlePointerDown}
      onMouseDown={stopNative}    // stops react-pageflip's mousedown listener (desktop)
      onPointerUp={handlePointerUp}
      onDragEnd={handleDragEnd}
      // Shadow lift instead of scale-on-drag to avoid conflicting with resize scale
      whileDrag={{ cursor: "grabbing", zIndex: 20, filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.28))" }}
      whileHover={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.15))" }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      exit={{ opacity: 0, scale: 0, transition: { duration: 0 } }}
    >
      <img
        src={sticker.dataUrl}
        alt="sticker"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          pointerEvents: "none",
          userSelect: "none",
          // Browser uses high-quality bi-cubic interpolation at any CSS scale
          imageRendering: "auto",
        } as React.CSSProperties}
        draggable={false}
      />

      {/* ── Resize handle — visible only when this sticker is selected ── */}
      {/* On mobile the handle is larger (28 px) for easier finger targeting. */}
      {/* Pinch-to-resize is also available on mobile as the primary gesture. */}
      <div
        style={{
          position: "absolute",
          bottom: handleOffset,
          right: handleOffset,
          width: handleSize,
          height: handleSize,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.97)",
          border: "1.5px solid rgba(99,102,241,0.7)",
          boxShadow: "0 1px 5px rgba(0,0,0,0.28)",
          cursor: "nwse-resize",
          touchAction: "none",
          zIndex: 10,
          // Fade in/out smoothly — pointer-events off when hidden so it never
          // accidentally captures touches when the sticker isn't selected
          opacity: isSelected ? 1 : 0,
          pointerEvents: isSelected ? "auto" : "none",
          transition: "opacity 0.18s ease",
        }}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
      />
    </motion.div>
  );
}
