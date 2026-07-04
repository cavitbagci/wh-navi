"use client";
import { useEffect, useRef } from "react";
import type { RadarType } from "@/app/api/radars/route";

interface Props {
  distance: number;
  maxspeed?: number;
  type?: RadarType;
}

const TYPE_LABELS: Record<RadarType, string> = {
  speed:      "Hız Radarı",
  redlight:   "Işık İhlali Kamerası",
  mobile:     "Mobil Radar",
  corridor:   "Ortalama Hız Denetimi",
  checkpoint: "Denetim Noktası",
};

const TYPE_EMOJI: Record<RadarType, string> = {
  speed:      "📷",
  redlight:   "🚦",
  mobile:     "📡",
  corridor:   "🛣",
  checkpoint: "🚔",
};

// Beep frequency varies by urgency and type
function playBeep(distance: number, type: RadarType) {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    const freq = type === "redlight" ? 1200 : distance < 100 ? 1000 : 880;
    const duration = distance < 100 ? 0.8 : 0.5;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);

    // Double beep for very close
    if (distance < 150) {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.setValueAtTime(freq, ctx.currentTime + duration + 0.1);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime + duration + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration * 2 + 0.1);
      osc2.start(ctx.currentTime + duration + 0.1);
      osc2.stop(ctx.currentTime + duration * 2 + 0.1);
    }

    setTimeout(() => ctx.close(), 2000);
  } catch {
    // Audio unavailable — ignore
  }
}

export default function RadarAlert({ distance, maxspeed, type = "speed" }: Props) {
  const playedRef = useRef(false);

  useEffect(() => {
    if (!playedRef.current) {
      playBeep(distance, type);
      playedRef.current = true;
    }
  }, [distance, type]);

  const urgency = distance < 100 ? "red" : distance < 200 ? "orange" : "yellow";

  const colors = {
    red:    "bg-red-700 border-red-400",
    orange: "bg-orange-600 border-orange-400",
    yellow: "bg-yellow-600 border-yellow-400",
  };

  const label = TYPE_LABELS[type];
  const emoji = TYPE_EMOJI[type];

  return (
    <div
      className={`absolute top-24 left-4 right-4 z-30 max-w-md mx-auto ${colors[urgency]} border-2 rounded-2xl p-4 shadow-2xl animate-pulse`}
    >
      <div className="flex items-center gap-3">
        <div className="text-3xl">{emoji}</div>
        <div className="flex-1">
          <div className="text-white font-bold text-base">{label}!</div>
          <div className="text-white/90 text-sm">
            {Math.round(distance)} m ileride
            {maxspeed && ` · Limit: ${maxspeed} km/h`}
          </div>
        </div>
        <div className="text-white font-black text-xl">{Math.round(distance)}m</div>
      </div>
    </div>
  );
}
