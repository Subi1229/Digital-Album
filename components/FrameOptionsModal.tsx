"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { FrameType } from "@/lib/types";

const FRAME_COLORS = [
  { label: "White", value: "#ffffff" },
  { label: "Cherry Red", value: "#48171F" },
  { label: "Black", value: "#1a1a1a" },
  { label: "Pastel Yellow", value: "#FFF9C4" },
  { label: "Pastel Pink", value: "#FFD6E0" },
];

interface FrameOptionsModalProps {
  open: boolean;
  frame: FrameType;
  onConfirm: (opts: { color: string; text: string; emoji: string; borderRadius?: number }) => void;
  onBack: () => void;
  onClose: () => void;
}

export default function FrameOptionsModal({
  open, frame, onConfirm, onBack, onClose,
}: FrameOptionsModalProps) {
  const [color, setColor] = useState("#ffffff");
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState("");
  const [borderRadius, setBorderRadius] = useState(15);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      const isTouch = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
      const isNarrow = window.innerWidth < 768;
      const isPortraitTablet = window.innerWidth < 1024 && window.innerHeight > window.innerWidth;
      setIsMobile(isTouch && (isNarrow || isPortraitTablet));
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const frameLabel: Record<FrameType, string> = {
    none: "Default",
    stamp: "Stamp",
    "wide-polaroid": "Wide Polaroid",
    "vertical-polaroid": "Vertical Polaroid",
    "clip-polaroid": "Clip Polaroid",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onTouchStart={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
          onTouchMove={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
          onPointerDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); if (e.target === e.currentTarget) onClose(); }}
        >
          <div style={isMobile ? {
            position: "fixed",
            zIndex: 9101,
            width: "100vh",
            height: "100vw",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%) rotate(-90deg)",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          } : { display: "contents" }}>
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              style={{
                background: "#fff",
                borderRadius: 20,
                padding: "24px 20px 20px",
                width: isMobile ? "min(90vw, 360px)" : "min(92vw, 380px)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                pointerEvents: "auto",
                maxHeight: isMobile ? "85vw" : "none",
                overflowY: "auto",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <button
                  onClick={onBack}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: 4, borderRadius: 6, color: "#888",
                    display: "flex", alignItems: "center",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#1e1e1e", fontFamily: "inherit", flex: 1 }}>
                  {frameLabel[frame]} Options
                </span>
                <button
                  onClick={onClose}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    width: 28, height: 28, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#888",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                    <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Color picker - hide for Default frame */}
              {frame !== "none" && (
                <div style={{ marginBottom: 18 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#79716B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 10 }}>
                    Frame Color
                  </span>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {FRAME_COLORS.map((c) => (
                      <motion.button
                        key={c.value}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setColor(c.value)}
                        title={c.label}
                        style={{
                          width: 34, height: 34,
                          borderRadius: "50%",
                          background: c.value,
                          border: color === c.value
                            ? "2.5px solid #1e1e1e"
                            : "1.5px solid #E7E5E4",
                          cursor: "pointer",
                          boxShadow: color === c.value ? "0 0 0 2px rgba(30,30,30,0.18)" : "none",
                          outline: "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Border Radius Control - Only for Default frame */}
              {frame === "none" && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#79716B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Image Radius
                    </span>
                    <input
                      type="number"
                      value={borderRadius}
                      onChange={(e) => setBorderRadius(Number(e.target.value))}
                      style={{
                        width: 45, padding: "2px 4px", borderRadius: 4, border: "1.5px solid #E7E5E4",
                        fontSize: 12, textAlign: "center", outline: "none"
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={borderRadius}
                    onChange={(e) => setBorderRadius(Number(e.target.value))}
                    style={{
                      width: "100%",
                      accentColor: "#1e1e1e",
                      cursor: "pointer",
                      height: 6,
                      background: "#E7E5E4",
                      borderRadius: 3,
                      appearance: "none",
                    }}
                  />
                </div>
              )}

              {/* Text input (wide-polaroid) */}
              {frame === "wide-polaroid" && (
                <div style={{ marginBottom: 18 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#79716B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
                    Caption Text
                  </span>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="With love."
                    maxLength={40}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 10,
                      border: "1.5px solid #E7E5E4",
                      fontSize: 13,
                      fontFamily: "'Dancing Script', cursive",
                      color: "#1e1e1e",
                      outline: "none",
                      boxSizing: "border-box",
                      background: "#FAFAFA",
                    }}
                  />
                </div>
              )}

              {/* Emoji picker (vertical-polaroid) */}
              {frame === "vertical-polaroid" && (
                <div style={{ marginBottom: 18 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#79716B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
                    Emoji (optional)
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <motion.button
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setShowEmojiPicker(v => !v)}
                      style={{
                        width: 44, height: 44, borderRadius: 10,
                        border: "1.5px solid #E7E5E4",
                        background: "#F8F7F5",
                        cursor: "pointer", fontSize: 24,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {emoji || "😊"}
                    </motion.button>
                    {emoji && (
                      <button onClick={() => setEmoji("")}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#aaa", fontFamily: "inherit" }}>
                        Clear
                      </button>
                    )}
                  </div>
                  {showEmojiPicker && (
                    <div style={{ marginTop: 8, position: "relative", zIndex: 10 }}>
                      <EmojiPicker
                        onEmojiClick={(data: EmojiClickData) => {
                          setEmoji(data.emoji);
                          setShowEmojiPicker(false);
                        }}
                        theme={Theme.LIGHT}
                        width="100%"
                        height={280}
                        searchDisabled={false}
                        skinTonesDisabled
                        previewConfig={{ showPreview: false }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Confirm */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onConfirm({ color, text, emoji, borderRadius })}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 12,
                  background: "#1e1e1e",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "inherit",
                }}
              >
                Pick Image
              </motion.button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
