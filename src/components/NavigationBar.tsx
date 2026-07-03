"use client";
import { useMemo } from "react";

interface Props {
  step: google.maps.DirectionsStep;
  distanceToNext: number;
  stepIndex: number;
  totalSteps: number;
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

function formatDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  if (m >= 100) return `${Math.round(m / 50) * 50} m`;
  return `${Math.round(m / 10) * 10} m`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

export default function NavigationBar({ step, distanceToNext, stepIndex, totalSteps }: Props) {
  const icon = useMemo(
    () => MANEUVER_ICONS[step.maneuver ?? ""] ?? "↑",
    [step.maneuver]
  );
  const instruction = useMemo(() => stripHtml(step.instructions), [step.instructions]);
  const dist = formatDist(distanceToNext);

  return (
    <div
      className="absolute left-0 right-0 z-30 bg-gray-900/98 backdrop-blur-md border-b border-gray-700/50 shadow-2xl"
      style={{ top: 0, paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Yön ikonu */}
        <div className="w-14 h-14 flex-shrink-0 bg-blue-600 rounded-2xl flex flex-col items-center justify-center shadow-lg">
          <span className="text-white text-2xl leading-none">{icon}</span>
          <span className="text-blue-200 text-[10px] mt-0.5">{dist}</span>
        </div>

        {/* Talimat */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-base leading-tight line-clamp-2">
            {instruction}
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Adım {stepIndex + 1} / {totalSteps}
          </p>
        </div>
      </div>
    </div>
  );
}
