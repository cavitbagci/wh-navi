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
  redlight:   "Işık Kamerası",
  mobile:     "Mobil Radar",
  corridor:   "Ortalama Hız",
  checkpoint: "Denetim Noktası",
};

// SVG icon for each radar type
function RadarIcon({ type }: { type: RadarType }) {
  const stroke = "white";
  if (type === "redlight") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="8" y="2" width="8" height="20" rx="3" stroke={stroke} strokeWidth="1.8"/>
        <circle cx="12" cy="7" r="2" fill="#EF4444"/>
        <circle cx="12" cy="12" r="2" fill="#F59E0B"/>
        <circle cx="12" cy="17" r="2" fill="#22C55E"/>
      </svg>
    );
  }
  if (type === "mobile") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M5 12.5A7 7 0 0119 12.5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M8 15.5a4 4 0 018 0" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="12" cy="18.5" r="1.5" fill={stroke}/>
      </svg>
    );
  }
  if (type === "checkpoint") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="7" height="16" rx="1" stroke={stroke} strokeWidth="1.8"/>
        <path d="M10 8h4a2 2 0 014 2v5a2 2 0 01-2 2h-6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="6.5" cy="12" r="2" fill={stroke} fillOpacity="0.3" stroke={stroke} strokeWidth="1.5"/>
      </svg>
    );
  }
  if (type === "corridor") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 12h18M6 7h12M6 17h12" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M8 4v16M16 4v16" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3"/>
      </svg>
    );
  }
  // speed (default)
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="7" width="18" height="12" rx="2.5" stroke={stroke} strokeWidth="1.8"/>
      <circle cx="8" cy="13" r="1.5" fill={stroke}/>
      <path d="M14 11l2 2-2 2" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 11h18" stroke={stroke} strokeWidth="1" strokeOpacity="0.25"/>
    </svg>
  );
}

function playBeep(distance: number, type: RadarType) {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const freq = type === "redlight" ? 1200 : distance < 100 ? 1000 : 880;
    const dur = distance < 100 ? 0.8 : 0.5;
    const play = (offset: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime + offset);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + dur);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + dur);
    };
    play(0);
    if (distance < 150) play(dur + 0.12);
    setTimeout(() => ctx.close(), 2500);
  } catch {
    // Audio unavailable
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

  const urgency = distance < 100 ? "critical" : distance < 250 ? "warning" : "info";

  const urgencyStyles = {
    critical: {
      bg: "rgba(153,27,27,0.97)",
      border: "rgba(252,165,165,0.4)",
      stripe: "#EF4444",
    },
    warning: {
      bg: "rgba(120,53,15,0.97)",
      border: "rgba(252,211,77,0.35)",
      stripe: "#F59E0B",
    },
    info: {
      bg: "rgba(10,16,30,0.97)",
      border: "rgba(255,255,255,0.1)",
      stripe: "#3B82F6",
    },
  }[urgency];

  const distM = Math.round(distance);
  const distLabel = distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`;

  return (
    <div style={{ animation: "slideDown 0.22s ease-out" }}>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="flex items-center overflow-hidden rounded-2xl shadow-2xl w-full"
        style={{
          background: urgencyStyles.bg,
          border: `1px solid ${urgencyStyles.border}`,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {/* Urgency stripe */}
        <div
          className="flex-shrink-0 self-stretch"
          style={{ width: 4, background: urgencyStyles.stripe }}
        />

        {/* Icon */}
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: 48,
            height: 56,
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <RadarIcon type={type} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 px-3 py-3">
          <div className="text-white font-bold text-sm leading-tight">
            {TYPE_LABELS[type]}
          </div>
          <div className="text-white/70 text-xs mt-0.5">
            {distLabel} ileride
            {maxspeed && (
              <>
                <span className="mx-1.5 opacity-40">·</span>
                <span>Limit {maxspeed} km/h</span>
              </>
            )}
          </div>
        </div>

        {/* Distance badge */}
        <div
          className="flex-shrink-0 flex items-center justify-center mr-3"
          style={{
            minWidth: 50,
            paddingLeft: 8,
            paddingRight: 8,
            height: 32,
            borderRadius: 8,
            background: "rgba(255,255,255,0.1)",
          }}
        >
          <span className="text-white font-black text-sm tabular-nums leading-none">
            {distLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
