"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import AlbumPage, { PAGE_W, PAGE_H } from "./AlbumPage";
import { Sticker, MoodboardImage, MoodboardText } from "@/lib/types";

interface ShareModalProps {
  albumId: string;
  albumName: string;
  totalPages: number;
  images: Record<string, string>;
  stickers: Sticker[];
  moodboardImages: MoodboardImage[];
  moodboardTexts: MoodboardText[];
  drawings: Record<string, string>;
  bgImageUrl: string | null;
  getPageTemplateId: (pageIdx: number) => 1 | 2 | 3 | 4 | 5;
  getPageImages: (pageIdx: number) => Record<number, string>;
  onClose: () => void;
}

type Mode = "choose" | "pages" | "album";

export default function ShareModal({
  albumId,
  albumName,
  totalPages,
  images,
  stickers,
  moodboardImages,
  moodboardTexts,
  drawings,
  bgImageUrl,
  getPageTemplateId,
  getPageImages,
  onClose,
}: ShareModalProps) {
  const [mode, setMode] = useState<Mode>("choose");
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [mounted, setMounted] = useState(false);
  const hiddenRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const togglePage = (idx: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const selectAll = () => setSelectedPages(new Set(Array.from({ length: totalPages }, (_, i) => i)));
  const clearAll = () => setSelectedPages(new Set());

  // ── Capture a single hidden page element ──────────────────────────────────
  const capturePage = useCallback(async (pageIdx: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const container = hiddenRef.current;
      if (!container) { reject(new Error("no container")); return; }

      // Clear and render target page
      container.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.style.cssText = `width:${PAGE_W}px;height:${PAGE_H}px;position:relative;overflow:hidden;background:#ffffff;`;

      // Apply album background if set
      if (bgImageUrl) {
        wrap.style.backgroundImage = `url(${bgImageUrl})`;
        wrap.style.backgroundSize = "cover";
        wrap.style.backgroundPosition = "center";
      }

      container.appendChild(wrap);

      // We need html2canvas — dynamic import
      // @ts-ignore
      import("html2canvas").then(({ default: html2canvas }: any) => {
        requestAnimationFrame(() => {
          // @ts-ignore
          html2canvas(wrap, {
            scale: 3,
            useCORS: true,
            allowTaint: true,
            backgroundColor: bgImageUrl ? null : "#ffffff",
            width: PAGE_W,
            height: PAGE_H,
            logging: false,
          }).then((canvas: HTMLCanvasElement) => {
            resolve(canvas.toDataURL("image/png", 1.0));
          }).catch(reject);
        });
      }).catch(reject);
    });
  }, [bgImageUrl]);

  // ── Render an AlbumPage into the hidden container and capture it ──────────
  const capturePageWithReact = useCallback(async (pageIdx: number): Promise<HTMLCanvasElement> => {
    // @ts-ignore
    const { default: html2canvas }: any = await import("html2canvas");

    return new Promise((resolve, reject) => {
      const container = hiddenRef.current;
      if (!container) { reject(new Error("no container")); return; }

      // Wait for the page rendered for this pageIdx (keyed div inside hidden container)
      const el = container.querySelector(`[data-share-page="${pageIdx}"]`) as HTMLElement | null;
      if (!el) { reject(new Error(`Page ${pageIdx} not rendered`)); return; }

      html2canvas(el, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        width: PAGE_W,
        height: PAGE_H,
        logging: false,
        imageTimeout: 15000,
      }).then(resolve).catch(reject);
    });
  }, []);

  // ── Download selected pages as PNG images ─────────────────────────────────
  const handleDownloadPages = useCallback(async () => {
    if (selectedPages.size === 0) return;
    setIsExporting(true);

    // @ts-ignore
    const { default: html2canvas }: any = await import("html2canvas");
    const pages = Array.from(selectedPages).sort((a, b) => a - b);

    for (let i = 0; i < pages.length; i++) {
      const pageIdx = pages[i];
      setProgress(`Exporting page ${pageIdx + 1}… (${i + 1}/${pages.length})`);

      const el = hiddenRef.current?.querySelector(`[data-share-page="${pageIdx}"]`) as HTMLElement | null;
      if (!el) continue;

      // Brief settle time for images
      await new Promise((r) => setTimeout(r, 120));

      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: bgImageUrl ? null : "#ffffff",
        width: PAGE_W,
        height: PAGE_H,
        logging: false,
        imageTimeout: 15000,
      });

      const link = document.createElement("a");
      link.download = `${albumName}-page-${pageIdx + 1}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();

      await new Promise((r) => setTimeout(r, 200));
    }

    setIsExporting(false);
    setProgress("");
  }, [selectedPages, albumName, bgImageUrl]);

  // ── Download whole album as PDF ───────────────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    setIsExporting(true);
    setProgress("Loading libraries…");

    const [html2canvasMod, jsPDFMod]: any[] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      import("html2canvas"),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      import("jspdf"),
    ]);
    const html2canvas = html2canvasMod.default;
    const jsPDF = jsPDFMod.default;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [PAGE_W, PAGE_H],
      compress: false,
    });

    const allPages = Array.from({ length: totalPages }, (_, i) => i);

    for (let i = 0; i < allPages.length; i++) {
      const pageIdx = allPages[i];
      setProgress(`Capturing page ${pageIdx + 1} of ${totalPages}…`);

      const el = hiddenRef.current?.querySelector(`[data-share-page="${pageIdx}"]`) as HTMLElement | null;
      if (!el) continue;

      await new Promise((r) => setTimeout(r, 100));

      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: bgImageUrl ? null : "#ffffff",
        width: PAGE_W,
        height: PAGE_H,
        logging: false,
        imageTimeout: 15000,
      });

      const imgData = canvas.toDataURL("image/png", 1.0);

      if (i > 0) pdf.addPage([PAGE_W, PAGE_H], "portrait");
      pdf.addImage(imgData, "PNG", 0, 0, PAGE_W, PAGE_H, undefined, "FAST");
    }

    setProgress("Saving PDF…");
    pdf.save(`${albumName}.pdf`);
    setIsExporting(false);
    setProgress("");
  }, [albumName, totalPages, bgImageUrl]);

  // ── Hidden off-screen render container for all pages ─────────────────────
  const hiddenPages = mounted ? createPortal(
    <div
      ref={hiddenRef}
      style={{
        position: "fixed",
        top: 0,
        left: "-99999px",
        width: PAGE_W,
        pointerEvents: "none",
        zIndex: -1,
        overflow: "visible",
      }}
    >
      {Array.from({ length: totalPages }, (_, pageIdx) => (
        <div
          key={pageIdx}
          data-share-page={pageIdx}
          style={{
            width: PAGE_W,
            height: PAGE_H,
            position: "relative",
            overflow: "hidden",
            background: bgImageUrl ? `url(${bgImageUrl}) center/cover no-repeat` : "#ffffff",
            marginBottom: 4,
          }}
        >
          <AlbumPage
            albumId={albumId}
            pageIndex={pageIdx}
            isLeft={pageIdx % 2 === 0}
            images={getPageImages(pageIdx)}
            stickers={stickers}
            onSlotClick={() => {}}
            onSlotDrop={() => {}}
            onStickersChange={() => {}}
            onStickerPanelOpen={() => {}}
            pageNumber={pageIdx + 1}
            templateId={getPageTemplateId(pageIdx)}
            moodboardImages={moodboardImages}
            onMoodboardImagesChange={() => {}}
            moodboardTexts={moodboardTexts}
            onMoodboardTextsChange={() => {}}
            bgImageUrl={bgImageUrl}
            drawings={drawings}
            onDrawingSave={() => {}}
            isDrawingActive={false}
            onStartDrawing={() => {}}
            onStopDrawing={() => {}}
          />
        </div>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <>
      {hiddenPages}

      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative flex flex-col"
          style={{
            background: "#ffffff",
            borderRadius: 20,
            width: "min(92vw, 480px)",
            maxHeight: "85vh",
            overflow: "hidden",
            boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
          }}
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: "20px 20px 0", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
            <div className="flex items-center justify-between pb-4">
              <div>
                <h2 className="font-serif text-xl" style={{ color: "#1e1e1e", fontWeight: 500 }}>
                  Share Album
                </h2>
                <p className="text-xs font-sans mt-0.5" style={{ color: "#334a52" }}>
                  {albumName}
                </p>
              </div>
              <button
                onClick={onClose}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.10)", background: "rgba(240,240,240,0.80)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <line x1="1" y1="1" x2="11" y2="11" stroke="#334a52" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="11" y1="1" x2="1" y2="11" stroke="#334a52" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px 20px" }}>
            <AnimatePresence mode="wait">

              {/* ── Choose mode ── */}
              {mode === "choose" && (
                <motion.div key="choose" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col gap-3">
                  <p className="text-sm font-sans mb-1" style={{ color: "#334a52" }}>What would you like to share?</p>

                  <button
                    onClick={() => setMode("pages")}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px", borderRadius: 14, border: "1.5px solid rgba(0,0,0,0.10)", background: "rgba(224,244,255,0.35)", cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(180,235,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#003242" strokeWidth="1.8" strokeLinecap="round">
                        <rect x="3" y="3" width="8" height="10" rx="1.5" />
                        <rect x="13" y="3" width="8" height="10" rx="1.5" />
                        <rect x="3" y="15" width="8" height="6" rx="1.5" />
                        <rect x="13" y="15" width="8" height="6" rx="1.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-sans text-sm font-medium" style={{ color: "#1e1e1e" }}>Download Pages as Images</p>
                      <p className="font-sans text-xs mt-0.5" style={{ color: "#334a52" }}>Select one or more pages — each downloads as PNG</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setMode("album")}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px", borderRadius: 14, border: "1.5px solid rgba(0,0,0,0.10)", background: "rgba(151,213,156,0.15)", cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(151,213,156,0.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#003242" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="8" y1="13" x2="16" y2="13" />
                        <line x1="8" y1="17" x2="16" y2="17" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-sans text-sm font-medium" style={{ color: "#1e1e1e" }}>Download Whole Album as PDF</p>
                      <p className="font-sans text-xs mt-0.5" style={{ color: "#334a52" }}>All {totalPages} pages + background in one PDF file</p>
                    </div>
                  </button>
                </motion.div>
              )}

              {/* ── Page selection ── */}
              {mode === "pages" && (
                <motion.div key="pages" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setMode("choose")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#334a52", fontSize: 13, padding: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                      Back
                    </button>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={selectAll} style={{ fontSize: 11, color: "#003242", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>All</button>
                      <button onClick={clearAll} style={{ fontSize: 11, color: "#334a52", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Clear</button>
                    </div>
                  </div>

                  <p className="text-xs font-sans" style={{ color: "#334a52" }}>
                    Select pages to download ({selectedPages.size} selected)
                  </p>

                  {/* Page grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    {Array.from({ length: totalPages }, (_, i) => {
                      const selected = selectedPages.has(i);
                      return (
                        <button
                          key={i}
                          onClick={() => togglePage(i)}
                          style={{
                            aspectRatio: "3/4",
                            borderRadius: 8,
                            border: selected ? "2px solid #003242" : "1.5px solid rgba(0,0,0,0.12)",
                            background: selected ? "rgba(0,50,66,0.08)" : "rgba(240,240,240,0.5)",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                            position: "relative",
                          }}
                        >
                          {selected && (
                            <div style={{ position: "absolute", top: 4, right: 4, width: 14, height: 14, borderRadius: "50%", background: "#003242", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 600, color: selected ? "#003242" : "#334a52", fontFamily: "sans-serif" }}>{i + 1}</span>
                        </button>
                      );
                    })}
                  </div>

                  {isExporting && (
                    <p className="text-xs font-sans text-center" style={{ color: "#334a52" }}>{progress}</p>
                  )}

                  <button
                    onClick={handleDownloadPages}
                    disabled={selectedPages.size === 0 || isExporting}
                    style={{
                      marginTop: 4,
                      padding: "12px",
                      borderRadius: 12,
                      border: "none",
                      background: selectedPages.size === 0 || isExporting ? "rgba(30,30,30,0.3)" : "#1e1e1e",
                      color: "#ffffff",
                      fontFamily: "sans-serif",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: selectedPages.size === 0 || isExporting ? "default" : "pointer",
                    }}
                  >
                    {isExporting ? progress || "Exporting…" : `Download ${selectedPages.size > 0 ? selectedPages.size : ""} Page${selectedPages.size !== 1 ? "s" : ""} as PNG`}
                  </button>
                </motion.div>
              )}

              {/* ── Whole album ── */}
              {mode === "album" && (
                <motion.div key="album" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col gap-4">
                  <button onClick={() => setMode("choose")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#334a52", fontSize: 13, padding: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                    Back
                  </button>

                  <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(240,240,240,0.4)" }}>
                    <p className="text-sm font-sans font-medium" style={{ color: "#1e1e1e" }}>Album PDF</p>
                    <p className="text-xs font-sans mt-1" style={{ color: "#334a52" }}>
                      All {totalPages} pages will be exported at highest quality (3× resolution).
                      Album background is included. Toolbars are excluded.
                    </p>
                    {bgImageUrl && (
                      <p className="text-xs font-sans mt-1" style={{ color: "#003242" }}>✓ Background image included</p>
                    )}
                  </div>

                  {isExporting && (
                    <div className="flex flex-col items-center gap-2">
                      <div style={{ width: "100%", height: 4, borderRadius: 999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                        <motion.div style={{ height: "100%", background: "#003242", borderRadius: 999 }} animate={{ width: ["0%", "90%"] }} transition={{ duration: totalPages * 1.2, ease: "linear" }} />
                      </div>
                      <p className="text-xs font-sans" style={{ color: "#334a52" }}>{progress}</p>
                    </div>
                  )}

                  <button
                    onClick={handleDownloadPDF}
                    disabled={isExporting}
                    style={{
                      padding: "13px",
                      borderRadius: 12,
                      border: "none",
                      background: isExporting ? "rgba(30,30,30,0.3)" : "#1e1e1e",
                      color: "#ffffff",
                      fontFamily: "sans-serif",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: isExporting ? "default" : "pointer",
                    }}
                  >
                    {isExporting ? progress || "Generating PDF…" : `Download "${albumName}.pdf"`}
                  </button>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
