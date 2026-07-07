"use client";
import { formatDistance, formatDuration } from "@/lib/geo";

interface Props {
  durationMs: number;
  distanceMeters: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  onClose: () => void;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.07)",
        padding: "14px 8px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <span className="text-slate-400 text-xs font-medium mb-1">{label}</span>
      <span className="text-white font-black tabular-nums" style={{ fontSize: 22, lineHeight: 1 }}>
        {value}
      </span>
      {sub && <span className="text-slate-500 text-xs mt-0.5">{sub}</span>}
    </div>
  );
}

export default function TripSummary({ durationMs, distanceMeters, maxSpeedKmh, avgSpeedKmh, onClose }: Props) {
  const dist = formatDistance(distanceMeters);
  const dur = formatDuration(Math.round(durationMs / 1000));

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-md mx-auto rounded-t-3xl shadow-2xl"
        style={{
          background: "rgba(10,16,30,0.98)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderBottom: "none",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center pt-5 pb-4 px-5">
          <div
            className="flex items-center justify-center rounded-full mb-3"
            style={{ width: 48, height: 48, background: "rgba(34,197,94,0.15)", border: "1.5px solid rgba(34,197,94,0.4)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5L20 7" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-white font-bold text-lg">Seyahat Tamamlandı</h2>
          <p className="text-slate-500 text-sm">Güvenli sürüş için teşekkürler</p>
        </div>

        {/* Stats */}
        <div className="flex gap-2 px-4 pb-4">
          <StatTile label="Süre" value={dur} />
          <StatTile label="Mesafe" value={dist} />
          <StatTile label="Maks." value={`${maxSpeedKmh}`} sub="km/s" />
          <StatTile label="Ort." value={`${avgSpeedKmh}`} sub="km/s" />
        </div>

        {/* Close */}
        <div className="px-4">
          <button
            onClick={onClose}
            className="w-full text-white font-bold text-sm rounded-2xl"
            style={{
              height: 50,
              background: "linear-gradient(135deg, #16A34A, #22C55E)",
              boxShadow: "0 4px 16px rgba(34,197,94,0.25)",
            }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
