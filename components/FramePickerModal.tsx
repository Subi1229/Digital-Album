"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FrameType } from "@/lib/types";

interface FramePickerModalProps {
  open: boolean;
  onSelect: (frame: FrameType) => void;
  onClose: () => void;
}

const FRAMES: { type: FrameType; label: string; preview: React.ReactNode }[] = [
  {
    type: "none",
    label: "Default",
    preview: (
      <svg viewBox="0 0 60 60" width="60" height="60">
        <rect x="4" y="4" width="52" height="52" rx="5" fill="#e8e4de" />
        <circle cx="22" cy="22" r="6" fill="#c8c2b8" />
        <polyline points="8,52 22,34 34,44 44,30 56,52" fill="#b0a898" stroke="none" />
      </svg>
    ),
  },
  {
    type: "stamp",
    label: "Stamp",
    preview: (
      <svg viewBox="0 0 64 64" width="60" height="60">
        {/* Stamp scalloped background */}
        <defs>
          <mask id="fp-stamp-mask">
            <rect width="64" height="64" fill="white" />
            {/* top holes */}
            {[8,16,24,32,40,48,56].map(x => <circle key={`t${x}`} cx={x} cy={5} r={4} fill="black" />)}
            {/* bottom holes */}
            {[8,16,24,32,40,48,56].map(x => <circle key={`b${x}`} cx={x} cy={59} r={4} fill="black" />)}
            {/* left holes */}
            {[14,24,34,44,54].map(y => <circle key={`l${y}`} cx={5} cy={y} r={4} fill="black" />)}
            {/* right holes */}
            {[14,24,34,44,54].map(y => <circle key={`r${y}`} cx={59} cy={y} r={4} fill="black" />)}
          </mask>
        </defs>
        <rect width="64" height="64" fill="#f5f0e8" mask="url(#fp-stamp-mask)" />
        <rect x="9" y="9" width="46" height="46" rx="2" fill="#d8cfc0" />
        <circle cx="26" cy="26" r="7" fill="#bdb4a4" />
        <polyline points="12,50 26,38 36,44 46,32 58,50" fill="#a89e90" stroke="none" />
      </svg>
    ),
  },
  {
    type: "wide-polaroid",
    label: "Wide Polaroid",
    preview: (
      <svg viewBox="0 0 70 60" width="68" height="60">
        <rect x="2" y="2" width="66" height="56" rx="3" fill="#fff" filter="url(#fp-shadow)" />
        <defs>
          <filter id="fp-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
          </filter>
        </defs>
        <rect x="6" y="5" width="58" height="38" rx="2" fill="#d4cfc8" />
        <circle cx="22" cy="22" r="7" fill="#b8b1a8" />
        <polyline points="9,41 22,30 34,36 46,24 62,41" fill="#a09890" stroke="none" />
        <text x="35" y="54" textAnchor="middle" fontSize="6" fontFamily="cursive" fill="#888">With love.</text>
      </svg>
    ),
  },
  {
    type: "vertical-polaroid",
    label: "Vertical Polaroid",
    preview: (
      <svg viewBox="0 0 50 70" width="44" height="60">
        <rect x="2" y="2" width="46" height="66" rx="3" fill="#fff" filter="url(#fp-shadow2)" />
        <defs>
          <filter id="fp-shadow2" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
          </filter>
        </defs>
        <rect x="5" y="5" width="40" height="48" rx="2" fill="#d4cfc8" />
        <circle cx="18" cy="22" r="7" fill="#b8b1a8" />
        <polyline points="7,51 18,40 28,46 36,34 43,51" fill="#a09890" stroke="none" />
        <text x="10" y="65" textAnchor="middle" fontSize="9">🌸</text>
      </svg>
    ),
  },
  {
    type: "clip-polaroid",
    label: "Clip Polaroid",
    preview: (
      <svg viewBox="0 0 50 70" width="44" height="60">
        <rect x="2" y="5" width="46" height="63" rx="3" fill="#fff" filter="url(#fp-clip-shadow)" />
        <defs>
          <filter id="fp-clip-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
          </filter>
        </defs>
        <rect x="5" y="8" width="40" height="45" rx="2" fill="#d4cfc8" />
        <circle cx="18" cy="24" r="7" fill="#b8b1a8" />
        <polyline points="7,51 18,40 28,46 36,34 43,51" fill="#a09890" stroke="none" />
        <rect x="18" y="0" width="14" height="22" rx="4" fill="#b8b8b8" stroke="#7f7f7f" strokeWidth="1.5" />
        <rect x="21" y="5" width="8" height="13" rx="3" fill="#f4f4f4" />
      </svg>
    ),
  },
];

export default function FramePickerModal({ open, onSelect, onClose }: FramePickerModalProps) {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onTouchStart={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
          onTouchMove={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
          onPointerDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); if (e.target === e.currentTarget) onClose(); }}
        >
          <div style={isMobile ? {
            position: "fixed",
            zIndex: 9001,
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
                width: isMobile ? "min(90vw, 360px)" : "min(92vw, 420px)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                pointerEvents: "auto",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#1e1e1e", fontFamily: "inherit" }}>
                  Choose Frame
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

              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
                gap: 12,
                maxHeight: isMobile ? "50vw" : "none",
                overflowY: isMobile ? "auto" : "visible",
                padding: isMobile ? "4px" : "0",
              }}>
                {FRAMES.map((f) => (
                  <motion.button
                    key={f.type}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onSelect(f.type)}
                    style={{
                      background: "#F8F7F5",
                      border: "1.5px solid #E7E5E4",
                      borderRadius: 12,
                      padding: "12px 8px 8px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      minHeight: 100,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 64 }}>
                      {f.preview}
                    </div>
                    <span style={{ fontSize: 10, color: "#57534E", fontFamily: "inherit", fontWeight: 500 }}>
                      {f.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
