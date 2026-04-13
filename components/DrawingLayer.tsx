"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface DrawingLayerProps {
  width: number;
  height: number;
  initialDataUrl?: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

type Tool = "pencil" | "pen" | "brush" | "eraser" | "marker";

export default function DrawingLayer({
  width,
  height,
  initialDataUrl,
  onSave,
  onClose,
}: DrawingLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<{x: number, y: number}[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#1E1E1E");
  const [size, setSize] = useState(4);

  // History for Undo/Redo (atomic state to prevent sync issues)
  const [history, setHistory] = useState<{ stack: string[]; step: number }>({
    stack: [],
    step: -1,
  });

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and set initial state
    ctx.clearRect(0, 0, width, height);

    if (initialDataUrl) {
      const img = new Image();
      img.src = initialDataUrl;
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        const data = canvas.toDataURL();
        setHistory({ stack: [data], step: 0 });
      };
    } else {
      const data = canvas.toDataURL();
      setHistory({ stack: [data], step: 0 });
    }
  }, [width, height]); // Removed initialDataUrl from deps to prevent re-init loops

  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();

    setHistory((prev) => {
      // If nothing has changed, don't add to stack
      if (prev.stack[prev.step] === dataUrl) return prev;

      const newStack = prev.stack.slice(0, prev.step + 1);
      newStack.push(dataUrl);
      
      // Limit history to 30 steps
      const finalStack = newStack.slice(-30);
      return {
        stack: finalStack,
        step: finalStack.length - 1,
      };
    });
    onSave(dataUrl);
  }, [onSave]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.step <= 0) return prev;
      const nextStep = prev.step - 1;
      const dataUrl = prev.stack[nextStep];
      
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && dataUrl) {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0);
          onSave(dataUrl);
        };
      }
      return { ...prev, step: nextStep };
    });
  }, [width, height, onSave]);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.step >= prev.stack.length - 1) return prev;
      const nextStep = prev.step + 1;
      const dataUrl = prev.stack[nextStep];

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && dataUrl) {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0);
          onSave(dataUrl);
        };
      }
      return { ...prev, step: nextStep };
    });
  }, [width, height, onSave]);

  // Map screen pointer coordinates to canvas pixel coordinates, accounting
  // for the book's scale and optional -90° mobile rotation.
  const getCanvasPoint = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleFlat = rect.width  / canvas.width;
    const scaleRot  = rect.width  / canvas.height;
    const isRotated =
      Math.abs(rect.height - canvas.width  * scaleRot ) <
      Math.abs(rect.height - canvas.height * scaleFlat);
    if (!isRotated) {
      return {
        x: (clientX - rect.left) * (canvas.width  / rect.width),
        y: (clientY - rect.top)  * (canvas.height / rect.height),
      };
    }
    const scale  = rect.width / canvas.height;
    const rectCx = rect.left + rect.width  / 2;
    const rectCy = rect.top  + rect.height / 2;
    return {
      x: canvas.width  / 2 - (clientY - rectCy) / scale,
      y: canvas.height / 2 + (clientX - rectCx) / scale,
    };
  };

  const startDrawing = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x, y } = getCanvasPoint(e.clientX, e.clientY, canvas);
    currentPointsRef.current = [{ x, y }];
    isDrawingRef.current = true;
  };

  const draw = (e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const tempCtx = tempCanvas?.getContext("2d");
    if (!canvas || !tempCanvas || !tempCtx) return;

    const { x, y } = getCanvasPoint(e.clientX, e.clientY, canvas);

    const newPoints = [...currentPointsRef.current, { x, y }];
    currentPointsRef.current = newPoints;

    // Redraw the entire current stroke on the temp canvas
    tempCtx.clearRect(0, 0, width, height);
    if (newPoints.length < 2) return;

    tempCtx.beginPath();
    tempCtx.lineCap = "round";
    tempCtx.lineJoin = "round";
    
    // Tool config
    tempCtx.globalAlpha = 1;
    tempCtx.globalCompositeOperation = "source-over";
    tempCtx.shadowBlur = 0;

    if (activeTool === "pencil") {
      tempCtx.globalAlpha = 0.5;
      tempCtx.lineWidth = Math.max(1, size / 2);
      tempCtx.strokeStyle = color;
    } else if (activeTool === "brush") {
      tempCtx.shadowBlur = size / 2;
      tempCtx.shadowColor = color;
      tempCtx.lineWidth = size * 2;
      tempCtx.strokeStyle = color;
    } else if (activeTool === "marker") {
      tempCtx.globalAlpha = 0.2;
      tempCtx.lineWidth = size * 6;
      tempCtx.strokeStyle = color;
    } else if (activeTool === "eraser") {
      // Eraser is handled on the main canvas for immediate feedback
      const mainCtx = canvas.getContext("2d");
      if (mainCtx) {
        mainCtx.globalCompositeOperation = "destination-out";
        mainCtx.lineWidth = size * 4;
        mainCtx.lineCap = "round";
        mainCtx.beginPath();
        const last = currentPointsRef.current[currentPointsRef.current.length - 1];
        if (last) {
          mainCtx.moveTo(last.x, last.y);
          mainCtx.lineTo(x, y);
          mainCtx.stroke();
        }
      }
      return; 
    } else {
      tempCtx.lineWidth = size;
      tempCtx.strokeStyle = color;
    }

    // Draw the stroke using the collected points
    tempCtx.moveTo(newPoints[0].x, newPoints[0].y);
    for (let i = 1; i < newPoints.length - 1; i++) {
      const midPoint = {
        x: (newPoints[i].x + newPoints[i + 1].x) / 2,
        y: (newPoints[i].y + newPoints[i + 1].y) / 2
      };
      tempCtx.quadraticCurveTo(newPoints[i].x, newPoints[i].y, midPoint.x, midPoint.y);
    }
    tempCtx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    const tempCanvas = tempCanvasRef.current;
    const mainCtx = canvas?.getContext("2d");
    
    if (canvas && tempCanvas && mainCtx && activeTool !== "eraser") {
      // Commit the temp canvas to the main canvas
      mainCtx.globalCompositeOperation = "source-over";
      mainCtx.globalAlpha = 1;
      mainCtx.drawImage(tempCanvas, 0, 0);
      
      // Clear temp canvas
      const tempCtx = tempCanvas.getContext("2d");
      tempCtx?.clearRect(0, 0, width, height);
    }

    currentPointsRef.current = [];
    saveToHistory();
  };

  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkSize = () => setIsSmallScreen(window.innerWidth < 640);
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => {
      setMounted(false);
      window.removeEventListener("resize", checkSize);
    };
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, width, height);
    saveToHistory();
  };

  const toolbar = (
    <AnimatePresence>
      {isSmallScreen ? (
        /* ── Mobile / tablet: horizontal bottom bar ── */
        <motion.div
          key="mobile-toolbar"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          className="fixed pointer-events-auto"
          style={{
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(252, 252, 212, 1)",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.18)",
            borderTop: "2px solid #1E1E1E",
            zIndex: 9999,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Row 1: tools + actions + done */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px 4px" }}>
            <ToolButton active={activeTool === "pencil"} onClick={() => setActiveTool("pencil")} title="Pencil" small>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l5 5"/></svg>
            </ToolButton>
            <ToolButton active={activeTool === "pen"} onClick={() => setActiveTool("pen")} title="Pen" small>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </ToolButton>
            <ToolButton active={activeTool === "brush"} onClick={() => setActiveTool("brush")} title="Brush" small>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5"/><path d="M21 10c0 .3-.1.6-.3.8L12 19l-8.7-8.2c-.2-.2-.3-.5-.3-.8V10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </ToolButton>
            <ToolButton active={activeTool === "eraser"} onClick={() => setActiveTool("eraser")} title="Eraser" small>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
            </ToolButton>
            <ToolButton active={activeTool === "marker"} onClick={() => setActiveTool("marker")} title="Marker" small>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M7 14V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v10"/><path d="M11 2v4"/><path d="M15 2v4"/></svg>
            </ToolButton>
            <div style={{ width: 1, height: 20, background: "rgba(0,0,0,0.12)", margin: "0 4px", flexShrink: 0 }} />
            <ActionButton onClick={undo} disabled={history.step <= 0} title="Undo" small>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
            </ActionButton>
            <ActionButton onClick={redo} disabled={history.step >= history.stack.length - 1} title="Redo" small>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 14 5-5-5-5"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
            </ActionButton>
            <ActionButton onClick={clearCanvas} title="Clear" small>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </ActionButton>
            <div style={{ flex: 1 }} />
            <button
              onClick={onClose}
              style={{ background: "#1E1E1E", color: "#fff", border: "none", borderRadius: 20, padding: "6px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
            >
              DONE
            </button>
          </div>

          {/* Row 2: colors + size slider */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px 8px" }}>
            {["#1E1E1E", "#45AEFF", "#FF5F5F", "#FFD700", "#4CAF50", "#9C27B0"].map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 22, height: 22, borderRadius: "50%", border: color === c ? "2.5px solid #fff" : "2px solid transparent",
                  background: c, cursor: "pointer", flexShrink: 0,
                  boxShadow: color === c ? "0 0 0 1.5px #1E1E1E" : "none",
                  transform: color === c ? "scale(1.15)" : "scale(1)",
                }}
              />
            ))}
            <div style={{ width: 1, height: 20, background: "rgba(0,0,0,0.12)", margin: "0 4px", flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>Size</span>
            <input
              type="range"
              min="1"
              max="40"
              value={size}
              onChange={(e) => setSize(parseInt(e.target.value))}
              style={{ flex: 1, accentColor: "#1E1E1E", height: 4, cursor: "pointer" }}
            />
          </div>
        </motion.div>
      ) : (
        /* ── Desktop: floating bottom-center bar ── */
        <motion.div
          key="desktop-toolbar"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          className="fixed flex flex-col items-center gap-4 p-3 rounded-[2rem] pointer-events-auto bottom-6 left-1/2 -translate-x-1/2"
          style={{
            background: "rgba(252, 252, 212, 1)",
            boxShadow: "0 12px 60px rgba(0,0,0,0.3)",
            border: "2px solid #1E1E1E",
            zIndex: 9999,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Tools Group */}
          <div className="flex items-center gap-2 px-1">
            <div className="flex items-center gap-1.5">
              <ToolButton active={activeTool === "pencil"} onClick={() => setActiveTool("pencil")} title="Pencil">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l5 5"/></svg>
              </ToolButton>
              <ToolButton active={activeTool === "pen"} onClick={() => setActiveTool("pen")} title="Pen">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              </ToolButton>
              <ToolButton active={activeTool === "brush"} onClick={() => setActiveTool("brush")} title="Brush">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5"/><path d="M21 10c0 .3-.1.6-.3.8L12 19l-8.7-8.2c-.2-.2-.3-.5-.3-.8V10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </ToolButton>
              <ToolButton active={activeTool === "eraser"} onClick={() => setActiveTool("eraser")} title="Eraser">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
              </ToolButton>
              <ToolButton active={activeTool === "marker"} onClick={() => setActiveTool("marker")} title="Marker">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M7 14V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v10"/><path d="M11 2v4"/><path d="M15 2v4"/></svg>
              </ToolButton>
            </div>
            <div className="w-px h-6 bg-black/10" />
            <div className="flex items-center gap-1">
              <ActionButton onClick={undo} disabled={history.step <= 0} title="Undo">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
              </ActionButton>
              <ActionButton onClick={redo} disabled={history.step >= history.stack.length - 1} title="Redo">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 14 5-5-5-5"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
              </ActionButton>
              <ActionButton onClick={clearCanvas} title="Clear Page">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </ActionButton>
            </div>
          </div>

          {/* Colors Group */}
          <div className="flex items-center gap-2 px-2 py-0.5">
            {["#1E1E1E", "#45AEFF", "#FF5F5F", "#FFD700", "#4CAF50", "#9C27B0"].map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`rounded-full border-2 transition-transform ${color === c ? 'scale-110 border-white shadow-md' : 'border-transparent'}`}
                style={{ background: c, width: 24, height: 24 }}
              />
            ))}
          </div>

          {/* Size Slider */}
          <div className="flex items-center gap-4 w-full px-2">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[9px] font-bold text-black/40 uppercase tracking-widest">Size</span>
              <input
                type="range"
                min="1"
                max="40"
                value={size}
                onChange={(e) => setSize(parseInt(e.target.value))}
                className="appearance-none bg-black/10 rounded-full cursor-pointer"
                style={{ accentColor: "#1E1E1E", width: "100%", height: 4 }}
              />
            </div>
            <button
              onClick={onClose}
              className="bg-black text-white font-bold rounded-full hover:bg-black/80 transition-colors text-[11px] px-6 py-2.5"
            >
              DONE
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );


  return (
    <div className="absolute inset-0 z-[58] pointer-events-none overflow-hidden">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 z-0"
      />
      <canvas
        ref={tempCanvasRef}
        width={width}
        height={height}
        className="absolute inset-0 z-10 pointer-events-auto cursor-crosshair"
        style={{ touchAction: "none" }}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={stopDrawing}
      />

      {mounted && createPortal(toolbar, document.body)}
    </div>
  );
}



function ToolButton({ children, active, onClick, title, small }: { 
  children: React.ReactNode; 
  active: boolean; 
  onClick: () => void;
  title: string;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-xl flex items-center justify-center transition-all ${
        small ? "w-8 h-8" : "w-10 h-10"
      } ${
        active 
          ? "bg-black text-[#FFF8E7] shadow-lg scale-105" 
          : "text-black/60 hover:bg-black/5 hover:text-black"
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({ children, onClick, disabled, title, small }: { 
  children: React.ReactNode; 
  onClick: () => void;
  disabled?: boolean;
  title: string;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-xl flex items-center justify-center transition-all ${
        small ? "w-8 h-8" : "w-10 h-10"
      } ${
        disabled 
          ? "text-black/20 cursor-not-allowed" 
          : "text-black/60 hover:bg-black/5 hover:text-black"
      }`}
    >
      {children}
    </button>
  );
}
