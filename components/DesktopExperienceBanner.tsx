"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function DesktopExperienceBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const checkSize = () => {
      if (window.innerWidth < 700 && !isDismissed) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
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
          {/* Desktop Monitor Icon with glow */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", position: "relative" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="6" width="14" height="8" rx="1" fill="#4299E1" opacity="0.2" />
              <rect x="3" y="4" width="18" height="12" rx="2" stroke="#E2E8F0" strokeWidth="1.8"/>
              <path d="M12 16V19" stroke="#E2E8F0" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M8 20H16" stroke="#E2E8F0" strokeWidth="1.8" strokeLinecap="round"/>
              <rect x="9" y="19.5" width="6" height="1" rx="0.5" fill="#E2E8F0" opacity="0.4"/>
            </svg>
          </div>
          
          <span style={{ 
            fontSize: "14px", 
            fontWeight: 500, 
            lineHeight: "1.4",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            letterSpacing: "-0.01em",
            color: "#F7FAFC"
          }}>
            Best experienced on desktop — grab a bigger screen for the full experience.
          </span>

          {/* Close button */}
          <button 
            onClick={() => setIsDismissed(true)}
            aria-label="Close banner"
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
              transition: "all 0.2s ease",
              flexShrink: 0,
              borderRadius: "50%"
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
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
