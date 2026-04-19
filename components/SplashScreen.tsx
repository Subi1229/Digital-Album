"use client";
import { motion } from "framer-motion";

const ORBIT_RADIUS = 220;
const ORBIT_DURATION = 14;

const STICKERS = [
  { src: "/assets/sticker-1.png",  size: 96 },
  { src: "/assets/sticker-2.png",  size: 88 },
  { src: "/assets/sticker-3.png",  size: 92 },
  { src: "/assets/sticker-4.png",  size: 86 },
  { src: "/assets/sticker-5.png",  size: 90 },
  { src: "/assets/sticker-6.png",  size: 84 },
  { src: "/assets/sticker-7.png",  size: 88 },
  { src: "/assets/sticker-9.png",  size: 86 },
  { src: "/assets/sticker-10.png", size: 90 },
  { src: "/assets/sticker-11.png", size: 84 },
];

function OrbitSticker({ src, size, index, total }: { src: string; size: number; index: number; total: number }) {
  const startDeg = (index / total) * 360;
  // negative delay starts the animation already mid-way at the correct position
  const delay = `-${(startDeg / 360) * ORBIT_DURATION}s`;
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: 0,
        height: 0,
        transformOrigin: "0 0",
        animation: `splashOrbit ${ORBIT_DURATION}s linear ${delay} infinite`,
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: ORBIT_RADIUS - size / 2,
          top: -size / 2,
          width: size,
          height: size,
          objectFit: "contain",
          filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.16))",
          userSelect: "none",
          pointerEvents: "none",
          animation: `splashCounterOrbit ${ORBIT_DURATION}s linear ${delay} infinite`,
        }}
      />
    </div>
  );
}

export default function SplashScreen() {

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "linear-gradient(135deg, #fce4ec 0%, #faf5ff 45%, #e3f2fd 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes splashOrbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes splashCounterOrbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        .splash-rotate {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @media (max-width: 767px) {
          .splash-rotate {
            inset: unset;
            width: 100vh;
            height: 100vw;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%) rotate(-90deg);
            overflow: hidden;
          }
        }
      `}</style>

      {/* Rotation wrapper — CSS media query mirrors the app's mobile -90deg landscape trick */}
      <div className="splash-rotate">

        {/* Large background text */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            userSelect: "none",
            gap: 0,
            lineHeight: 0.92,
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: "clamp(80px, 18vw, 200px)",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              color: "rgba(255,255,255,0.82)",
              fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif",
              textTransform: "lowercase",
            }}
          >
            nestalgic
          </span>
        </div>

        {/* Orbit container */}
        <div
          style={{
            position: "relative",
            width: ORBIT_RADIUS * 2 + 140,
            height: ORBIT_RADIUS * 2 + 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {STICKERS.map((s, i) => (
            <OrbitSticker key={i} src={s.src} size={s.size} index={i} total={STICKERS.length} />
          ))}
        </div>

        {/* Pulsing loading label */}
        <motion.p
          style={{
            position: "absolute",
            bottom: 36,
            fontSize: 12,
            letterSpacing: "0.14em",
            color: "rgba(100,80,120,0.6)",
            fontFamily: "sans-serif",
            textTransform: "uppercase",
            margin: 0,
          }}
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          opening your album…
        </motion.p>

      </div>
    </div>
  );
}
