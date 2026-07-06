import type { NextConfig } from "next";

if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
  console.warn(
    "\n⚠  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY tanımlı değil.\n" +
    "   .env.example dosyasını .env.local olarak kopyalayın ve doldurun.\n"
  );
}

const nextConfig: NextConfig = {};

export default nextConfig;

