"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue } from "framer-motion";
import { HexColorPicker } from "react-colorful";
import { MoodboardText } from "@/lib/types";

interface MoodboardTextLayerProps {
  albumId: string;
  pageIndex: number;
  texts: MoodboardText[];
  containerWidth: number;
  containerHeight: number;
  onTextsChange: (texts: MoodboardText[]) => void;
}

const FONT_OPTIONS = [
  // Cursive / script
  { label: "Dancing Script", value: "'Dancing Script', cursive" },
  { label: "Great Vibes",    value: "'Great Vibes', cursive" },
  { label: "Sacramento",     value: "'Sacramento', cursive" },
  { label: "Pinyon Script",  value: "'Pinyon Script', cursive" },
  { label: "Satisfy",        value: "'Satisfy', cursive" },
  { label: "Pacifico",       value: "'Pacifico', cursive" },
  { label: "Caveat",         value: "'Caveat', cursive" },
  { label: "Courgette",      value: "'Courgette', cursive" },
  { label: "Kaushan Script", value: "'Kaushan Script', cursive" },
  { label: "Lobster",        value: "'Lobster', cursive" },
  // Classic
  { label: "Serif",          value: "Georgia, serif" },
  { label: "Sans",           value: "Arial, sans-serif" },
  { label: "Mono",           value: "'Courier New', monospace" },
];

export default function MoodboardTextLayer({
  albumId,
  pageIndex,
  texts,
  containerWidth,
  containerHeight,
  onTextsChange,
}: MoodboardTextLayerProps) {
  const pageTexts = texts.filter((t) => t.albumId === albumId && t.pageIndex === pageIndex);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colorPickerTargetId, setColorPickerTargetId] = useState<string | null>(null);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    const scoped = texts.filter((t) => t.albumId === albumId && t.pageIndex === pageIndex);
    const target = scoped.find((t) => t.id === id);
    if (!target) return;
    const maxZ = scoped.reduce((m, t) => Math.max(m, t.zIndex ?? 1), 1);
    if ((target.zIndex ?? 1) >= maxZ) return;
    onTextsChange(texts.map((t) => (t.id === id ? { ...t, zIndex: maxZ + 1 } : t)));
  }, [albumId, onTextsChange, pageIndex, texts]);

  // Ref shared with MoodboardTextItem toolbar — set true while toolbar is pressed
  const toolbarActiveRef = useRef(false);

  useEffect(() => {
    if (!selectedId) return;
    const onDown = (e: PointerEvent) => {
      if (toolbarActiveRef.current) return;
      if ((e.target as Element).closest?.("[data-mbtext]")) return;
      setSelectedId(null);
      setColorPickerTargetId(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("touchstart", onDown as any, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("touchstart", onDown as any, true);
    };
  }, [selectedId]);

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {pageTexts.map((text) => (
        <MoodboardTextItem
          key={text.id}
          text={text}
          allTexts={texts}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          containerRef={containerRef}
          isSelected={selectedId === text.id}
          onSelect={() => handleSelect(text.id)}
          onColorClick={() => setColorPickerTargetId(text.id)}
          onTextsChange={onTextsChange}
          toolbarActiveRef={toolbarActiveRef}
        />
      ))}

      {/* Centered Color Picker Popover */}
      {colorPickerTargetId && (
        <SmoothColorPicker
          targetId={colorPickerTargetId}
          texts={texts}
          onTextsChange={onTextsChange}
          onClose={() => setColorPickerTargetId(null)}
          toolbarActiveRef={toolbarActiveRef}
        />
      )}
    </div>
  );
}

function SmoothColorPicker({
  targetId,
  texts,
  onTextsChange,
  onClose,
  toolbarActiveRef,
}: {
  targetId: string;
  texts: MoodboardText[];
  onTextsChange: (texts: MoodboardText[]) => void;
  onClose: () => void;
  toolbarActiveRef: React.MutableRefObject<boolean>;
}) {
  // Use independent local state to guarantee 0ms lag on the slider thumb, preventing vibration.
  const initialColor = texts.find((t) => t.id === targetId)?.color || "#000";
  const [localColor, setLocalColor] = useState(initialColor);

  const handleColorChange = (newColor: string) => {
    setLocalColor(newColor);
    onTextsChange(texts.map((t) => (t.id === targetId ? { ...t, color: newColor } : t)));
  };

  const openDropper = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if ("EyeDropper" in window) {
      try {
        const dropper = new (window as any).EyeDropper();
        const { sRGBHex } = await dropper.open();
        handleColorChange(sRGBHex);
      } catch (e) {
        // user canceled or unsupported
      }
    }
  };

  return (
    <div
      data-mbtext={targetId}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 12,
        padding: "16px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.98)",
        border: "1px solid rgba(0,0,0,0.10)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
        pointerEvents: "auto",
        zIndex: 999,
        width: 232,
      }}
      onPointerDown={(e) => { e.stopPropagation(); toolbarActiveRef.current = true; }}
      onPointerUp={() => { setTimeout(() => { toolbarActiveRef.current = false; }, 300); }}
      onTouchStart={(e) => { e.stopPropagation(); toolbarActiveRef.current = true; }}
      onTouchEnd={() => { setTimeout(() => { toolbarActiveRef.current = false; }, 300); }}
    >
      <HexColorPicker
        style={{ width: "100%" }}
        color={localColor}
        onChange={handleColorChange}
      />
      
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {typeof window !== "undefined" && "EyeDropper" in window && (
          <button
            type="button"
            onClick={openDropper}
            title="Pick color from image"
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.1)",
              background: "#F4F4F5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3F3F46" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22a9.97 9.97 0 0 0 7.07-2.93A10 10 0 0 0 12 2a10 10 0 0 0-7.07 17.07" />
              <path d="M12 2v20" />
              <path d="m2 12 20 0" />
            </svg>
          </button>
        )}
        <input
          type="text"
          value={localColor}
          onChange={(e) => handleColorChange(e.target.value)}
          onFocus={() => { toolbarActiveRef.current = true; }}
          onBlur={() => { setTimeout(() => { toolbarActiveRef.current = false; }, 300); }}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Hex or RGB..."
          style={{
            flexGrow: 1,
            minWidth: 0,
            height: 38,
            padding: "0 10px",
            fontSize: 13,
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 8,
            outline: "none",
            background: "#F4F4F5",
            color: "#3F3F46",
            textTransform: "uppercase",
            fontFamily: "monospace",
          }}
        />
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ width: "100%", border: "none", background: "#1e1e1e", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "10px 0", marginTop: 4 }}
      >
        Done
      </button>
    </div>
  );
}

interface ItemProps {
  text: MoodboardText;
  allTexts: MoodboardText[];
  containerWidth: number;
  containerHeight: number;
  containerRef: React.RefObject<HTMLDivElement>;
  isSelected: boolean;
  onSelect: () => void;
  onColorClick: () => void;
  onTextsChange: (texts: MoodboardText[]) => void;
  toolbarActiveRef: React.MutableRefObject<boolean>;
}

function MoodboardTextItem({
  text,
  allTexts,
  containerWidth,
  containerHeight,
  containerRef,
  isSelected,
  onSelect,
  onColorClick,
  onTextsChange,
  toolbarActiveRef,
}: ItemProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textDisplayRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(text.x);
  const y = useMotionValue(text.y);
  const rotateMV = useMotionValue(text.rotation ?? 0);
  // Tracks live width/fontSize/rotation during gesture — avoids setDraft on every move event
  const liveResizeRef = useRef({ width: text.width, fontSize: text.fontSize, rotation: text.rotation ?? 0 });
  const [draft, setDraft] = useState(text);
  const [editing, setEditing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startSize: number } | null>(null);
  const touchRef = useRef<{
    dist0: number;
    angle0: number;
    width0: number;
    size0: number;
    rot0: number;
  } | null>(null);

  useEffect(() => {
    x.set(text.x);
    y.set(text.y);
    rotateMV.set(text.rotation ?? 0);
    liveResizeRef.current = { width: text.width, fontSize: text.fontSize, rotation: text.rotation ?? 0 };
    setDraft(text);
  }, [text, x, y]); // eslint-disable-line

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = useCallback((next: MoodboardText) => {
    onTextsChange(allTexts.map((t) => (t.id === next.id ? next : t)));
  }, [allTexts, onTextsChange]);

  // Convert screen coordinates to page-local coordinates, accounting for
  // the book's scale and optional -90° mobile rotation.
  const screenToPage = useCallback((sx: number, sy: number): { x: number; y: number } => {
    const el = containerRef.current;
    if (!el) return { x: sx, y: sy };
    const rect = el.getBoundingClientRect();
    const scaleFlat = rect.width  / containerWidth;
    const scaleRot  = rect.width  / containerHeight;
    const isRotated =
      Math.abs(rect.height - containerWidth  * scaleRot ) <
      Math.abs(rect.height - containerHeight * scaleFlat);
    if (!isRotated) {
      const scale = rect.width / containerWidth;
      return { x: (sx - rect.left) / scale, y: (sy - rect.top) / scale };
    }
    const scale  = rect.width / containerHeight;
    const rectCx = rect.left + rect.width  / 2;
    const rectCy = rect.top  + rect.height / 2;
    return {
      x: containerWidth  / 2 - (sy - rectCy) / scale,
      y: containerHeight / 2 + (sx - rectCx) / scale,
    };
  }, [containerRef, containerWidth, containerHeight]);

  const onDragEnd = useCallback(() => {
    const maxX = Math.max(0, containerWidth - draft.width - 8);
    const maxY = Math.max(0, containerHeight - 30);
    const nx = Math.max(0, Math.min(maxX, x.get()));
    const ny = Math.max(0, Math.min(maxY, y.get()));
    x.set(nx);
    y.set(ny);
    const next = { ...draft, x: nx, y: ny };
    setDraft(next);
    commit(next);
  }, [commit, containerHeight, containerWidth, draft, x, y]);

  const updateDraft = useCallback((patch: Partial<MoodboardText>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    commit(next);
  }, [commit, draft]);

  const beginResize = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.nativeEvent as Event).stopImmediatePropagation();
    e.preventDefault();
    setResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: draft.width,
      startSize: draft.fontSize,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [draft.fontSize, draft.width]);

  const moveResize = useCallback((e: React.PointerEvent) => {
    const rs = resizeRef.current;
    if (!rs) return;
    const dx = e.clientX - rs.startX;
    const dy = e.clientY - rs.startY;
    const dist = Math.hypot(dx, dy) * (dx + dy >= 0 ? 1 : -1);
    const nextWidth = Math.max(90, Math.min(420, rs.startWidth + dist));
    const nextSize = Math.max(10, Math.min(120, rs.startSize + dist / 12));
    // Update DOM directly — bypass React re-render for smooth mobile performance
    liveResizeRef.current = { ...liveResizeRef.current, width: nextWidth, fontSize: nextSize };
    if (textDisplayRef.current) {
      textDisplayRef.current.style.width = nextWidth + "px";
      textDisplayRef.current.style.fontSize = nextSize + "px";
    }
  }, []);

  const endResize = useCallback(() => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    setResizing(false);
    const live = liveResizeRef.current;
    const next = { ...draft, width: live.width, fontSize: live.fontSize };
    setDraft(next);
    commit(next);
  }, [commit, draft]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      e.stopImmediatePropagation();
      if (e.touches.length !== 2) {
        touchRef.current = null;
        return;
      }
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current = {
        dist0: Math.hypot(dx, dy),
        angle0: Math.atan2(dy, dx),
        width0: draft.width,
        size0: draft.fontSize,
        rot0: draft.rotation ?? 0,
      };
      setResizing(true);
      setRotating(true);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchRef.current || e.touches.length !== 2) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const ts = touchRef.current;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const ratio = Math.max(0.35, Math.min(3.2, Math.hypot(dx, dy) / ts.dist0));
      const dAngle = (Math.atan2(dy, dx) - ts.angle0) * (180 / Math.PI);
      const newWidth = Math.max(90, Math.min(420, ts.width0 * ratio));
      const newSize = Math.max(10, Math.min(120, ts.size0 * ratio));
      const newRot = ts.rot0 + dAngle;
      // Update DOM directly — bypass React re-render for smooth mobile performance
      liveResizeRef.current = { width: newWidth, fontSize: newSize, rotation: newRot };
      if (textDisplayRef.current) {
        textDisplayRef.current.style.width = newWidth + "px";
        textDisplayRef.current.style.fontSize = newSize + "px";
      }
      rotateMV.set(newRot);
    };

    const onTouchEnd = () => {
      if (!touchRef.current) return;
      touchRef.current = null;
      setResizing(false);
      setRotating(false);
      const live = liveResizeRef.current;
      const next = { ...draft, width: live.width, fontSize: live.fontSize, rotation: live.rotation };
      setDraft(next);
      commit(next);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [commit, draft]);

  return (
    <motion.div
      ref={rootRef}
      data-mbtext={text.id}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        x,
        y,
        rotate: rotateMV,
        transformOrigin: "center center",
        zIndex: isSelected ? (text.zIndex + 100) : text.zIndex,
        pointerEvents: "auto",
        touchAction: "none",
        userSelect: "none",
        willChange: "transform",
      }}
      drag={!editing && !rotating && !resizing}
      dragMomentum={false}
      dragElastic={0}
      transformPagePoint={(p) => screenToPage(p.x, p.y)}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.nativeEvent as Event).stopImmediatePropagation();
        onSelect();
      }}
      onDoubleClick={() => setEditing(true)}
      onDragEnd={onDragEnd}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
    >
      {isSelected && (
        <div
          data-mbtext={text.id}
          style={{
            position: "absolute",
            top: -42,
            left: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 15,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid rgba(0,0,0,0.10)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            pointerEvents: "auto",
            whiteSpace: "nowrap",
          }}
          onPointerDown={(e) => { e.stopPropagation(); toolbarActiveRef.current = true; }}
          onPointerUp={() => { setTimeout(() => { toolbarActiveRef.current = false; }, 300); }}
          onPointerCancel={() => { toolbarActiveRef.current = false; }}
          onTouchStart={(e) => { e.stopPropagation(); toolbarActiveRef.current = true; }}
          onTouchEnd={() => { setTimeout(() => { toolbarActiveRef.current = false; }, 300); }}
        >
          <select
            value={draft.fontFamily}
            onChange={(e) => updateDraft({ fontFamily: e.target.value })}
            style={{ fontSize: 11, border: "none", background: "transparent", outline: "none", maxWidth: 110 }}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <div style={{ width: 1, height: 14, background: "rgba(0,0,0,0.12)" }} />
          <button type="button" onClick={() => updateDraft({ fontWeight: draft.fontWeight === "bold" ? "normal" : "bold" })}
            style={{ border: "none", background: draft.fontWeight === "bold" ? "rgba(0,0,0,0.08)" : "transparent", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: "bold", padding: "1px 5px", lineHeight: 1 }}>B</button>
          <button type="button" onClick={() => updateDraft({ fontStyle: draft.fontStyle === "italic" ? "normal" : "italic" })}
            style={{ border: "none", background: draft.fontStyle === "italic" ? "rgba(0,0,0,0.08)" : "transparent", borderRadius: 4, cursor: "pointer", fontSize: 12, fontStyle: "italic", padding: "1px 5px", lineHeight: 1 }}>I</button>
          <div style={{ width: 1, height: 14, background: "rgba(0,0,0,0.12)" }} />
          <button type="button" onClick={() => updateDraft({ fontSize: Math.max(10, draft.fontSize - 2) })}
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12 }}>A-</button>
          <button type="button" onClick={() => updateDraft({ fontSize: Math.min(96, draft.fontSize + 2) })}
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12 }}>A+</button>
          <div style={{ width: 1, height: 14, background: "rgba(0,0,0,0.12)" }} />
          {/* Color swatch — opens custom popover */}
          <div
            title="Text color"
            style={{ width: 18, height: 18, borderRadius: "50%", cursor: "pointer", border: "1.5px solid rgba(0,0,0,0.15)", background: draft.color, flexShrink: 0 }}
            onPointerDown={(e) => { e.stopPropagation(); (e.nativeEvent as Event).stopImmediatePropagation(); }}
            onClick={(e) => { e.stopPropagation(); onColorClick(); }}
          />
        </div>
      )}

      {editing ? (
        <textarea
          ref={inputRef}
          value={draft.text}
          onChange={(e) => setDraft((prev) => ({ ...prev, text: e.target.value }))}
          onBlur={() => {
            setEditing(false);
            updateDraft({ text: (draft.text || "").trim() || "Text" });
          }}
          style={{
            width: draft.width,
            minWidth: 90,
            minHeight: 28,
            resize: "none",
            border: "1px dashed rgba(99,102,241,0.75)",
            borderRadius: 4,
            padding: "2px 4px",
            fontSize: draft.fontSize,
            fontFamily: draft.fontFamily,
            fontWeight: draft.fontWeight ?? "normal",
            fontStyle: draft.fontStyle ?? "normal",
            color: draft.color,
            lineHeight: 1.2,
            outline: "none",
            background: "rgba(255,255,255,0.9)",
          }}
        />
      ) : (
        <div
          ref={textDisplayRef}
          style={{
            width: draft.width,
            minWidth: 90,
            minHeight: 24,
            padding: "2px 4px",
            fontSize: draft.fontSize,
            fontFamily: draft.fontFamily,
            fontWeight: draft.fontWeight ?? "normal",
            fontStyle: draft.fontStyle ?? "normal",
            color: draft.color,
            lineHeight: 1.2,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            outline: isSelected ? "1px dashed rgba(99,102,241,0.75)" : "none",
            borderRadius: 4,
            cursor: "move",
          }}
        >
          {draft.text || "Text"}
        </div>
      )}

      {isSelected && (
        <div
          style={{
            position: "absolute",
            top: -11,
            right: -11,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#fff",
            border: "1.5px solid rgba(0,0,0,0.13)",
            boxShadow: "0 1px 5px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 30,
            pointerEvents: "auto",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.nativeEvent as Event).stopImmediatePropagation();
            onTextsChange(allTexts.filter((t) => t.id !== text.id));
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="#444" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="#444" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {isSelected && !editing && hovered && (
        <>
          {[
            { key: "nw", top: -10, left: -10, cursor: "nwse-resize" },
            { key: "ne", top: -10, right: -10, cursor: "nesw-resize" },
            { key: "se", bottom: -10, right: -10, cursor: "nwse-resize" },
            { key: "sw", bottom: -10, left: -10, cursor: "nesw-resize" },
          ].map((h) => (
            <div
              key={h.key}
              style={{
                position: "absolute",
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "transparent",
                pointerEvents: "auto",
                ...h,
              }}
              onPointerDown={beginResize}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
          ))}
        </>
      )}
    </motion.div>
  );
}
