import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WH Navigasyon",
  description: "Türkiye radar noktalı navigasyon uygulaması",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WH Navi",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="h-full" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="h-full overflow-hidden bg-gray-950">{children}</body>
    </html>
  );
}
