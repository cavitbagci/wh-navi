"use client";
import { APIProvider } from "@vis.gl/react-google-maps";
import NavigationApp from "@/components/NavigationApp";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function Home() {
  if (!API_KEY) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-gray-950 text-white gap-4 p-8 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          <path d="M12 9v4M12 17h.01" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"/>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div>
          <p className="font-semibold text-lg text-amber-400">API Anahtarı Eksik</p>
          <p className="text-slate-400 text-sm mt-1">
            <code className="bg-slate-800 px-1 rounded">.env.example</code> dosyasını{" "}
            <code className="bg-slate-800 px-1 rounded">.env.local</code> olarak kopyalayın
            ve <code className="bg-slate-800 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> değerini girin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} language="tr" region="TR">
      <NavigationApp />
    </APIProvider>
  );
}
