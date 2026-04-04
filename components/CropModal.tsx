"use client";

import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { motion, AnimatePresence } from "framer-motion";
import { CropArea, PendingCrop } from "@/lib/types";
import getCroppedImg from "@/lib/cropImage";

interface CropModalProps {
  pending: PendingCrop | null;
  onDone: (dataUrl: string, pageIndex: number, slotIndex: number) => void;
  onCancel: () => void;
}

export default function CropModal({ pending, onDone, onCancel }: CropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback(
    (_: CropArea, croppedPixels: CropArea) => {
      setCroppedAreaPixels(croppedPixels);
    },
    []
  );

  const handleConfirm = async () => {
    if (!pending || !croppedAreaPixels) return;
    setProcessing(true);
    try {
      // Output at 3Ã— for retina quality
      const outW = Math.round(121 * 3);
      const outH = Math.round(158 * 3);
      const dataUrl = await getCroppedImg(
        pending.objectUrl,
        croppedAreaPixels,
        outW,
        outH
      );
      onDone(dataUrl, pending.pageIndex, pending.slotIndex);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />

          {/* Modal */}
          <motion.div
            className="relative z-10 flex flex-col rounded-3xl overflow-hidden shadow-2xl"
            style={{
              width: 320,
              background: "rgba(15,15,15,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-white font-semibold text-base tracking-tight">
                  Crop Photo
                </h2>
                <p className="text-white/40 text-xs mt-0.5">
                  Drag & zoom to frame your shot
                </p>
              </div>
              <button
                onClick={onCancel}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Crop Area */}
            <div
              className="relative mx-5 rounded-2xl overflow-hidden"
              style={{
                height: 310,
                background: "#111",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {pending && (
                <Cropper
                  image={pending.objectUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={pending.aspectRatio}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  cropShape="rect"
                  showGrid
                  style={{
                    containerStyle: { borderRadius: 16, overflow: "hidden" },
                    cropAreaStyle: {
                      border: "2px solid rgba(255,255,255,0.8)",
                      borderRadius: 12,
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                    },
                  }}
                />
              )}
            </div>

            {/* Zoom Slider */}
            <div className="px-6 pt-4 pb-2">
              <div className="flex items-center gap-3">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-white/30 shrink-0">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, rgba(255,255,255,0.7) ${((zoom - 1) / 2) * 100}%, rgba(255,255,255,0.15) ${((zoom - 1) / 2) * 100}%)`,
                  }}
                />
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-white/50 shrink-0">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 pt-3 flex gap-2.5">
              <button
                onClick={onCancel}
                className="flex-1 h-10 rounded-xl text-white/60 text-sm font-medium transition-all hover:bg-white/8 hover:text-white/80"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={processing}
                className="flex-1 h-10 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{
                  background: processing
                    ? "rgba(255,255,255,0.2)"
                    : "rgba(255,255,255,0.92)",
                  color: "#111",
                }}
              >
                {processing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Savingâ€¦
                  </span>
                ) : (
                  "Place Photo"
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
