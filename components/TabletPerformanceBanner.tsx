"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function TabletPerformanceBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const isTouch = navigator.maxTouchPoints > 0;
      const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const w = window.innerWidth;
      // Tablets: touch + coarse pointer (no mouse/trackpad as primary) + width >= 700
      // Excludes: mobile (< 700), desktop (no touch), touchscreen laptops (pointer: fine)
      const isTablet = isTouch && isCoarsePointer && w >= 700;
      setIsVisible(isTablet && !isDismissed);
    };

    checkDevice();
    window.addEventListener("resize", checkDevice);
    return () => window.removeEventListener("resize", checkDevice);
  }, [isDismissed]);

  if (isDismissed) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -100, opacity: 0, x: "-50%" }}
          animate={{ y: 20, opacity: 1, x: "-50%" }}
          exit={{ y: -100, opacity: 0, x: "-50%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{
            position: "fixed",
            top: 0,
            left: "50%",
            zIndex: 10000,
            background: "rgba(18, 18, 18, 0.94)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: "20px",
            boxShadow: "0 10px 35px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            width: "max-content",
            maxWidth: "calc(100vw - 40px)",
          }}
        >
          {/* GPU / performance icon */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="7" width="16" height="10" rx="2" fill="#F6AD55" opacity="0.2" />
              <rect x="2" y="5" width="20" height="14" rx="2.5" stroke="#F6E05E" strokeWidth="1.8" />
              <line x1="8" y1="2" x2="8" y2="5" stroke="#F6E05E" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="12" y1="2" x2="12" y2="5" stroke="#F6E05E" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="16" y1="2" x2="16" y2="5" stroke="#F6E05E" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="8" y1="19" x2="8" y2="22" stroke="#F6E05E" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="12" y1="19" x2="12" y2="22" stroke="#F6E05E" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="16" y1="19" x2="16" y2="22" stroke="#F6E05E" strokeWidth="1.8" strokeLinecap="round" />
              <rect x="7" y="9" width="10" height="6" rx="1" fill="#F6AD55" opacity="0.5" />
            </svg>
          </div>

          <span style={{
            fontSize: "13px",
            fontWeight: 500,
            lineHeight: "1.45",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            letterSpacing: "-0.01em",
            color: "#F7FAFC",
          }}>
            Heavy moodboard pages (GIFs, many images) may flicker on tablet due to GPU limits.{" "}
            <span style={{ color: "#F6E05E", fontWeight: 600 }}>Best experienced on desktop.</span>
          </span>

          {/* Close button */}
          <button
            onClick={() => setIsDismissed(true)}
            aria-label="Dismiss"
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              padding: "6px",
              marginLeft: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              borderRadius: "50%",
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = "#fff";
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.4)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
