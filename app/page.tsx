"use client";

import dynamic from "next/dynamic";
import SplashScreen from "@/components/SplashScreen";

// Dynamically import AlbumBook to avoid SSR issues with react-pageflip and IndexedDB
const AlbumBook = dynamic(() => import("@/components/AlbumBook"), {
  ssr: false,
  loading: () => <SplashScreen />,
});

export default function Home() {
  return <AlbumBook />;
}
