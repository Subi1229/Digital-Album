"use client";

import React, { useRef } from "react";
import { motion } from "framer-motion";
// MOBILE FIX: suppress ghost clicks that originate from sticker interactions
import { isStickerRecentlyPressed, wasCornerTapRecent } from "@/lib/stickerInteraction";

interface ImageSlotProps {
  imageUrl: string | null;
  onClick: () => void;
  onDropFile?: (file: File) => void;
  onLongPress?: () => void;
  slotWidth: number;
  slotHeight: number;
}

export default function ImageSlot({
  imageUrl,
  onClick,
  onDropFile,
  onLongPress,
  slotWidth,
  slotHeight,
}: ImageSlotProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = () => {
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        onLongPress();
      }, 600);
    }
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!onDropFile) return;
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!onDropFile) return;
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onDropFile(file);
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
        onDropFile(dropped);
      })
      .catch(() => { });
  };

  return (
    <motion.div
      // data-slot lets AlbumBook skip corner-flip detection when the tap
      // lands on a photo slot (prevents slot tap from simultaneously
      // opening the file picker AND flipping the page on mobile).
      data-slot="true"
      className="relative cursor-pointer select-none"
      style={{
        width: slotWidth,
        height: slotHeight,
        borderRadius: 6,
        overflow: "hidden",
        background: imageUrl ? "transparent" : "#F8F7F5",
        boxShadow: imageUrl
          ? "0 1px 4px rgba(0,0,0,0.10)"
          : "inset 0 1px 3px rgba(0,0,0,0.05)",
        border: imageUrl ? "none" : "1.5px dashed #E7E5E4",
        flexShrink: 0,
      }}
      whileHover={
        !imageUrl
          ? { scale: 1.03, boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }
          : { scale: 1.02, boxShadow: "0 4px 14px rgba(0,0,0,0.15)" }
      }
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={() => {
        // MOBILE FIX: ghost click from sticker interaction — swallow silently.
        if (isStickerRecentlyPressed()) return;
        // MOBILE FIX: corner tap fired goPrev/goNext — swallow so the file
        // picker doesn't open when the corner zone overlaps an image slot.
        if (wasCornerTapRecent()) return;
        onClick();
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt="Album photo"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              borderRadius: 6,
            }}
            draggable={false}
          />
          {/* Subtle overlay for hover-replace hint */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center rounded"
            style={{ background: "rgba(0,0,0,0)" }}
            whileHover={{ background: "rgba(0,0,0,0.30)" }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="flex flex-col items-center gap-1"
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path
                  d="M14.5 3.5L16.5 5.5L7 15H5V13L14.5 3.5Z"
                  fill="white"
                  strokeWidth="0"
                />
                <path
                  d="M3 17H17"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-white text-[9px] font-medium tracking-wide">
                Replace
              </span>
            </motion.div>
          </motion.div>
        </>
      ) : (
        /* Empty slot */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <motion.div
            whileHover={{ scale: 1.15 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#B5B3B1"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </motion.div>
          <span className="text-[9px] text-stone-400 font-medium tracking-wide">
            Add Photo
          </span>
        </div>
      )}
    </motion.div>
  );
}
