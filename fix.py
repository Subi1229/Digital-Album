import re

frame_helpers = """
// ── Frame helpers ──────────────────────────────────────────────────────────────
function getImageInset(frame?: FrameType): React.CSSProperties {
  switch (frame) {
    case "stamp":
      return { top: "11%", right: "11%", bottom: "11%", left: "11%" };
    case "wide-polaroid":
    case "vertical-polaroid":
    case "clip-polaroid":
      return { top: "4%", right: "4%", bottom: "22%", left: "4%" };
    default:
      return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

function StampFrame({ color }: { color: string }) {
  const uid = useId();
  const maskId = `stamp-${uid}`;
  const r = 3;
  const step = 7.2;
  const ix = 11, iy = 11, iw = 78, ih = 78;

  const perfs: { cx: number; cy: number }[] = [];
  for (let x = ix; x <= ix + iw + 1; x += step) {
    perfs.push({ cx: x, cy: 0 });
    perfs.push({ cx: x, cy: 100 });
  }
  for (let y = iy; y <= iy + ih + 1; y += step) {
    perfs.push({ cx: 0, cy: y });
    perfs.push({ cx: 100, cy: y });
  }

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 3 }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="white" />
          <rect x={ix} y={iy} width={iw} height={ih} fill="black" />
          {perfs.map((p, i) => <circle key={i} cx={p.cx} cy={p.cy} r={r} fill="black" />)}
        </mask>
      </defs>
      <rect width="100" height="100" fill={color} mask={`url(#${maskId})`} />
    </svg>
  );
}

function PolaroidFrame({ color, text, isWide }: { color: string; text?: string; isWide: boolean }) {
  const uid = useId();
  const maskId = `polaroid-${uid}`;
  const textColor = color === "#1a1a1a" ? "#eee" : "#555";
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 3 }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="white" />
          <rect x="4" y="4" width="92" height="74" rx="1" fill="black" />
        </mask>
      </defs>
      <rect width="100" height="100" fill={color} mask={`url(#${maskId})`} />
      <rect x="0" y="78" width="100" height="22" fill={color} />
      {text && (
        <text
          x="50" y="91"
          textAnchor="middle"
          fontSize={isWide ? "7" : "8"}
          fontFamily="'Dancing Script', cursive"
          fill={textColor}
        >{text}</text>
      )}
    </svg>
  );
}

function VerticalPolaroidFrame({ color, emoji }: { color: string; emoji?: string }) {
  const uid = useId();
  const maskId = `vpolaroid-${uid}`;
  return (
    <>
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 3 }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <mask id={maskId}>
            <rect width="100" height="100" fill="white" />
            <rect x="4" y="4" width="92" height="74" rx="1" fill="black" />
          </mask>
        </defs>
        <rect width="100" height="100" fill={color} mask={`url(#${maskId})`} />
        <rect x="0" y="78" width="100" height="22" fill={color} />
      </svg>
      {emoji && (
        <div style={{
          position: "absolute", bottom: "3%", left: "8%",
          width: "18%", height: "16%",
          pointerEvents: "none", zIndex: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: "130%", lineHeight: 1 }}>{emoji}</span>
        </div>
      )}
    </>
  );
}

function ClipPolaroidFrame({ color }: { color: string }) {
  return (
    <>
      <VerticalPolaroidFrame color={color} />
      <img
        src="/assets/clip.png"
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: "48%",
          transform: "translate(-50%, -70%)",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 5,
        }}
      />
    </>
  );
}
"""

frame_render = """
      {/* ── Frame background (polaroid only — stamp handled by StampFrame) */}
      {(image.frame === "wide-polaroid" || image.frame === "vertical-polaroid" || image.frame === "clip-polaroid") && (
        <div style={{
          position: "absolute", inset: 0,
          background: image.frameColor || "#ffffff",
          borderRadius: 6,
          pointerEvents: "none",
        }} />
      )}

      {/* ── Photo ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          ...(image.frame && image.frame !== "none"
            ? getImageInset(image.frame)
            : { inset: 0 }),
          backgroundImage: `url(${image.src})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          borderRadius: image.frame && image.frame !== "none" ? 2 : RADIUS,
          pointerEvents: "none",
        }}
      />

      {/* ── Frame overlay ─────────────────────────────────────────────────── */}
      {image.frame === "stamp" && (
        <StampFrame color={image.frameColor || "#ffffff"} />
      )}
      {image.frame === "wide-polaroid" && (
        <PolaroidFrame color={image.frameColor || "#ffffff"} text={image.frameText} isWide={true} />
      )}
      {image.frame === "vertical-polaroid" && (
        <VerticalPolaroidFrame color={image.frameColor || "#ffffff"} emoji={image.frameEmoji} />
      )}
      {image.frame === "clip-polaroid" && (
        <ClipPolaroidFrame color={image.frameColor || "#ffffff"} />
      )}
"""

with open('components/MoodboardImageLayer.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update imports
text = text.replace('import { MoodboardImage } from "@/lib/types";', 'import { MoodboardImage, FrameType } from "@/lib/types";')
text = text.replace('import { useId,', 'import {')
text = text.replace('import React, {', 'import React, {\n  useId,')

# 2. Insert frame_helpers
if '// ── Frame helpers' not in text:
    text = text.replace('// ── Constants', frame_helpers + '\n// ── Constants')

# 3. Replace the photo rendering
start = text.find('{/* ── Photo')
end = text.find('{/* ── Selection border')

if start != -1 and end != -1:
    text = text[:start] + frame_render + '\n      ' + text[end:]

with open('components/MoodboardImageLayer.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Restored and updated MoodboardImageLayer.tsx')
