"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
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
const dbg = isDev ? (...a: unknown[]) => console.log("[StickerPanel]", ...a) : () => { };

type ProcessingStep = "idle" | "checking" | "needs-removal" | "processing" | "done";

interface StickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  allStickers: Sticker[];
  currentPage: number;
  onStickersChange: (stickers: Sticker[]) => void;
  libraryStickers: LibrarySticker[];
  onLibraryChange: (ls: LibrarySticker[]) => void;
  showWashiTab?: boolean;
}

type WashiDef = {
  id: string;
  src: string;
};

function makeWashiDataUrl(
  base: string,
  pattern: "none" | "grid" | "dots" | "stripes" | "flowers",
  accent: string,
  opacity = 0.82,
  variant = 1
): string {
  const rough = (variant % 7) + 1;
  const seedA = 11 + variant * 3;
  const seedB = 21 + variant * 5;
  const leftInset = 12 + (variant % 6) * 2;
  const rightInset = 462 - (variant % 5) * 2;
  const topY = 14 + (variant % 4);
  const bottomY = 96 - (variant % 3);
  const topDip = 7 + (variant % 5);
  const bottomRise = 5 + (variant % 6);
  const edgeStrokeOpacity = 0.18 + (variant % 4) * 0.04;

  const tapePath = `M${leftInset},${topY}
    C${24 + rough},${topY - 8} ${43 + rough},${topY - 8} ${58 + rough},${topY - 2}
    C${82 + rough},${topY + topDip} ${116 + rough},${topY + 1} ${142 + rough},${topY - 3}
    C${176 + rough},${topY - 9} ${206 + rough},${topY + 5} ${236 + rough},${topY}
    C${271 + rough},${topY - 6} ${301 + rough},${topY - 4} ${329 + rough},${topY + 2}
    C${357 + rough},${topY + 8} ${390 + rough},${topY - 2} ${418 + rough},${topY}
    C${438 + rough},${topY + 1} ${451 + rough},${topY + 7} ${rightInset},${topY + 2}
    L${rightInset},${bottomY}
    C${451 + rough},${bottomY + 7} ${437 + rough},${bottomY + 1} ${416 + rough},${bottomY + 3}
    C${386 + rough},${bottomY + 6} ${355 + rough},${bottomY - 2} ${328 + rough},${bottomY + 1}
    C${298 + rough},${bottomY + 4} ${269 + rough},${bottomY + 10} ${236 + rough},${bottomY + 4}
    C${206 + rough},${bottomY} ${175 + rough},${bottomY + 7} ${142 + rough},${bottomY + 2}
    C${117 + rough},${bottomY - 1} ${82 + rough},${bottomY + bottomRise} ${58 + rough},${bottomY}
    C${42 + rough},${bottomY - 3} ${24 + rough},${bottomY - 1} ${leftInset},${bottomY - 6}
    Z`;

  const patternMarkup =
    pattern === "grid"
      ? `<pattern id="p" width="${20 + (variant % 5)}" height="${12 + (variant % 4)}" patternUnits="userSpaceOnUse"><path d="M0 ${(6 + variant) % 9}H26M${10 + (variant % 6)} 0V16" stroke="${accent}" stroke-width="${1 + (variant % 2) * 0.2}" opacity="0.55"/></pattern><path d="${tapePath}" fill="url(#p)"/>`
      : pattern === "dots"
        ? `<pattern id="p" width="${18 + (variant % 6)}" height="${11 + (variant % 5)}" patternUnits="userSpaceOnUse"><circle cx="${4 + (variant % 3)}" cy="4" r="1.8" fill="${accent}" opacity="0.65"/><circle cx="${14 + (variant % 4)}" cy="${7 + (variant % 3)}" r="1.5" fill="${accent}" opacity="0.48"/></pattern><path d="${tapePath}" fill="url(#p)"/>`
        : pattern === "stripes"
          ? `<pattern id="p" width="${16 + (variant % 4)}" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(${-12 + (variant % 7)})"><rect width="${8 + (variant % 3)}" height="18" fill="${accent}" opacity="0.34"/></pattern><path d="${tapePath}" fill="url(#p)"/>`
          : pattern === "flowers"
            ? `<pattern id="p" width="${30 + (variant % 8)}" height="${18 + (variant % 5)}" patternUnits="userSpaceOnUse"><circle cx="9" cy="8" r="3.1" fill="${accent}" opacity="0.7"/><circle cx="13" cy="8" r="3.1" fill="${accent}" opacity="0.7"/><circle cx="11" cy="5.2" r="3.1" fill="${accent}" opacity="0.7"/><circle cx="11" cy="10.8" r="3.1" fill="${accent}" opacity="0.7"/><circle cx="11" cy="8" r="1.5" fill="#fff" opacity="0.9"/></pattern><path d="${tapePath}" fill="url(#p)"/>`
            : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="112" viewBox="0 0 480 112">
<defs>
<filter id="texA"><feTurbulence baseFrequency="${0.75 + (variant % 4) * 0.08}" numOctaves="2" seed="${seedA}" type="fractalNoise"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.09"/></feComponentTransfer></filter>
<filter id="texB"><feTurbulence baseFrequency="${0.22 + (variant % 5) * 0.03}" numOctaves="1" seed="${seedB}" type="fractalNoise"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.06"/></feComponentTransfer></filter>
</defs>
<g>
<path d="${tapePath}" fill="${base}" fill-opacity="${opacity}"/>
${patternMarkup}
<path d="${tapePath}" fill="#fff" opacity="0.07" filter="url(#texA)"/>
<path d="${tapePath}" fill="#000" opacity="0.04" filter="url(#texB)"/>
<path d="${tapePath}" fill="none" stroke="#fff" stroke-opacity="${edgeStrokeOpacity.toFixed(2)}" stroke-width="1.8"/>
</g>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const WASHI_TAPES: WashiDef[] = [
  { id: "washi-1", src: makeWashiDataUrl("#F6D75A", "flowers", "#FFFFFF", 0.84, 1) },
  { id: "washi-2", src: makeWashiDataUrl("#F4C7D6", "dots", "#FFFFFF", 0.82, 2) },
  { id: "washi-3", src: makeWashiDataUrl("#D9E7B4", "grid", "#6B8A55", 0.8, 3) },
  { id: "washi-4", src: makeWashiDataUrl("#D6C6EF", "stripes", "#9C86CA", 0.82, 4) },
  { id: "washi-5", src: makeWashiDataUrl("#E9CFB8", "grid", "#B3977D", 0.78, 5) },
  { id: "washi-6", src: makeWashiDataUrl("#E85A5A", "flowers", "#FFE5E5", 0.84, 6) },
  { id: "washi-7", src: makeWashiDataUrl("#F0A0BC", "dots", "#FFF2F7", 0.82, 7) },
  { id: "washi-8", src: makeWashiDataUrl("#B9D9EC", "grid", "#6BA4C8", 0.8, 8) },
  { id: "washi-9", src: makeWashiDataUrl("#AFC9E6", "stripes", "#6C8FB2", 0.8, 9) },
  { id: "washi-10", src: makeWashiDataUrl("#A6D8C8", "dots", "#F2FFFB", 0.8, 10) },
  { id: "washi-11", src: makeWashiDataUrl("#CDB4DB", "flowers", "#FFF8FF", 0.84, 11) },
  { id: "washi-12", src: makeWashiDataUrl("#F5B86B", "grid", "#C7812D", 0.82, 12) },
  { id: "washi-13", src: makeWashiDataUrl("#D2A67F", "stripes", "#8F6747", 0.82, 13) },
  { id: "washi-14", src: makeWashiDataUrl("#E8A3A3", "dots", "#FFF5F5", 0.82, 14) },
  { id: "washi-15", src: makeWashiDataUrl("#F5D2A8", "none", "#FFFFFF", 0.78, 15) },
  { id: "washi-16", src: makeWashiDataUrl("#F7E8A7", "grid", "#D3B860", 0.8, 16) },
  { id: "washi-17", src: makeWashiDataUrl("#A9C08B", "stripes", "#6F8555", 0.8, 17) },
  { id: "washi-18", src: makeWashiDataUrl("#8BB5E8", "dots", "#EAF4FF", 0.78, 18) },
  { id: "washi-19", src: makeWashiDataUrl("#B58BC7", "flowers", "#F6E9FF", 0.8, 19) },
  { id: "washi-20", src: makeWashiDataUrl("#D76060", "grid", "#7B2626", 0.82, 20) },
];

export default function StickerPanel({
  isOpen,
  onClose,
  allStickers,
  currentPage,
  onStickersChange,
  libraryStickers,
  onLibraryChange,
  showWashiTab = false,
}: StickerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ProcessingStep>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"stickers" | "washi">("stickers");
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => { const t = navigator.maxTouchPoints > 0; const l = window.innerWidth > window.innerHeight; setIsMobile(t && (window.innerWidth < 768 || (window.innerWidth < 1024 && l))); };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isOpen || !showWashiTab) setActiveTab("stickers");
  }, [isOpen, showWashiTab]);

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
        const pageMaxZ = allStickers
          .filter((s) => s.pageIndex === currentPage)
          .reduce((max, s) => Math.max(max, s.zIndex ?? 0), 0);
        const newSticker: Sticker = {
          id: uuidv4(),
          pageIndex: currentPage,
          dataUrl: src,
          x: 0.35 + Math.random() * 0.3,
          y: 0.35 + Math.random() * 0.3,
          width: 96,
          height: 96,
          rotation: Math.random() * 16 - 8,
          zIndex: pageMaxZ + 1,
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
          const retryMaxZ = allStickers
            .filter((s) => s.pageIndex === currentPage)
            .reduce((max, s) => Math.max(max, s.zIndex ?? 0), 0);
          const retry: Sticker = {
            id: uuidv4(),
            pageIndex: currentPage,
            dataUrl: src,
            x: 0.4,
            y: 0.4,
            width: 96,
            height: 96,
            rotation: 0,
            zIndex: retryMaxZ + 1,
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
          {/* On mobile, wrap in rotation container matching -90° book rotation */}
          <div style={isMobile ? {
            position: "fixed",
            zIndex: 50,
            width: "100vh",
            height: "100vw",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%) rotate(-90deg)",
            pointerEvents: "none",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          } : { display: "contents" }}>
          <motion.div
            className={isMobile ? "flex flex-col rounded-2xl overflow-hidden" : "fixed z-50 flex flex-col rounded-2xl overflow-hidden"}
            style={isMobile ? {
              position: "relative",
              marginBottom: 80,
              width: 320,
              maxHeight: "70vh",
              pointerEvents: "auto",
              background: "rgba(255,255,255,0.97)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
              border: "1px solid rgba(0,0,0,0.06)",
            } : {
              bottom: 80,
              left: "50%",
              width: 320,
              maxHeight: "70vh",
              background: "rgba(255,255,255,0.97)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
            initial={isMobile ? { opacity: 0, scale: 0.95 } : { opacity: 0, y: 16, x: "-50%", scale: 0.95 }}
            animate={isMobile ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0, x: "-50%", scale: 1 }}
            exit={isMobile ? { opacity: 0, scale: 0.95 } : { opacity: 0, y: 10, x: "-50%", scale: 0.95 }}
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

              {/* ── Tabs (Moodboard only) ── */}
              {step === "idle" && showWashiTab && (
                <div
                  className="mb-3 p-1 rounded-xl grid grid-cols-2 gap-1"
                  style={{ background: "rgba(0,0,0,0.04)" }}
                >
                  <button
                    onClick={() => setActiveTab("stickers")}
                    className="py-2 rounded-lg text-xs font-sans font-medium"
                    style={{
                      background: activeTab === "stickers" ? "#292524" : "transparent",
                      color: activeTab === "stickers" ? "#fff" : "#57534E",
                    }}
                  >
                    Stickers
                  </button>
                  <button
                    onClick={() => setActiveTab("washi")}
                    className="py-2 rounded-lg text-xs font-sans font-medium"
                    style={{
                      background: activeTab === "washi" ? "#292524" : "transparent",
                      color: activeTab === "washi" ? "#fff" : "#57534E",
                    }}
                  >
                    Washi
                  </button>
                </div>
              )}

              {/* ── Upload button ── */}
              {step === "idle" && activeTab === "stickers" && (
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
              {activeTab === "stickers" && libraryStickers.length === 0 && step === "idle" ? (
                <div className="text-center py-6">
                  <div className="text-3xl mb-2">🌟</div>
                  <p className="text-xs font-sans" style={{ color: "#A8A29E" }}>
                    No stickers yet. Upload one above!
                  </p>
                </div>
              ) : activeTab === "washi" && step === "idle" ? (
                <>
                  <p className="text-xs font-sans font-medium mb-2.5" style={{ color: "#A8A29E" }}>
                    Tap to add tape
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {WASHI_TAPES.map((wt) => (
                      <motion.button
                        key={wt.id}
                        onClick={() => placeSticker(wt.src, false)}
                        className="w-full rounded-xl overflow-hidden flex items-center justify-center p-2"
                        style={{
                          background: "repeating-conic-gradient(#f0f0f0 0% 25%, white 0% 50%) 0 0 / 10px 10px",
                          border: "1px solid rgba(0,0,0,0.08)",
                          aspectRatio: "2.8 / 1",
                        }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <img
                          src={wt.src}
                          alt="washi tape"
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                          draggable={false}
                          loading="lazy"
                        />
                      </motion.button>
                    ))}
                  </div>
                </>
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
          </div>{/* end panel rotation wrapper */}

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
