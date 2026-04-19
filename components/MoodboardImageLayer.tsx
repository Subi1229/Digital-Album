"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition,
} from "react";
import { motion, useMotionValue } from "framer-motion";
import { MoodboardImage } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────
const CORNER_H = 24;   // invisible corner resize hit area
const CORNER_OFF = -(CORNER_H / 2);
const EDGE_LONG = 28;   // invisible edge resize hit area (long side)
const EDGE_SHORT = 10;   // invisible edge resize hit area (short side)
const EDGE_OFF = -(EDGE_SHORT / 2);
const ROT_SIZE = 26;   // invisible rotate hit area
const ROT_OFF = -30;  // rotate zone offset from corner (outside)
const DEL_SIZE = 22;   // delete button diameter
const MIN_DIM = 40;   // minimum image dimension (px)
const RADIUS = 15;   // image border-radius

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type RotHandle = "rot-ne" | "rot-nw" | "rot-se" | "rot-sw";
type HandleType = ResizeHandle | RotHandle;

interface ActiveInteraction {
  type: "resize" | "rotate";
  handle: HandleType;
  startImg: MoodboardImage;
  // resize
  anchor?: { x: number; y: number }; // fixed point in page space
  // rotate
  centerScreen?: { x: number; y: number };
  startAngle?: number;
}

// ── Layer ─────────────────────────────────────────────────────────────────────
interface MoodboardImageLayerProps {
  albumId: string;
  images: MoodboardImage[];
  pageIndex: number;
  containerWidth: number;
  containerHeight: number;
  onImagesChange: (images: MoodboardImage[]) => void;
  forExport?: boolean;
}

export default function MoodboardImageLayer({
  albumId,
  images,
  pageIndex,
  containerWidth,
  containerHeight,
  onImagesChange,
  forExport = false,
}: MoodboardImageLayerProps) {
  const pageImages = images.filter(
    (img) => img.albumId === albumId && (typeof img.pageIndex !== "number" || img.pageIndex === pageIndex),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    const scoped = images.filter(
      (img) => img.albumId === albumId && (typeof img.pageIndex !== "number" || img.pageIndex === pageIndex),
    );
    const current = scoped.find((img) => img.id === id);
    if (!current) return;
    const maxZ = scoped.reduce((max, img) => Math.max(max, img.zIndex ?? 1), 1);
    const currentZ = current.zIndex ?? 1;
    if (currentZ >= maxZ) return;
    onImagesChange(images.map((img) => (img.id === id ? { ...img, zIndex: maxZ + 1 } : img)));
  }, [albumId, images, onImagesChange, pageIndex]);


  // Deselect on tap outside any image
  useEffect(() => {
    if (!selectedId) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-mbimage]")) {
        setSelectedId(null);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [selectedId]);

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
      {pageImages.map((img) => (
        <MoodboardImageItem
          key={img.id}
          image={img}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          containerRef={containerRef}
          allImages={images}
          onImagesChange={onImagesChange}
          isSelected={selectedId === img.id}
          onSelect={() => handleSelect(img.id)}
          isBlocked={activeId !== null && activeId !== img.id}
          onManipulateStart={() => startTransition(() => setActiveId(img.id))}
          onManipulateEnd={() => startTransition(() => setActiveId(null))}
          forExport={forExport}
        />
      ))}
    </div>
  );
}

// ── Item ──────────────────────────────────────────────────────────────────────
interface ItemProps {
  image: MoodboardImage;
  containerWidth: number;
  containerHeight: number;
  containerRef: React.RefObject<HTMLDivElement>;
  allImages: MoodboardImage[];
  onImagesChange: (imgs: MoodboardImage[]) => void;
  isSelected: boolean;
  onSelect: () => void;
  isBlocked: boolean;
  onManipulateStart: () => void;
  onManipulateEnd: () => void;
  forExport?: boolean;
}

function MoodboardImageItem({
  image,
  containerWidth,
  containerHeight,
  containerRef,
  allImages,
  onImagesChange,
  isSelected,
  onSelect,
  isBlocked,
  onManipulateStart,
  onManipulateEnd,
  forExport = false,
}: ItemProps) {
  // Position via MotionValues — Framer Motion handles the CSS transform chain
  // (including the book's mobile -90° rotation) automatically during drag.
  const mx = useMotionValue(image.x);
  const my = useMotionValue(image.y);
  // MotionValues for size + rotation — updated directly in move handlers to avoid
  // React re-renders on every touch/pointer move event (mobile performance fix)
  const widthMV = useMotionValue(image.width);
  const heightMV = useMotionValue(image.height);
  const rotateMV = useMotionValue(image.rotation);

  // Live size + rotation (updated immediately during resize/rotate for smooth UX)
  const [live, setLive] = useState({
    width: image.width,
    height: image.height,
    rotation: image.rotation,
  });
  const [isTransforming, setIsTransforming] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Sync when the image prop changes from outside (e.g. initial load, page switch)
  useEffect(() => {
    mx.set(image.x);
    my.set(image.y);
    widthMV.set(image.width);
    heightMV.set(image.height);
    rotateMV.set(image.rotation);
    const synced = { width: image.width, height: image.height, rotation: image.rotation };
    liveRef.current = synced;
    setLive(synced);
  }, [image.x, image.y, image.width, image.height, image.rotation]); // eslint-disable-line

  const divRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<ActiveInteraction | null>(null);
  const dragRef = useRef<{ startPtr: { x: number; y: number }; startImg: { x: number; y: number } } | null>(null);

  // Stable refs so event handlers never become stale
  const imageRef = useRef(image);
  const allRef = useRef(allImages);
  const changeRef = useRef(onImagesChange);
  const onManipulateStartRef = useRef(onManipulateStart);
  const onManipulateEndRef = useRef(onManipulateEnd);
  onManipulateStartRef.current = onManipulateStart;
  onManipulateEndRef.current = onManipulateEnd;
  // liveRef is updated SYNCHRONOUSLY in every move handler so handleInteractionUp
  // always reads the latest values regardless of React render batching.
  const liveRef = useRef(live);
  imageRef.current = image;
  allRef.current = allImages;
  changeRef.current = onImagesChange;
  // Do NOT sync liveRef from live state here — it is written imperatively in move handlers.

  // ── Screen ↔ page coordinate conversion ────────────────────────────────────
  // Accounts for bookScale and the optional -90° mobile rotation that wraps the
  // HTMLFlipBook. getBoundingClientRect() on the layer container already reflects
  // all ancestor CSS transforms, so we can derive the mapping directly from it.
  const screenToPage = useCallback(
    (sx: number, sy: number): { x: number; y: number } => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();

      // Heuristic: if the container's rendered width is closer to containerHeight
      // than containerWidth, the page has been rotated -90° (mobile layout).
      const scaleFlat = rect.width / containerWidth;
      const scaleRot = rect.width / containerHeight;
      const isRotated =
        Math.abs(rect.height - containerWidth * scaleRot) <
        Math.abs(rect.height - containerHeight * scaleFlat);

      if (!isRotated) {
        const scale = rect.width / containerWidth;
        return { x: (sx - rect.left) / scale, y: (sy - rect.top) / scale };
      }

      // Page rotated -90° around its own center.
      // Derived formula (rotation around element center):
      //   px = containerWidth/2  − (sy − rectCy) / scale
      //   py = containerHeight/2 + (sx − rectCx) / scale
      const scale = rect.width / containerHeight;
      const rectCx = rect.left + rect.width / 2;
      const rectCy = rect.top + rect.height / 2;
      return {
        x: containerWidth / 2 - (sy - rectCy) / scale,
        y: containerHeight / 2 + (sx - rectCx) / scale,
      };
    },
    [containerRef, containerWidth, containerHeight],
  );

  // Screen position of the image center (for rotation angle calculation)
  const centerScreen = useCallback(
    (img: MoodboardImage): { x: number; y: number } => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();

      const scaleFlat = rect.width / containerWidth;
      const scaleRot = rect.width / containerHeight;
      const isRotated =
        Math.abs(rect.height - containerWidth * scaleRot) <
        Math.abs(rect.height - containerHeight * scaleFlat);

      const pageCx = img.x + img.width / 2;
      const pageCy = img.y + img.height / 2;

      if (!isRotated) {
        const scale = rect.width / containerWidth;
        return { x: rect.left + pageCx * scale, y: rect.top + pageCy * scale };
      }

      // Inverse of screenToPage:
      //   sx = rectCx + (pageCy − containerHeight/2) * scale
      //   sy = rectCy − (pageCx − containerWidth/2)  * scale
      const scale = rect.width / containerHeight;
      const rectCx = rect.left + rect.width / 2;
      const rectCy = rect.top + rect.height / 2;
      return {
        x: rectCx + (pageCy - containerHeight / 2) * scale,
        y: rectCy - (pageCx - containerWidth / 2) * scale,
      };
    },
    [containerRef, containerWidth, containerHeight],
  );

  // ── Helpers: rotate a local offset into page space ─────────────────────────
  const rotateLocal = (
    cx: number, cy: number,
    lx: number, ly: number,
    cosR: number, sinR: number,
  ) => ({
    x: cx + lx * cosR - ly * sinR,
    y: cy + lx * sinR + ly * cosR,
  });

  // ── Drag ──────────────────────────────────────────────────────────────────
  const stopNative = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    (e.nativeEvent as Event).stopImmediatePropagation();
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      stopNative(e);
      onSelect();
      if (activeRef.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const ptr = screenToPage(e.clientX, e.clientY);
      dragRef.current = { startPtr: ptr, startImg: { x: mx.get(), y: my.get() } };
      onManipulateStartRef.current();
    },
    [stopNative, onSelect, screenToPage, mx, my],
  );

  // ── Resize / Rotate start ─────────────────────────────────────────────────
  const startInteraction = useCallback(
    (
      e: React.PointerEvent,
      type: "resize" | "rotate",
      handle: HandleType,
    ) => {
      e.stopPropagation();
      (e.nativeEvent as Event).stopImmediatePropagation();
      e.preventDefault();
      onSelect();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setIsTransforming(true);
      onManipulateStartRef.current();

      const img = imageRef.current;
      const cx = img.x + img.width / 2;
      const cy = img.y + img.height / 2;
      const hw = img.width / 2;
      const hh = img.height / 2;
      const rad = (img.rotation * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);

      if (type === "resize") {
        // Anchor = visual position (in page space) of the FIXED opposite corner/edge
        let ax = cx, ay = cy;
        switch (handle as ResizeHandle) {
          case "se": ({ x: ax, y: ay } = rotateLocal(cx, cy, -hw, -hh, cosR, sinR)); break;
          case "sw": ({ x: ax, y: ay } = rotateLocal(cx, cy, hw, -hh, cosR, sinR)); break;
          case "ne": ({ x: ax, y: ay } = rotateLocal(cx, cy, -hw, hh, cosR, sinR)); break;
          case "nw": ({ x: ax, y: ay } = rotateLocal(cx, cy, hw, hh, cosR, sinR)); break;
          case "e": ({ x: ax, y: ay } = rotateLocal(cx, cy, -hw, 0, cosR, sinR)); break;
          case "w": ({ x: ax, y: ay } = rotateLocal(cx, cy, hw, 0, cosR, sinR)); break;
          case "s": ({ x: ax, y: ay } = rotateLocal(cx, cy, 0, -hh, cosR, sinR)); break;
          case "n": ({ x: ax, y: ay } = rotateLocal(cx, cy, 0, hh, cosR, sinR)); break;
        }
        activeRef.current = {
          type: "resize", handle,
          startImg: { ...img },
          anchor: { x: ax, y: ay },
        };
      } else {
        const cs = centerScreen(img);
        const ang = Math.atan2(e.clientY - cs.y, e.clientX - cs.x) * (180 / Math.PI);
        activeRef.current = {
          type: "rotate", handle,
          startImg: { ...img },
          centerScreen: cs,
          startAngle: ang,
        };
      }
    },
    [onSelect, centerScreen],
  );

  // ── Resize / Rotate move ──────────────────────────────────────────────────
  const handleInteractionMove = useCallback(
    (e: React.PointerEvent) => {
      const act = activeRef.current;
      if (!act) {
        if (dragRef.current) {
          const d = dragRef.current;
          const ptr = screenToPage(e.clientX, e.clientY);
          mx.set(d.startImg.x + ptr.x - d.startPtr.x);
          my.set(d.startImg.y + ptr.y - d.startPtr.y);
        }
        return;
      }

      const img = act.startImg;
      const rad = (img.rotation * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const hw = img.width / 2;
      const hh = img.height / 2;
      const cx = img.x + hw;
      const cy = img.y + hh;

      if (act.type === "rotate") {
        const cs = act.centerScreen!;
        const ang = Math.atan2(e.clientY - cs.y, e.clientX - cs.x) * (180 / Math.PI);
        const newRot = img.rotation + (ang - act.startAngle!);
        liveRef.current = { ...liveRef.current, rotation: newRot };
        rotateMV.set(newRot);
        return;
      }

      // ── Resize ──────────────────────────────────────────────────────────
      const anchor = act.anchor!;
      const ptr = screenToPage(e.clientX, e.clientY);
      const dax = ptr.x - anchor.x;
      const day = ptr.y - anchor.y;

      // Project pointer delta (from anchor) onto image-local axes
      const localX = dax * cosR + day * sinR;
      const localY = -dax * sinR + day * cosR;

      let newW = img.width, newH = img.height;
      let newCx = cx, newCy = cy;

      switch (act.handle as ResizeHandle) {
        // ── Corners: midpoint formula + diagonal projection ──────────────
        case "se":
          newW = Math.max(MIN_DIM, localX);
          newH = Math.max(MIN_DIM, localY);
          newCx = (anchor.x + ptr.x) / 2;
          newCy = (anchor.y + ptr.y) / 2;
          break;
        case "sw":
          newW = Math.max(MIN_DIM, -localX);
          newH = Math.max(MIN_DIM, localY);
          newCx = (anchor.x + ptr.x) / 2;
          newCy = (anchor.y + ptr.y) / 2;
          break;
        case "ne":
          newW = Math.max(MIN_DIM, localX);
          newH = Math.max(MIN_DIM, -localY);
          newCx = (anchor.x + ptr.x) / 2;
          newCy = (anchor.y + ptr.y) / 2;
          break;
        case "nw":
          newW = Math.max(MIN_DIM, -localX);
          newH = Math.max(MIN_DIM, -localY);
          newCx = (anchor.x + ptr.x) / 2;
          newCy = (anchor.y + ptr.y) / 2;
          break;
        case "e": {
          newW = Math.max(MIN_DIM, localX);
          newH = img.height;
          newCx = anchor.x + (newW / 2) * cosR;
          newCy = anchor.y + (newW / 2) * sinR;
          break;
        }
        case "w": {
          newW = Math.max(MIN_DIM, -localX);
          newH = img.height;
          newCx = anchor.x - (newW / 2) * cosR;
          newCy = anchor.y - (newW / 2) * sinR;
          break;
        }
        case "s": {
          newW = img.width;
          newH = Math.max(MIN_DIM, localY);
          newCx = anchor.x - (newH / 2) * sinR;
          newCy = anchor.y + (newH / 2) * cosR;
          break;
        }
        case "n": {
          newW = img.width;
          newH = Math.max(MIN_DIM, -localY);
          newCx = anchor.x + (newH / 2) * sinR;
          newCy = anchor.y - (newH / 2) * cosR;
          break;
        }
      }

      const newX = newCx - newW / 2;
      const newY = newCy - newH / 2;
      mx.set(newX);
      my.set(newY);
      // Write to liveRef SYNCHRONOUSLY so handleInteractionUp always reads the
      // latest values regardless of whether React has re-rendered yet.
      liveRef.current = { ...liveRef.current, width: newW, height: newH };
      widthMV.set(newW);
      heightMV.set(newH);
    },
    [screenToPage, mx, my],
  );

  // ── Resize / Rotate end ───────────────────────────────────────────────────
  const handleInteractionUp = useCallback(
    (_e: React.PointerEvent) => {
      if (dragRef.current) {
        dragRef.current = null;
        const img = imageRef.current;
        const lt = liveRef.current;
        const clX = Math.max(0, Math.min(containerWidth - lt.width, mx.get()));
        const clY = Math.max(0, Math.min(containerHeight - lt.height, my.get()));
        mx.set(clX);
        my.set(clY);
        startTransition(() => {
          changeRef.current(allRef.current.map((i) => (i.id === img.id ? { ...img, x: clX, y: clY, width: lt.width, height: lt.height, rotation: lt.rotation } : i)));
        });
        onManipulateEndRef.current();
        return;
      }
      const act = activeRef.current;
      if (!act) return;
      activeRef.current = null;
      setIsTransforming(false);
      onManipulateEndRef.current();
      const img = imageRef.current;
      const lt = liveRef.current;
      const updated: MoodboardImage = {
        ...img,
        x: mx.get(),
        y: my.get(),
        width: lt.width,
        height: lt.height,
        rotation: lt.rotation,
      };
      startTransition(() => {
        changeRef.current(allRef.current.map((i) => (i.id === img.id ? updated : i)));
      });
    },
    [mx, my],
  );

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.nativeEvent as Event).stopImmediatePropagation();
      const img = imageRef.current;
      changeRef.current(allRef.current.filter((i) => i.id !== img.id));
    },
    [],
  );

  // ── Touch: pinch-scale + two-finger rotate ────────────────────────────────
  const touchRef = useRef<{
    dist0: number; angle0: number;
    w0: number; h0: number; rot0: number; cx0: number; cy0: number;
  } | null>(null);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      e.stopImmediatePropagation();
      if (e.touches.length !== 2) {
        touchRef.current = null;
        setIsTransforming(false);
        return;
      }
      setIsTransforming(true);
      onManipulateStartRef.current();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const img = imageRef.current;
      touchRef.current = {
        dist0: Math.hypot(dx, dy),
        angle0: Math.atan2(dy, dx),
        w0: img.width,
        h0: img.height,
        rot0: img.rotation,
        cx0: img.x + img.width / 2,
        cy0: img.y + img.height / 2,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchRef.current || e.touches.length !== 2) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const ts = touchRef.current;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const ratio = Math.hypot(dx, dy) / ts.dist0;
      const dAngle = (Math.atan2(dy, dx) - ts.angle0) * (180 / Math.PI);
      const newW = Math.max(MIN_DIM, Math.min(1000, ts.w0 * ratio));
      const newH = Math.max(MIN_DIM, Math.min(1000, ts.h0 * ratio));
      mx.set(ts.cx0 - newW / 2);
      my.set(ts.cy0 - newH / 2);
      const nextLive = { width: newW, height: newH, rotation: ts.rot0 + dAngle };
      liveRef.current = nextLive;
      widthMV.set(newW);
      heightMV.set(newH);
      rotateMV.set(nextLive.rotation);
    };

    const onTouchEnd = () => {
      if (!touchRef.current) return;
      touchRef.current = null;
      setIsTransforming(false);
      onManipulateEndRef.current();
      const img = imageRef.current;
      const lt = liveRef.current;
      const updated: MoodboardImage = {
        ...img, x: mx.get(), y: my.get(),
        width: lt.width, height: lt.height, rotation: lt.rotation,
      };
      changeRef.current(allRef.current.map((i) => (i.id === img.id ? updated : i)));
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
  }, [mx, my]); // eslint-disable-line

  // ── Handle definitions ────────────────────────────────────────────────────
  const resizeHandles: {
    handle: ResizeHandle;
    style: React.CSSProperties;
    cursor: string;
  }[] = [
      { handle: "nw", cursor: "nwse-resize", style: { top: CORNER_OFF, left: CORNER_OFF, width: CORNER_H, height: CORNER_H, borderRadius: "50%" } },
      { handle: "ne", cursor: "nesw-resize", style: { top: CORNER_OFF, right: CORNER_OFF, width: CORNER_H, height: CORNER_H, borderRadius: "50%" } },
      { handle: "se", cursor: "nwse-resize", style: { bottom: CORNER_OFF, right: CORNER_OFF, width: CORNER_H, height: CORNER_H, borderRadius: "50%" } },
      { handle: "sw", cursor: "nesw-resize", style: { bottom: CORNER_OFF, left: CORNER_OFF, width: CORNER_H, height: CORNER_H, borderRadius: "50%" } },
      { handle: "n", cursor: "ns-resize", style: { top: EDGE_OFF, left: "50%", transform: "translateX(-50%)", width: EDGE_LONG, height: EDGE_SHORT, borderRadius: 2 } },
      { handle: "s", cursor: "ns-resize", style: { bottom: EDGE_OFF, left: "50%", transform: "translateX(-50%)", width: EDGE_LONG, height: EDGE_SHORT, borderRadius: 2 } },
      { handle: "e", cursor: "ew-resize", style: { right: EDGE_OFF, top: "50%", transform: "translateY(-50%)", width: EDGE_SHORT, height: EDGE_LONG, borderRadius: 2 } },
      { handle: "w", cursor: "ew-resize", style: { left: EDGE_OFF, top: "50%", transform: "translateY(-50%)", width: EDGE_SHORT, height: EDGE_LONG, borderRadius: 2 } },
    ];

  const rotHandles: { handle: RotHandle; style: React.CSSProperties }[] = [
    { handle: "rot-nw", style: { top: ROT_OFF, left: ROT_OFF } },
    { handle: "rot-ne", style: { top: ROT_OFF, right: ROT_OFF } },
    { handle: "rot-se", style: { bottom: ROT_OFF, right: ROT_OFF } },
    { handle: "rot-sw", style: { bottom: ROT_OFF, left: ROT_OFF } },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      data-mbimage={image.id}
      ref={divRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        x: mx,
        y: my,
        width: widthMV,
        height: heightMV,
        rotate: rotateMV,
        scale: 1,
        transformOrigin: "center center",
        cursor: isBlocked ? "default" : "grab",
        pointerEvents: isBlocked ? "none" : "auto",
        touchAction: "none",
        userSelect: "none",
        willChange: forExport ? undefined : "transform",
        zIndex: isSelected ? ((image.zIndex ?? 1) + 100) : (image.zIndex ?? 1),
        overflow: "visible",
        boxSizing: "border-box",
      }}
      onPointerDown={handlePointerDown}
      onMouseDown={stopNative}
      onPointerMove={handleInteractionMove}
      onPointerUp={handleInteractionUp}
      onPointerCancel={handleInteractionUp}
      onPointerEnter={(e) => { if (e.pointerType === "pen" || e.pointerType === "mouse") setIsHovered(true); }}
      onPointerLeave={() => setIsHovered(false)}
    >
      {/* ── Photo ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${image.src})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          borderRadius: RADIUS,
          pointerEvents: "none",
        }}
      />

      {/* ── Selection border ──────────────────────────────────────────────── */}
      {isSelected && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: RADIUS,
            border: "1.5px dashed rgba(99,102,241,0.75)",
            pointerEvents: "none",
            boxSizing: "border-box",
          }}
        />
      )}

      {/* ── Delete button (fixed size, top-right corner) ──────────────────── */}
      {isSelected && (
        <div
          style={{
            position: "absolute",
            top: -(DEL_SIZE / 2),
            right: -(DEL_SIZE / 2),
            width: DEL_SIZE,
            height: DEL_SIZE,
            borderRadius: "50%",
            background: "#fff",
            border: "1.5px solid rgba(0,0,0,0.13)",
            boxShadow: "0 1px 5px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 30,
            pointerEvents: "auto",
            touchAction: "none",
          }}
          onPointerDown={handleDelete}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="#444" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="#444" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* ── Resize handles ────────────────────────────────────────────────── */}
      {(isSelected || isHovered) &&
        resizeHandles.map(({ handle, style, cursor }) => (
          <div
            key={handle}
            style={{
              position: "absolute",
              background: "transparent",
              cursor,
              zIndex: 20,
              pointerEvents: "auto",
              touchAction: "none",
              ...style,
            }}
            onPointerDown={(e) => startInteraction(e, "resize", handle)}
            onPointerMove={handleInteractionMove}
            onPointerUp={handleInteractionUp}
            onPointerCancel={handleInteractionUp}
          />
        ))}

      {/* ── Rotate zones (outside corners) ───────────────────────────────── */}
      {(isSelected || isHovered) &&
        rotHandles.map(({ handle, style }) => (
          <div
            key={handle}
            style={{
              position: "absolute",
              width: ROT_SIZE,
              height: ROT_SIZE,
              cursor: "grab",
              zIndex: 15,
              pointerEvents: "auto",
              touchAction: "none",
              background: "transparent",
              ...style,
            }}
            onPointerDown={(e) => startInteraction(e, "rotate", handle)}
            onPointerMove={handleInteractionMove}
            onPointerUp={handleInteractionUp}
            onPointerCancel={handleInteractionUp}
          />
        ))}
    </motion.div>
  );
}
