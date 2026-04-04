"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PendingCrop } from "@/lib/types";

interface PunchCutterProps {
  pending: PendingCrop | null;
  onDone: (dataUrl: string, pageIndex: number, slotIndex: number) => void;
  onCancel: () => void;
}

type PunchState = "idle" | "punching";

async function createSlotCutAtPosition(
  imageSrc: string,
  viewW: number,
  viewH: number,
  cutX: number,
  cutY: number,
  cutW: number,
  cutH: number
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.setAttribute("crossOrigin", "anonymous");
    img.src = imageSrc;
  });

  const scaleX = image.width / viewW;
  const scaleY = image.height / viewH;
  const sx = Math.max(0, Math.min(image.width - 1, cutX * scaleX));
  const sy = Math.max(0, Math.min(image.height - 1, cutY * scaleY));
  const sw = Math.max(1, Math.min(image.width - sx, cutW * scaleX));
  const sh = Math.max(1, Math.min(image.height - sy, cutH * scaleY));

  const outW = Math.round(121 * 3);
  const outH = Math.round(158 * 3);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export default function PunchCutter({ pending, onDone, onCancel }: PunchCutterProps) {
  const [state, setState] = useState<PunchState>("idle");
  const [cutPreview, setCutPreview] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const movedRef = useRef(false);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const [cutterPos, setCutterPos] = useState({ x: 0, y: 0 });

  const cutterW = 272;
  const cutterH = 356;

  useEffect(() => {
    if (!pending) return;
    setState("idle");
    setCutPreview(null);
    movedRef.current = false;
    dragRef.current = null;
    setCutterPos({ x: 0, y: 0 });
    setViewSize({ w: 0, h: 0 });
  }, [pending]);

  const clampPos = useCallback(
    (x: number, y: number) => {
      const maxX = Math.max(0, viewSize.w - cutterW);
      const maxY = Math.max(0, viewSize.h - cutterH);
      return {
        x: Math.max(0, Math.min(maxX, x)),
        y: Math.max(0, Math.min(maxY, y)),
      };
    },
    [viewSize.h, viewSize.w]
  );

  const syncViewSize = useCallback(() => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setViewSize({ w: rect.width, h: rect.height });
    setCutterPos((prev) => {
      const centered = {
        x: (rect.width - cutterW) / 2,
        y: (rect.height - cutterH) / 2,
      };
      if (prev.x === 0 && prev.y === 0) return clampPos(centered.x, centered.y);
      return clampPos(prev.x, prev.y);
    });
  }, [clampPos]);

  useEffect(() => {
    const onResize = () => syncViewSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncViewSize]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (state !== "idle") return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: cutterPos.x,
        baseY: cutterPos.y,
      };
      movedRef.current = false;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [cutterPos.x, cutterPos.y, state]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current || state !== "idle") return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
      setCutterPos(clampPos(dragRef.current.baseX + dx, dragRef.current.baseY + dy));
    },
    [clampPos, state]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }, []);

  const handlePunch = useCallback(async () => {
    if (!pending || state !== "idle" || !viewSize.w || !viewSize.h) return;
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    try {
      setState("punching");
      const cut = await createSlotCutAtPosition(
        pending.objectUrl,
        viewSize.w,
        viewSize.h,
        cutterPos.x,
        cutterPos.y,
        cutterW,
        cutterH
      );
      setCutPreview(cut);
      window.setTimeout(() => {
        onDone(cut, pending.pageIndex, pending.slotIndex);
      }, 620);
    } catch (e) {
      console.error(e);
      setState("idle");
      setCutPreview(null);
    }
  }, [cutterPos.x, cutterPos.y, onDone, pending, state, viewSize.h, viewSize.w]);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={state === "idle" ? onCancel : undefined}
        >
          <motion.div
            className="relative z-10"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.99, opacity: 0 }}
          >
            <div className="relative select-none">
              <img
                ref={imageRef}
                src={pending.objectUrl}
                alt="source"
                onLoad={syncViewSize}
                className="block max-w-[68vw] max-h-[62vh] w-auto h-auto object-contain"
                draggable={false}
              />

              {viewSize.w > 0 && viewSize.h > 0 && (
                <>
                  <motion.button
                    onClick={handlePunch}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    disabled={state !== "idle"}
                    className="absolute touch-none"
                    style={{ left: cutterPos.x, top: cutterPos.y, width: cutterW, height: cutterH }}
                    animate={
                      state === "punching"
                        ? { y: [0, 24, -8, 0], scale: [1, 0.95, 1.02, 1], rotate: [0, -1.2, 0.7, 0] }
                        : { y: 0, scale: 1, rotate: 0 }
                    }
                    transition={{ duration: 0.36 }}
                  >
                    <img src="/assets/cutter.png" alt="cutter" className="w-full h-full object-contain" draggable={false} />
                  </motion.button>

                  <motion.div
                    className="absolute pointer-events-none rounded-[22px] overflow-hidden"
                    style={{ left: cutterPos.x, top: cutterPos.y, width: cutterW, height: cutterH }}
                    initial={false}
                    animate={
                      state === "punching"
                        ? { x: 132, y: 188, scale: 0.16, rotate: -18, opacity: 0 }
                        : { x: 0, y: 0, scale: 1, rotate: 0, opacity: 0 }
                    }
                    transition={{ duration: 0.6, ease: [0.2, 0.78, 0.2, 1] }}
                  >
                    {cutPreview && (
                      <img
                        src={cutPreview}
                        alt="cut preview"
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    )}
                  </motion.div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
