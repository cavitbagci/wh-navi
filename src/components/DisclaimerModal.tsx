"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "wh-navi-disclaimer-seen";

export default function DisclaimerModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore (private browsing etc.)
    }
  };

  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="max-w-sm w-full bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6">
        <div className="text-3xl mb-2">⚠️</div>
        <h2 className="text-white font-bold text-lg mb-2">Bilgilendirme</h2>
        <p className="text-gray-300 text-sm leading-relaxed mb-6">
          Radar konumları ve hız bilgileri güncel olmayabilir veya hatalı gösterilebilir.
          Lütfen trafik kurallarına ve yol üzerindeki tabelalara her zaman uyun.
        </p>
        <button
          onClick={dismiss}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg transition-colors"
        >
          Anladım
        </button>
      </div>
    </div>
  );
}
