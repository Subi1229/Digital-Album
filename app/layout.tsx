import type { Metadata, Viewport } from "next";
import "./globals.css";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Digital Photo Album",
  description: "A realistic digital photo album experience",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Photo Album",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#F5F5F4",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Pacifico&family=Great+Vibes&family=Sacramento&family=Pinyon+Script&family=Satisfy&family=Caveat:wght@400;700&family=Courgette&family=Kaushan+Script&family=Lobster&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#F5F5F4" }}>
        {children}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            const isLocalhost =
              location.hostname === 'localhost' || location.hostname === '127.0.0.1';

            if (isLocalhost) {
              navigator.serviceWorker.getRegistrations().then((regs) => {
                regs.forEach((reg) => reg.unregister());
              });
              if ('caches' in window) {
                caches.keys().then((keys) => {
                  keys.forEach((k) => caches.delete(k));
                });
              }
            } else {
              navigator.serviceWorker.register('/sw.js');
            }
          }
        `}</Script>
      </body>
    </html>
  );
}
