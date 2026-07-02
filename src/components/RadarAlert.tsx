"use client";
import { useEffect, useRef } from "react";

interface Props {
  distance: number;
  maxspeed?: number;
}

export default function RadarAlert({ distance, maxspeed }: Props) {
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Tarayıcı ses API'si ile bip sesi çal
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioRef.current = ctx;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {
      // Ses çalınamadıysa sessizce devam et
    }

    return () => {
      audioRef.current?.close();
    };
  }, []);

  const urgency = distance < 100 ? "red" : distance < 200 ? "orange" : "yellow";

  const colors = {
    red: "bg-red-600 border-red-400",
    orange: "bg-orange-600 border-orange-400",
    yellow: "bg-yellow-600 border-yellow-400",
  };

  return (
    <div
      className={`absolute top-24 left-4 right-4 z-30 max-w-md mx-auto ${colors[urgency]} border-2 rounded-2xl p-4 shadow-2xl animate-pulse`}
    >
      <div className="flex items-center gap-3">
        <div className="text-3xl">📷</div>
        <div className="flex-1">
          <div className="text-white font-bold text-base">Radar Uyarısı!</div>
          <div className="text-white/90 text-sm">
            {Math.round(distance)} metre ileride radar
            {maxspeed && ` · Hız limiti: ${maxspeed} km/h`}
          </div>
        </div>
        <div className="text-white font-black text-xl">{Math.round(distance)}m</div>
      </div>
    </div>
  );
}
