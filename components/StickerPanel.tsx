"use client";

import React, { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sticker, LibrarySticker } from "@/lib/types";
import {
  saveSticker,
  saveLibrarySticker,
  deleteLibrarySticker,
  deleteSticker,
} from "@/lib/db";
import {
  hasTransparency,
  removeBackground,
  applyWhiteStroke,
  resizeImage,
  compressImage,
  srcFingerprint,
} from "@/lib/stickerUtils";

const isDev = process.env.NODE_ENV === "development";
const dbg = isDev ? (...a: unknown[]) => console.log("[StickerPanel]", ...a) : () => {};

type ProcessingStep = "idle" | "checking" | "needs-removal" | "processing" | "done";

interface StickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  allStickers: Sticker[];
  currentPage: number;
  onStickersChange: (stickers: Sticker[]) => void;
  libraryStickers: LibrarySticker[];
  onLibraryChange: (ls: LibrarySticker[]) => void;
}

export default function StickerPanel({
  isOpen,
  onClose,
  allStickers,
  currentPage,
  onStickersChange,
  libraryStickers,
  onLibraryChange,
}: StickerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ProcessingStep>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  // ── Place sticker (from library tap or after upload) ─────────────────────
  // saveToLibrary=true when it's a freshly processed upload (not yet catalogued)
  const placeSticker = useCallback(
    async (src: string, saveToLibrary = false) => {
      try {
        const { v4: uuidv4 } = await import("uuid");

        // 1. Save to library catalog if this is a new image
        if (saveToLibrary) {
          const fp = srcFingerprint(src);
          const isDuplicate = libraryStickers.some(
            (ls) => srcFingerprint(ls.src) === fp
          );
          if (!isDuplicate) {
            const libEntry: LibrarySticker = {
              id: uuidv4(),
              src,
              createdAt: Date.now(),
            };
            await saveLibrarySticker(libEntry);
            onLibraryChange([...libraryStickers, libEntry]);
            dbg("saved new library sticker", libEntry.id);
          } else {
            dbg("duplicate skipped");
          }
        }

        // 2. Create a placed-sticker instance on the current page
        const newSticker: Sticker = {
          id: uuidv4(),
          pageIndex: currentPage,
          dataUrl: src,
          x: 0.35 + Math.random() * 0.3,
          y: 0.35 + Math.random() * 0.3,
          width: 96,
          height: 96,
          rotation: Math.random() * 16 - 8,
        };

        await saveSticker(newSticker);
        onStickersChange([...allStickers, newSticker]);
        dbg("placed sticker on page", currentPage, newSticker.id);

        setStep("idle");
        setPreviewUrl(null);
        setProcessedUrl(null);
        onClose();
      } catch (err) {
        console.error("[StickerPanel] placeSticker failed:", err);
        // Retry once
        try {
          await new Promise((r) => setTimeout(r, 200));
          const { v4: uuidv4 } = await import("uuid");
          const retry: Sticker = {
            id: uuidv4(),
            pageIndex: currentPage,
            dataUrl: src,
            x: 0.4,
            y: 0.4,
            width: 96,
            height: 96,
            rotation: 0,
          };
          await saveSticker(retry);
          onStickersChange([...allStickers, retry]);
          onClose();
        } catch (retryErr) {
          console.error("[StickerPanel] retry also failed:", retryErr);
        }
      }
    },
    [allStickers, currentPage, libraryStickers, onLibraryChange, onStickersChange, onClose]
  );

  // ── Delete from library ───────────────────────────────────────────────────
  const handleDeleteLibrary = useCallback(
    async (ls: LibrarySticker, e: React.MouseEvent) => {
      e.stopPropagation();
      const srcFp = srcFingerprint(ls.src);
      const legacySentinelIds = allStickers
        .filter(
          (s) => s.pageIndex === -1 && srcFingerprint(s.dataUrl) === srcFp
        )
        .map((s) => s.id);
      try {
        await deleteLibrarySticker(ls.id);
        await Promise.all(legacySentinelIds.map((id) => deleteSticker(id)));
        onLibraryChange(libraryStickers.filter((x) => x.id !== ls.id));
        if (legacySentinelIds.length > 0) {
          const legacySet = new Set(legacySentinelIds);
          onStickersChange(allStickers.filter((s) => !legacySet.has(s.id)));
        }
      } catch (err) {
        console.error("[StickerPanel] deleteLibrarySticker failed:", err);
      }
    },
    [allStickers, libraryStickers, onLibraryChange, onStickersChange]
  );

  // ── File selected ─────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const rawSrc = ev.target?.result as string;
        if (!rawSrc) return;

        const resized = await resizeImage(rawSrc, 400);
        setPreviewUrl(resized);
        setStep("checking");
        setStatusMsg("Checking transparency…");

        const transparent = await hasTransparency(resized);
        if (transparent) {
          setStatusMsg("Applying sticker outline…");
          setStep("processing");
          const stroked = await applyWhiteStroke(resized);
          const final = await compressImage(stroked);
          if (!final) { setStep("idle"); return; }
          setProcessedUrl(final);
          setStep("done");
          setStatusMsg("Ready!");
        } else {
          setStep("needs-removal");
          setStatusMsg("This image has no transparent background.");
        }
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const handleConvert = useCallback(async () => {
    if (!previewUrl) return;
    setStep("processing");
    setStatusMsg("Removing background…");
    const noBg = await removeBackground(previewUrl);
    setStatusMsg("Applying sticker outline…");
    const stroked = await applyWhiteStroke(noBg);
    const final = await compressImage(stroked);
    setProcessedUrl(final);
    setStep("done");
    setStatusMsg("Done!");
  }, [previewUrl]);

  const handleSkipConvert = useCallback(async () => {
    if (!previewUrl) return;
    setStep("processing");
    setStatusMsg("Applying sticker outline…");
    const stroked = await applyWhiteStroke(previewUrl);
    const final = await compressImage(stroked);
    setProcessedUrl(final);
    setStep("done");
    setStatusMsg("Done!");
  }, [previewUrl]);

  const handleCancel = () => {
    setStep("idle");
    setPreviewUrl(null);
    setProcessedUrl(null);
    setStatusMsg("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(2px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { handleCancel(); onClose(); }}
          />

          {/* Panel */}
          <motion.div
            className="fixed z-50 flex flex-col rounded-2xl overflow-hidden"
            style={{
              bottom: 80,
              left: "50%",
              width: 320,
              maxHeight: "70vh",
              background: "rgba(255,255,255,0.97)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
            initial={{ opacity: 0, y: 16, x: "-50%", scale: 0.95 }}
            animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
            exit={{ opacity: 0, y: 10, x: "-50%", scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}
            >
              <div>
                <h3 className="font-sans font-semibold text-sm" style={{ color: "#292524" }}>
                  Sticker Library
                </h3>
                <p className="font-sans text-xs mt-0.5" style={{ color: "#A8A29E" }}>
                  {libraryStickers.length} sticker{libraryStickers.length !== 1 ? "s" : ""} saved
                </p>
              </div>
              <button
                onClick={() => { handleCancel(); onClose(); }}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                style={{ color: "#A8A29E" }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>

              {/* ── Processing flow ── */}
              {step !== "idle" && (
                <div className="mb-4">
                  <div
                    className="rounded-xl p-4 flex flex-col items-center gap-3"
                    style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}
                  >
                    <div className="flex items-center gap-3">
                      {previewUrl && (
                        <div className="flex flex-col items-center gap-1">
                          <img
                            src={previewUrl}
                            alt="original"
                            className="rounded-lg object-contain"
                            style={{ width: 80, height: 80, background: "#f5f5f5", border: "1px solid rgba(0,0,0,0.08)" }}
                          />
                          <span className="text-xs font-sans" style={{ color: "#A8A29E" }}>Original</span>
                        </div>
                      )}
                      {processedUrl && (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="#A8A29E" strokeWidth="2" strokeLinecap="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          <div className="flex flex-col items-center gap-1">
                            <img
                              src={processedUrl}
                              alt="sticker"
                              className="rounded-lg object-contain"
                              style={{
                                width: 80, height: 80,
                                background: "repeating-conic-gradient(#e5e5e5 0% 25%, white 0% 50%) 0 0 / 10px 10px",
                                border: "1px solid rgba(0,0,0,0.08)"
                              }}
                            />
                            <span className="text-xs font-sans" style={{ color: "#A8A29E" }}>Sticker</span>
                          </div>
                        </>
                      )}
                    </div>

                    <p className="text-xs font-sans text-center" style={{ color: "#79716B" }}>
                      {statusMsg}
                    </p>

                    {(step === "checking" || step === "processing") && (
                      <motion.div
                        className="w-5 h-5 rounded-full border-2 border-stone-200 border-t-stone-500"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      />
                    )}

                    {step === "needs-removal" && (
                      <div className="flex flex-col gap-2 w-full">
                        <button
                          onClick={handleConvert}
                          className="w-full py-2 rounded-xl text-sm font-semibold font-sans"
                          style={{ background: "#292524", color: "white" }}
                        >
                          ✨ Auto-remove background
                        </button>
                        <button
                          onClick={handleSkipConvert}
                          className="w-full py-2 rounded-xl text-sm font-sans"
                          style={{ background: "rgba(0,0,0,0.05)", color: "#57534E" }}
                        >
                          Use as-is (add outline only)
                        </button>
                        <button onClick={handleCancel} className="w-full py-1.5 text-xs font-sans" style={{ color: "#A8A29E" }}>
                          Cancel
                        </button>
                      </div>
                    )}

                    {step === "done" && processedUrl && (
                      <div className="flex gap-2 w-full">
                        <button
                          onClick={handleCancel}
                          className="flex-1 py-2 rounded-xl text-sm font-sans"
                          style={{ background: "rgba(0,0,0,0.05)", color: "#57534E" }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => placeSticker(processedUrl, true)}
                          className="flex-1 py-2 rounded-xl text-sm font-semibold font-sans"
                          style={{ background: "#292524", color: "white" }}
                        >
                          Place Sticker
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Upload button ── */}
              {step === "idle" && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl mb-4 font-sans text-sm font-medium"
                  style={{
                    background: "rgba(0,0,0,0.04)",
                    border: "1.5px dashed rgba(0,0,0,0.12)",
                    color: "#57534E",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Upload New Sticker
                </button>
              )}

              {/* ── Library grid ── */}
              {libraryStickers.length === 0 && step === "idle" ? (
                <div className="text-center py-6">
                  <div className="text-3xl mb-2">🌟</div>
                  <p className="text-xs font-sans" style={{ color: "#A8A29E" }}>
                    No stickers yet. Upload one above!
                  </p>
                </div>
              ) : (
                step === "idle" && (
                  <>
                    <p className="text-xs font-sans font-medium mb-2.5" style={{ color: "#A8A29E" }}>
                      Tap to add · Long-press to remove
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {libraryStickers.map((ls) => (
                        <div key={ls.id} className="relative group">
                          <motion.button
                            onClick={() => placeSticker(ls.src, false)}
                            className="w-full aspect-square rounded-xl flex items-center justify-center overflow-hidden"
                            style={{
                              background: "repeating-conic-gradient(#f0f0f0 0% 25%, white 0% 50%) 0 0 / 10px 10px",
                              border: "1px solid rgba(0,0,0,0.08)",
                            }}
                            whileHover={{ scale: 1.08 }}
                            whileTap={{ scale: 0.93 }}
                          >
                            <img
                              src={ls.src}
                              alt="sticker"
                              style={{ width: "80%", height: "80%", objectFit: "contain" }}
                              draggable={false}
                              loading="lazy"
                            />
                          </motion.button>
                          {/* Delete button */}
                          <motion.button
                            onClick={(e) => handleDeleteLibrary(ls, e)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"
                            style={{ background: "#EF4444", color: "white", fontSize: 9, lineHeight: 1 }}
                            whileTap={{ scale: 0.85 }}
                            transition={{ duration: 0.15 }}
                          >
                            ✕
                          </motion.button>
                        </div>
                      ))}
                    </div>
                  </>
                )
              )}
            </div>
          </motion.div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </>
      )}
    </AnimatePresence>
  );
}
