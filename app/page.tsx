"use client";

import dynamic from "next/dynamic";

// Dynamically import AlbumBook to avoid SSR issues with react-pageflip and IndexedDB
const AlbumBook = dynamic(() => import("@/components/AlbumBook"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#F5EFE6",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 36,
            height: 36,
            border: "2px solid #EDE0D0",
            borderTopColor: "#8B6343",
            borderRadius: "50%",
            animation: "spin 0.9s linear infinite",
            margin: "0 auto 12px",
          }}
        />
        <p style={{ color: "#5C4A32", fontSize: 14, fontFamily: "sans-serif" }}>
          Opening album…
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  ),
});

export default function Home() {
  return <AlbumBook />;
}
