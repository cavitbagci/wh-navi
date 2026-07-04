"use client";
import { useMemo } from "react";
import { formatDistance, formatDuration } from "@/lib/geo";

interface Props {
  step: google.maps.DirectionsStep;
  distanceToNext: number;
  stepIndex: number;
  totalSteps: number;
  remainingDistance: number; // meters
  remainingSeconds: number;  // seconds
}

const MANEUVER_ICONS: Record<string, string> = {
  "turn-right": "→",
  "turn-left": "←",
  "turn-slight-right": "↗",
  "turn-slight-left": "↖",
  "turn-sharp-right": "↱",
  "turn-sharp-left": "↰",
  "straight": "↑",
  "keep-right": "↗",
  "keep-left": "↖",
  "ramp-right": "↗",
  "ramp-left": "↖",
  "merge": "↑",
  "fork-left": "↖",
  "fork-right": "↗",
  "ferry": "⛴",
  "ferry-train": "🚂",
  "roundabout-right": "↻",
  "roundabout-left": "↺",
  "uturn-left": "↩",
  "uturn-right": "↪",
};

function stepDistFmt(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  if (m >= 100) return `${Math.round(m / 50) * 50} m`;
  return `${Math.round(m / 10) * 10} m`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

function etaLabel(seconds: number): string {
  const arrival = new Date(Date.now() + seconds * 1000);
  return arrival.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export default function NavigationBar({
  step,
  distanceToNext,
  stepIndex,
  totalSteps,
  remainingDistance,
  remainingSeconds,
}: Props) {
  const icon = useMemo(() => MANEUVER_ICONS[step.maneuver ?? ""] ?? "↑", [step.maneuver]);
  const instruction = useMemo(() => stripHtml(step.instructions), [step.instructions]);

  return (
    <div
      className="absolute left-0 right-0 z-30 bg-gray-900/98 backdrop-blur-md border-b border-gray-700/50 shadow-2xl"
      style={{ top: 0, paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Turn instruction row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-14 h-14 flex-shrink-0 bg-blue-600 rounded-2xl flex flex-col items-center justify-center shadow-lg">
          <span className="text-white text-2xl leading-none">{icon}</span>
          <span className="text-blue-200 text-[10px] mt-0.5">{stepDistFmt(distanceToNext)}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-base leading-tight line-clamp-2">
            {instruction}
          </p>
          <p className="text-gray-400 text-xs mt-0.5">
            Adım {stepIndex + 1} / {totalSteps}
          </p>
        </div>
      </div>

      {/* Bottom stats row */}
      <div className="flex items-center justify-between px-4 pb-2.5 gap-2">
        <div className="flex items-center gap-1 text-gray-300 text-xs">
          <span className="text-gray-500">📍</span>
          <span className="font-semibold">{formatDistance(remainingDistance)}</span>
          <span className="text-gray-500">kaldı</span>
        </div>

        <div className="h-4 w-px bg-gray-700" />

        <div className="flex items-center gap-1 text-gray-300 text-xs">
          <span className="text-gray-500">⏱</span>
          <span className="font-semibold">{formatDuration(remainingSeconds)}</span>
        </div>

        <div className="h-4 w-px bg-gray-700" />

        <div className="flex items-center gap-1 text-gray-300 text-xs">
          <span className="text-gray-500">🏁</span>
          <span className="font-semibold">{etaLabel(remainingSeconds)}</span>
        </div>
      </div>
    </div>
  );
}
