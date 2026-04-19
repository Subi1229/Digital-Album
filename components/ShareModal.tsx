"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import AlbumPage, { PAGE_W, PAGE_H, GRID_X, GRID_Y, INNER_PAD_X, INNER_PAD_Y, getSlotDefs } from "./AlbumPage";
import MoodboardImageLayer from "./MoodboardImageLayer";
import MoodboardTextLayer from "./MoodboardTextLayer";
import StickerLayer from "./StickerLayer";
import { Sticker, MoodboardImage, MoodboardText } from "@/lib/types";

interface ShareModalProps {
  albumId: string;
  albumName: string;
  totalPages: number;
  images: Record<string, string>;
  stickers: Sticker[];
  moodboardImages: MoodboardImage[];
  moodboardTexts: MoodboardText[];
  drawings: Record<number, string>;
  bgImageUrl: string | null;
  getPageTemplateId: (pageIdx: number) => 1 | 2 | 3 | 4 | 5 | 6;
  getPageImages: (pageIdx: number) => Record<number, string>;
  onClose: () => void;
}

type Mode = "choose" | "pages" | "album";

// Module-level cache persists across modal open/close cycles
const thumbCache: Record<string, string> = {};

// Draws a src image onto ctx with objectFit:cover semantics at (dx,dy,dw,dh)
function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  src: string,
  dx: number, dy: number, dw: number, dh: number,
  radius: number
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Prevent canvas tainting for external URLs
    img.onload = () => {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) { resolve(); return; }
      const scale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
      const sw = dw / scale;
      const sh = dh / scale;
      const sx = (img.naturalWidth - sw) / 2;
      const sy = (img.naturalHeight - sh) / 2;
      ctx.save();
      roundedRectPath(ctx, dx, dy, dw, dh, radius);
      ctx.clip();
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.restore();
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}

// Crop src to slot aspect ratio at its native resolution → JPEG 1.0, no upscaling
function cropToSlotAspect(src: string, slotW: number, slotH: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const targetAspect = slotW / slotH;
      const imgAspect = img.naturalWidth / img.naturalHeight;
      let sx: number, sy: number, sw: number, sh: number;
      if (imgAspect > targetAspect) {
        sh = img.naturalHeight; sw = sh * targetAspect;
        sx = (img.naturalWidth - sw) / 2; sy = 0;
      } else {
        sw = img.naturalWidth; sh = sw / targetAspect;
        sx = 0; sy = (img.naturalHeight - sh) / 2;
      }
      const c = document.createElement("canvas");
      c.width = Math.round(sw); c.height = Math.round(sh);
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 1.0));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

// Draw a rounded rect path (manual — avoids ctx.roundRect browser compat issues)
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const cr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + cr, y);
  ctx.lineTo(x + w - cr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + cr);
  ctx.lineTo(x + w, y + h - cr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
  ctx.lineTo(x + cr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - cr);
  ctx.lineTo(x, y + cr);
  ctx.quadraticCurveTo(x, y, x + cr, y);
  ctx.closePath();
}

// Overdraw moodboard (template 5) images directly at full native quality with rotation
async function overdrawMoodboardImages(
  canvas: HTMLCanvasElement,
  moodboardImages: import("@/lib/types").MoodboardImage[],
  albumId: string,
  pageIndex: number,
  scale: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pageImgs = moodboardImages
    .filter((m) => m.albumId === albumId && (typeof m.pageIndex !== "number" || m.pageIndex === pageIndex))
    .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const m of pageImgs) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth === 0 || img.naturalHeight === 0) { resolve(); return; }
        const cx = (m.x + m.width / 2) * scale;
        const cy = (m.y + m.height / 2) * scale;
        const dw = m.width * scale;
        const dh = m.height * scale;
        const rad = (m.rotation * Math.PI) / 180;
        // Cover-crop: sample from source so destination is fully filled
        const srcScale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
        const sw = dw / srcScale;
        const sh = dh / srcScale;
        const sx = (img.naturalWidth - sw) / 2;
        const sy = (img.naturalHeight - sh) / 2;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset any lingering html2canvas transform
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.translate(cx, cy);
        ctx.rotate(rad);
        roundedRectPath(ctx, -dw / 2, -dh / 2, dw, dh, 15 * scale);
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        resolve();
      };
      img.onerror = () => resolve();
      img.src = m.src;
    });
  }
}

// Draw stickers directly on canvas at full quality — on top of everything, correct z-order
async function overdrawStickers(
  canvas: HTMLCanvasElement,
  stickers: import("@/lib/types").Sticker[],
  pageIndex: number,
  scale: number,
  containerW: number = PAGE_W
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pageStickers = stickers
    .filter((s) => s.pageIndex === pageIndex)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (const s of pageStickers) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth === 0 || img.naturalHeight === 0) { resolve(); return; }
        
        const sScale = s.scale ?? 1;
        const stickerW = s.width * sScale;
        const stickerH = s.height * sScale;

        // Proportional scaling (contain): fit the image inside the container without stretching
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const containerAspect = s.width / s.height;

        let drawW, drawH;
        if (imgAspect > containerAspect) {
          // Image is wider than container aspect — fix width, scale height
          drawW = stickerW;
          drawH = stickerW / imgAspect;
        } else {
          // Image is taller than container aspect — fix height, scale width
          drawH = stickerH;
          drawW = stickerH * imgAspect;
        }

        // Center of the sticker in page coords
        const cx = (s.x * containerW + s.width / 2) * scale;
        const cy = (s.y * PAGE_H + s.height / 2) * scale;
        const dw = drawW * scale;
        const dh = drawH * scale;
        const rad = (s.rotation * Math.PI) / 180;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset any lingering html2canvas transform
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.translate(cx, cy);
        ctx.rotate(rad);
        // Draw centered at the pivot point
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        resolve();
      };
      img.onerror = () => resolve();
      img.src = s.dataUrl;
    });
  }
}

// Template 5 full-page export: correct z-order + high-quality images
// Pipeline: white base → moodboard images (high-q) → stickers (high-q) → transparent DOM overlay (texts + drawings only)
async function exportTemplate6Spread(
  el: HTMLElement,
  html2canvasFn: (el: HTMLElement, opts: object) => Promise<HTMLCanvasElement>,
  moodboardImages: import("@/lib/types").MoodboardImage[],
  stickers: import("@/lib/types").Sticker[],
  albumId: string,
  pageIndex: number,
  scale: number
): Promise<HTMLCanvasElement> {
  const W = Math.round(PAGE_W * 2 * scale);
  const H = Math.round(PAGE_H * scale);

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = W;
  finalCanvas.height = H;
  const finalCtx = finalCanvas.getContext("2d")!;
  finalCtx.fillStyle = "#ffffff";
  finalCtx.fillRect(0, 0, W, H);

  await overdrawMoodboardImages(finalCanvas, moodboardImages, albumId, pageIndex, scale);
  await overdrawStickers(finalCanvas, stickers, pageIndex, scale, PAGE_W * 2);

  const stickerDivs = Array.from(el.querySelectorAll("[data-sticker]")) as HTMLElement[];
  const mbDivs = Array.from(el.querySelectorAll("[data-mbimage]")) as HTMLElement[];
  const savedElBg = el.style.background;
  const savedStickerVis = stickerDivs.map((d) => d.style.visibility);
  const savedMbVis = mbDivs.map((d) => d.style.visibility);
  el.style.background = "transparent";
  stickerDivs.forEach((d) => { d.style.visibility = "hidden"; });
  mbDivs.forEach((d) => { d.style.visibility = "hidden"; });

  let overlayCanvas: HTMLCanvasElement | null = null;
  try {
    overlayCanvas = await html2canvasFn(el, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      imageTimeout: 20000,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });
  } finally {
    el.style.background = savedElBg;
    stickerDivs.forEach((d, i) => { d.style.visibility = savedStickerVis[i]; });
    mbDivs.forEach((d, i) => { d.style.visibility = savedMbVis[i]; });
  }

  if (overlayCanvas) finalCtx.drawImage(overlayCanvas, 0, 0);
  return finalCanvas;
}

async function exportTemplate5Page(
  el: HTMLElement,
  html2canvasFn: (el: HTMLElement, opts: object) => Promise<HTMLCanvasElement>,
  moodboardImages: import("@/lib/types").MoodboardImage[],
  stickers: import("@/lib/types").Sticker[],
  albumId: string,
  pageIndex: number,
  scale: number
): Promise<HTMLCanvasElement> {
  const W = Math.round(PAGE_W * scale);
  const H = Math.round(PAGE_H * scale);

  // 1. White canvas — AlbumPage template 5 always has white background
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = W;
  finalCanvas.height = H;
  const finalCtx = finalCanvas.getContext("2d")!;
  finalCtx.fillStyle = "#ffffff";
  finalCtx.fillRect(0, 0, W, H);

  // 2. Moodboard images at full native quality (sorted by zIndex)
  await overdrawMoodboardImages(finalCanvas, moodboardImages, albumId, pageIndex, scale);

  // 3. Stickers above images (high quality)
  await overdrawStickers(finalCanvas, stickers, pageIndex, scale);

  // 4. Transparent DOM overlay — ONLY texts + drawings (hide images, stickers, bg)
  const albumPageEl = el.querySelector(".album-page") as HTMLElement | null;
  const bgImgEl = el.querySelector('img[alt=""]') as HTMLElement | null;
  const mbDivs = Array.from(el.querySelectorAll("[data-mbimage]")) as HTMLElement[];
  const stickerDivs = Array.from(el.querySelectorAll("[data-sticker]")) as HTMLElement[];

  const savedElBg = el.style.background;
  const savedAlbumBg = albumPageEl ? albumPageEl.style.background : "";
  const savedBgVis = bgImgEl ? bgImgEl.style.visibility : "";
  const savedMbVis = mbDivs.map((d) => d.style.visibility);
  const savedStickerVis = stickerDivs.map((d) => d.style.visibility);

  el.style.background = "transparent";
  if (albumPageEl) albumPageEl.style.background = "transparent";
  if (bgImgEl) bgImgEl.style.visibility = "hidden";
  mbDivs.forEach((d) => { d.style.visibility = "hidden"; });
  stickerDivs.forEach((d) => { d.style.visibility = "hidden"; });

  let overlayCanvas: HTMLCanvasElement | null = null;
  try {
    overlayCanvas = await html2canvasFn(el, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      imageTimeout: 20000,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });
  } finally {
    el.style.background = savedElBg;
    if (albumPageEl) albumPageEl.style.background = savedAlbumBg;
    if (bgImgEl) bgImgEl.style.visibility = savedBgVis;
    mbDivs.forEach((d, i) => { d.style.visibility = savedMbVis[i]; });
    stickerDivs.forEach((d, i) => { d.style.visibility = savedStickerVis[i]; });
  }

  // 5. Composite overlay (texts + drawings) on top of images and stickers
  if (overlayCanvas) finalCtx.drawImage(overlayCanvas, 0, 0);

  return finalCanvas;
}

// After html2canvas captures the page, overdraw image slots directly at full quality
async function overdrawSlotImages(
  canvas: HTMLCanvasElement,
  pageImages: Record<number, string>,
  templateId: 1 | 2 | 3 | 4 | 5 | 6,
  isLeft: boolean,
  scale: number
) {
  if (templateId === 5) return; // moodboard — images are free-positioned, html2canvas handles them
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const slots = getSlotDefs(templateId, isLeft);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset any lingering html2canvas transform
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
    const src = pageImages[slotIdx];
    if (!src) continue;
    const slot = slots[slotIdx];
    const dx = (GRID_X + slot.x + INNER_PAD_X) * scale;
    const dy = (GRID_Y + slot.y + INNER_PAD_Y) * scale;
    const dw = (slot.w - INNER_PAD_X * 2) * scale;
    const dh = (slot.h - INNER_PAD_Y * 2) * scale;
    // Apply 6px base border-radius scaled up
    await drawCoverImage(ctx, src, dx, dy, dw, dh, 6 * scale);
  }
  ctx.restore();
}

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
  // For template 6: export only even page indices (each = one full spread)
  const exportPageIndices = Array.from({ length: totalPages }, (_, i) => i)
    .filter(i => !(getPageTemplateId(i) === 6 && i % 2 === 1));

  const [mode, setMode] = useState<Mode>("choose");
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportTransitionDuration, setExportTransitionDuration] = useState(200);
  const [exportTransitionEase, setExportTransitionEase] = useState("ease-out");
  const [progress, setProgress] = useState("");
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>(() => {
    // Initialise from cache so previous thumbnails show instantly
    const cached: Record<number, string> = {};
    for (const key of Object.keys(thumbCache)) {
      const [aid, pidx] = key.split(":");
      if (aid === albumId) cached[Number(pidx)] = thumbCache[key];
    }
    return cached;
  });
  const [thumbsGenerating, setThumbsGenerating] = useState(false);
  const hiddenRef = useRef<HTMLDivElement>(null);
  const thumbCancelRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    const check = () => { const t = navigator.maxTouchPoints > 0; const l = window.innerWidth > window.innerHeight; setIsMobile(t && (window.innerWidth < 768 || (window.innerWidth < 1024 && l))); };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Returns true if a page has any user-added content worth previewing
  const pageHasContent = useCallback((pageIdx: number): boolean => {
    const pageImgs = getPageImages(pageIdx);
    if (Object.values(pageImgs).some(Boolean)) return true;
    if (stickers.some((s) => s.pageIndex === pageIdx)) return true;
    if (moodboardImages.some((m) => m.pageIndex === pageIdx)) return true;
    if (moodboardTexts.some((t) => t.pageIndex === pageIdx)) return true;
    if (drawings[pageIdx]) return true;
    return false;
  }, [getPageImages, stickers, moodboardImages, moodboardTexts, drawings]);

  // Generate thumbnails only for pages with content, skip already-cached ones
  const generateThumbnails = useCallback(async () => {
    if (thumbsGenerating) return;
    const container = hiddenRef.current;
    if (!container) return;
    setThumbsGenerating(true);
    thumbCancelRef.current = false;
    // @ts-ignore
    const { default: html2canvas }: any = await import("html2canvas");
    for (const i of exportPageIndices) {
      if (thumbCancelRef.current) break;
      if (!pageHasContent(i)) continue;           // skip empty pages
      const cacheKey = `${albumId}:${i}`;
      if (thumbCache[cacheKey]) {
        // Already cached — show immediately, skip re-capture
        setThumbnails((prev) => prev[i] ? prev : { ...prev, [i]: thumbCache[cacheKey] });
        continue;
      }
      const el = container.querySelector(`[data-share-page="${i}"]`) as HTMLElement | null;
      if (!el) continue;
      try {
        const canvas = await html2canvas(el, {
          scale: 0.12,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
          imageTimeout: 4000,
        });
        const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
        thumbCache[cacheKey] = dataUrl;
        setThumbnails((prev) => ({ ...prev, [i]: dataUrl }));
      } catch { /* skip */ }
      await new Promise((r) => setTimeout(r, 0)); // yield to browser
    }
    setThumbsGenerating(false);
  }, [totalPages, thumbsGenerating, pageHasContent, albumId]);

  const togglePage = (idx: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const selectAll = () => setSelectedPages(new Set(exportPageIndices));
  const clearAll = () => setSelectedPages(new Set());

  const goToPages = () => {
    setMode("pages");
    // generate thumbnails after hidden pages have had a tick to settle
    setTimeout(() => generateThumbnails(), 100);
  };

  // ── Download selected pages as PNG ────────────────────────────────────────
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
      await new Promise((r) => setTimeout(r, 80));
      const tpl = getPageTemplateId(pageIdx);
      const isT5 = tpl === 5;
      const isT6 = tpl === 6;
      const PNG_SCALE = (isT5 || isT6) ? Math.max(6, Math.round(window.devicePixelRatio * 2)) : 6;
      let canvas: HTMLCanvasElement;
      if (isT5) {
        canvas = await exportTemplate5Page(el, html2canvas, moodboardImages, stickers, albumId, pageIdx, PNG_SCALE);
      } else if (isT6) {
        canvas = await exportTemplate6Spread(el, html2canvas, moodboardImages, stickers, albumId, pageIdx, PNG_SCALE);
      } else {
        const stickerDivs = Array.from(el.querySelectorAll("[data-sticker]")) as HTMLElement[];
        const slotImages = Array.from(el.querySelectorAll('[data-slot="true"] img')) as HTMLElement[];
        const exportHideDivs = Array.from(el.querySelectorAll('[data-export-hide="true"]')) as HTMLElement[];
        
        const savedStickerVis = stickerDivs.map((d) => d.style.visibility);
        const savedSlotVis = slotImages.map((d) => d.style.visibility);
        const savedHideVis = exportHideDivs.map((d) => d.style.visibility);

        stickerDivs.forEach((d) => { d.style.visibility = "hidden"; });
        slotImages.forEach((d) => { d.style.visibility = "hidden"; });
        exportHideDivs.forEach((d) => { d.style.visibility = "hidden"; });

        try {
          canvas = await html2canvas(el, {
            scale: PNG_SCALE,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#ffffff",
            logging: false,
            imageTimeout: 20000,
            windowWidth: el.scrollWidth,
            windowHeight: el.scrollHeight,
          });
        } finally {
          stickerDivs.forEach((d, idx) => { d.style.visibility = savedStickerVis[idx]; });
          slotImages.forEach((d, idx) => { d.style.visibility = savedSlotVis[idx]; });
          exportHideDivs.forEach((d, idx) => { d.style.visibility = savedHideVis[idx]; });
        }
        await overdrawSlotImages(canvas, getPageImages(pageIdx), getPageTemplateId(pageIdx), pageIdx % 2 === 0, PNG_SCALE);
        await overdrawStickers(canvas, stickers, pageIdx, PNG_SCALE);
      }
      const link = document.createElement("a");
      link.download = `${albumName}-page-${pageIdx + 1}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();
      await new Promise((r) => setTimeout(r, 150));
    }
    setIsExporting(false);
    setProgress("");
    onClose();
  }, [selectedPages, albumName, onClose, stickers, moodboardImages, albumId, getPageImages, getPageTemplateId]);

  // ── Download whole album as PDF ───────────────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(0); // Explicitly start from the left end
    setProgress("Loading libraries…");
    const [html2canvasMod, jsPDFMod]: any[] = await Promise.all([
      // @ts-ignore
      import("html2canvas"),
      // @ts-ignore
      import("jspdf"),
    ]);
    const html2canvas = html2canvasMod.default;
    const jsPDF = jsPDFMod.default;

    const firstPageIsT6 = exportPageIndices.length > 0 && getPageTemplateId(exportPageIndices[0]) === 6;
    const pdf = new jsPDF({ orientation: firstPageIsT6 ? "landscape" : "portrait", unit: "px", format: firstPageIsT6 ? [PAGE_W * 2, PAGE_H] : [PAGE_W, PAGE_H] });

    // Wait for 2 animation frames — guarantees DOM paint before we read/write progress
    const waitForPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    // Snap to 0 instantly
    setExportTransitionDuration(0);
    setExportTransitionEase("linear");
    setExportProgress(0);
    await waitForPaint();

    for (let loopIdx = 0; loopIdx < exportPageIndices.length; loopIdx++) {
      const i = exportPageIndices[loopIdx];
      // Update status and snap bar to exact page-start % before async work
      setProgress(`Capturing page ${loopIdx + 1} of ${exportPageIndices.length}…`);
      setExportTransitionDuration(0);
      setExportProgress((loopIdx / exportPageIndices.length) * 100);
      // Micro-delay: lets React flush state and browser repaint before blocking
      await new Promise((r) => setTimeout(r, 0));

      const el = hiddenRef.current?.querySelector(`[data-share-page="${i}"]`) as HTMLElement | null;
      if (!el) continue;

      // Single-canvas pipeline — correct z-order: background → photos → stickers (always on top)
      // Templates 1-4: scale 3 (old 363px images map ~1:1 to 369px slot — no upscale blur)
      // Template 5: devicePixelRatio*2 (min 4) — moodboard needs highest quality
      const templateId = getPageTemplateId(i);
      const isT6pdf = templateId === 6;
      const PDF_SCALE = (templateId === 5 || isT6pdf)
        ? Math.max(6, Math.round(window.devicePixelRatio * 2))
        : 3;
      let pageCanvas: HTMLCanvasElement;
      if (templateId === 5) {
        // Template 5: proper z-order pipeline (images → overlay → stickers)
        pageCanvas = await exportTemplate5Page(el, html2canvas, moodboardImages, stickers, albumId, i, PDF_SCALE);
      } else if (isT6pdf) {
        pageCanvas = await exportTemplate6Spread(el, html2canvas, moodboardImages, stickers, albumId, i, PDF_SCALE);
      } else {
        const stickerDivs = Array.from(el.querySelectorAll("[data-sticker]")) as HTMLElement[];
        const slotImages = Array.from(el.querySelectorAll('[data-slot="true"] img')) as HTMLElement[];
        const exportHideDivs = Array.from(el.querySelectorAll('[data-export-hide="true"]')) as HTMLElement[];

        const savedStickerVis = stickerDivs.map((d) => d.style.visibility);
        const savedSlotVis = slotImages.map((d) => d.style.visibility);
        const savedHideVis = exportHideDivs.map((d) => d.style.visibility);

        stickerDivs.forEach((d) => { d.style.visibility = "hidden"; });
        slotImages.forEach((d) => { d.style.visibility = "hidden"; });
        exportHideDivs.forEach((d) => { d.style.visibility = "hidden"; });

        try {
          pageCanvas = await html2canvas(el, {
            scale: PDF_SCALE,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#ffffff",
            logging: false,
            imageTimeout: 20000,
            windowWidth: el.scrollWidth,
            windowHeight: el.scrollHeight,
          });
        } finally {
          stickerDivs.forEach((d, idx) => { d.style.visibility = savedStickerVis[idx]; });
          slotImages.forEach((d, idx) => { d.style.visibility = savedSlotVis[idx]; });
          exportHideDivs.forEach((d, idx) => { d.style.visibility = savedHideVis[idx]; });
        }
        await overdrawSlotImages(pageCanvas, getPageImages(i), templateId, i % 2 === 0, PDF_SCALE);
        await overdrawStickers(pageCanvas, stickers, i, PDF_SCALE);
      }
      if (loopIdx > 0) pdf.addPage(isT6pdf ? [PAGE_W * 2, PAGE_H] : [PAGE_W, PAGE_H], isT6pdf ? "landscape" : "portrait");
      else if (isT6pdf) { /* first page — reinit pdf with correct size */ }
      const pdfImgData = (templateId === 5 || isT6pdf)
        ? pageCanvas.toDataURL("image/png", 1.0)
        : pageCanvas.toDataURL("image/jpeg", 0.95);
      const pdfImgFmt = (templateId === 5 || isT6pdf) ? "PNG" : "JPEG";
      const pdfW = isT6pdf ? PAGE_W * 2 : PAGE_W;
      pdf.addImage(pdfImgData, pdfImgFmt, 0, 0, pdfW, PAGE_H, `pg-${i}`, "FAST");

      // Page done — snap bar to exact completion %
      setExportTransitionDuration(200);
      setExportTransitionEase("ease-out");
      setExportProgress(((loopIdx + 1) / exportPageIndices.length) * 100);
      await waitForPaint();
    }

    setProgress("Saving PDF…");
    setExportTransitionDuration(500);
    setExportTransitionEase("ease-out");
    setExportProgress(100);
    await new Promise((r) => setTimeout(r, 550));
    pdf.save(`${albumName}.pdf`);
    setIsExporting(false);
    setProgress("");
    onClose();
  }, [albumName, totalPages, onClose, getPageImages, getPageTemplateId, moodboardImages, albumId, stickers]);

  // ── Hidden off-screen pages (for export capture) ──────────────────────────
  const hiddenPages = mounted ? createPortal(
    <div
      ref={hiddenRef}
      style={{ position: "fixed", top: 0, left: "-99999px", width: PAGE_W, pointerEvents: "none", zIndex: 9999, overflow: "visible" }}
    >
      {exportPageIndices.map((pageIdx) => {
        const isT6spread = getPageTemplateId(pageIdx) === 6;
        const spreadW = isT6spread ? PAGE_W * 2 : PAGE_W;
        return (
        <div
          key={pageIdx}
          data-share-page={pageIdx}
          style={{ width: spreadW, height: PAGE_H, position: "relative", overflow: "hidden", background: "#ffffff", marginBottom: 4 }}
        >
          {bgImageUrl && (
            <img src={bgImageUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} crossOrigin="anonymous" />
          )}
          {isT6spread ? (
            <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
              <div style={{ position: "absolute", inset: 0, zIndex: 45, pointerEvents: "none" }}>
                <MoodboardImageLayer albumId={albumId} images={moodboardImages} pageIndex={pageIdx}
                  containerWidth={PAGE_W * 2} containerHeight={PAGE_H} onImagesChange={() => {}} forExport={true} />
              </div>
              <div style={{ position: "absolute", inset: 0, zIndex: 55, pointerEvents: "none" }}>
                <MoodboardTextLayer albumId={albumId} pageIndex={pageIdx} texts={moodboardTexts}
                  containerWidth={PAGE_W * 2} containerHeight={PAGE_H} onTextsChange={() => {}} />
              </div>
              {drawings[pageIdx] && (
                <div style={{ position: "absolute", inset: 0, zIndex: 58, pointerEvents: "none" }}>
                  <img src={drawings[pageIdx]} alt="drawing" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
              )}
              <div style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none" }}>
                <StickerLayer stickers={stickers} pageIndex={pageIdx}
                  containerWidth={PAGE_W * 2} containerHeight={PAGE_H} onStickersChange={() => {}} forExport={true} />
              </div>
            </div>
          ) : (
          <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
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
              hideUI={true}
              forExport={true}
            />
          </div>
          )}
        </div>
        );
      })}
    </div>,
    document.body
  ) : null;


  // ── Modal card ────────────────────────────────────────────────────────────
  const modalCard = (
    <motion.div
      className="relative flex flex-col"
      style={{
        background: "#ffffff",
        borderRadius: 20,
        width: isMobile ? "min(92vh, 480px)" : "min(92vw, 480px)",
        maxHeight: isMobile ? "86vw" : "85vh",
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
        display: "flex",
        flexDirection: "column",
      }}
      initial={{ opacity: 0, scale: 0.95, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 16 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ padding: "20px 20px 0", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
        <div className="flex items-center justify-between pb-4">
          <div>
            <h2 className="font-serif text-xl" style={{ color: "#1e1e1e", fontWeight: 500 }}>Share Album</h2>
            <p className="text-xs font-sans mt-0.5" style={{ color: "#334a52" }}>{albumName}</p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.10)", background: "rgba(240,240,240,0.80)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line x1="1" y1="1" x2="11" y2="11" stroke="#334a52" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="11" y1="1" x2="1" y2="11" stroke="#334a52" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px 8px" }}>
        <AnimatePresence mode="wait">

          {/* ── Choose ── */}
          {mode === "choose" && (
            <motion.div key="choose" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col gap-3">
              <p className="text-sm font-sans mb-1" style={{ color: "#334a52" }}>What would you like to share?</p>
              <button onClick={goToPages} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px", borderRadius: 14, border: "1.5px solid rgba(0,0,0,0.10)", background: "rgba(224,244,255,0.35)", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(180,235,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#003242" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="3" y="3" width="8" height="10" rx="1.5" /><rect x="13" y="3" width="8" height="10" rx="1.5" />
                    <rect x="3" y="15" width="8" height="6" rx="1.5" /><rect x="13" y="15" width="8" height="6" rx="1.5" />
                  </svg>
                </div>
                <div>
                  <p className="font-sans text-sm font-medium" style={{ color: "#1e1e1e" }}>Download Pages as Images</p>
                  <p className="font-sans text-xs mt-0.5" style={{ color: "#334a52" }}>Select one or more pages — each downloads as PNG</p>
                </div>
              </button>
              <button onClick={() => setMode("album")} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px", borderRadius: 14, border: "1.5px solid rgba(0,0,0,0.10)", background: "rgba(151,213,156,0.15)", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(151,213,156,0.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#003242" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
                  </svg>
                </div>
                <div>
                  <p className="font-sans text-sm font-medium" style={{ color: "#1e1e1e" }}>Download Whole Album as PDF</p>
                  <p className="font-sans text-xs mt-0.5" style={{ color: "#334a52" }}>All {totalPages} pages + background in one PDF file</p>
                </div>
              </button>
            </motion.div>
          )}

          {/* ── Pages ── */}
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
              <p className="text-xs font-sans" style={{ color: "#334a52" }}>Select pages to download ({selectedPages.size} selected)</p>
              <div style={{ display: "grid", gridTemplateColumns: exportPageIndices.some(i => getPageTemplateId(i) === 6) ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 8 }}>
                {exportPageIndices.map((i) => {
                  const selected = selectedPages.has(i);
                  const isSpread = getPageTemplateId(i) === 6;
                  return (
                    <button
                      key={i}
                      onClick={() => togglePage(i)}
                      style={{
                        width: "100%",
                        aspectRatio: isSpread ? `${PAGE_W * 2}/${PAGE_H}` : `${PAGE_W}/${PAGE_H}`,
                        borderRadius: 8,
                        border: selected ? "2.5px solid #003242" : "1.5px solid rgba(0,0,0,0.12)",
                        padding: 0,
                        overflow: "hidden",
                        position: "relative",
                        cursor: "pointer",
                        background: "#f5f5f5",
                      }}
                    >
                      {thumbnails[i] ? (
                        <img src={thumbnails[i]} alt={`Page ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#96afb9", fontFamily: "sans-serif" }}>{i + 1}</span>
                        </div>
                      )}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.38)", padding: "2px 0", textAlign: "center" }}>
                        <span style={{ fontSize: 9, color: "#fff", fontFamily: "sans-serif" }}>{i + 1}</span>
                      </div>
                      {selected && (
                        <div style={{ position: "absolute", top: 4, right: 4, width: 16, height: 16, borderRadius: "50%", background: "#003242", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {isExporting && <p className="text-xs font-sans text-center" style={{ color: "#334a52" }}>{progress}</p>}
            </motion.div>
          )}

          {/* ── Album PDF ── */}
          {mode === "album" && (
            <motion.div key="album" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col gap-4">
              <button onClick={() => setMode("choose")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#334a52", fontSize: 13, padding: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                Back
              </button>
              <div style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(240,240,240,0.4)" }}>
                <p className="text-sm font-sans font-medium" style={{ color: "#1e1e1e" }}>Album PDF</p>
                <p className="text-xs font-sans mt-1" style={{ color: "#334a52" }}>
                  All {totalPages} pages exported at high quality. Toolbars excluded.
                </p>
                {bgImageUrl && <p className="text-xs font-sans mt-1" style={{ color: "#003242" }}>✓ Background image included</p>}
              </div>
              {isExporting && (
                <div className="flex flex-col items-center gap-2">
                  <div style={{ width: "100%", height: 4, borderRadius: 999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        background: "#003242",
                        borderRadius: 999,
                        transformOrigin: "left center",
                        transform: `scaleX(${exportProgress / 100})`,
                        transition: `transform ${exportTransitionDuration}ms ${exportTransitionEase}`,
                        willChange: "transform",
                      }}
                    />
                  </div>
                  <p className="text-xs font-sans" style={{ color: "#334a52" }}>{progress}</p>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Fixed CTA footer ── */}
      {mode === "pages" && (
        <div style={{ padding: "12px 20px 16px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0, background: "#ffffff" }}>
          <button
            onClick={handleDownloadPages}
            disabled={selectedPages.size === 0 || isExporting}
            style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: selectedPages.size === 0 || isExporting ? "rgba(30,30,30,0.3)" : "#1e1e1e", color: "#ffffff", fontFamily: "sans-serif", fontSize: 14, fontWeight: 600, cursor: selectedPages.size === 0 || isExporting ? "default" : "pointer" }}
          >
            {isExporting ? progress || "Exporting…" : `Download ${selectedPages.size > 0 ? selectedPages.size : ""} Page${selectedPages.size !== 1 ? "s" : ""} as PNG`}
          </button>
        </div>
      )}
      {mode === "album" && (
        <div style={{ padding: "12px 20px 16px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0, background: "#ffffff" }}>
          <button
            onClick={handleDownloadPDF}
            disabled={isExporting}
            style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: isExporting ? "rgba(30,30,30,0.3)" : "#1e1e1e", color: "#ffffff", fontFamily: "sans-serif", fontSize: 14, fontWeight: 600, cursor: isExporting ? "default" : "pointer" }}
          >
            {isExporting ? progress || "Generating PDF…" : `Download "${albumName}.pdf"`}
          </button>
        </div>
      )}
    </motion.div>
  );

  return (
    <>
      {hiddenPages}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div style={isMobile ? {
          position: "absolute",
          width: "100vh", height: "100vw",
          left: "50%", top: "50%",
          transform: "translate(-50%, -50%) rotate(-90deg)",
          display: "flex", alignItems: "center", justifyContent: "center",
        } : {
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "100%", height: "100%",
        }}>
          {modalCard}
        </div>
      </motion.div>
    </>
  );
}
