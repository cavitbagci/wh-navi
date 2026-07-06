"use client";
import { useMemo } from "react";
import { formatDistance, formatDuration } from "@/lib/geo";

interface Props {
  step: google.maps.DirectionsStep;
  distanceToNext: number;
  stepIndex: number;
  totalSteps: number;
  remainingDistance: number;
  remainingSeconds: number;
}

// SVG arrow paths for each maneuver — drawn on 24×24 viewBox
function ManeuverArrow({ maneuver }: { maneuver: string }) {
  const s = "white";
  const sw = "2.5";
  const lc = "round";
  const lj = "round";

  const paths: Record<string, React.ReactNode> = {
    straight: (
      <>
        <path d="M12 21V5" stroke={s} strokeWidth={sw} strokeLinecap={lc} />
        <path d="M7 10L12 5L17 10" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    "turn-right": (
      <>
        <path d="M7 21V13Q7 5 15 5H17" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        <path d="M13 9L17 5L21 9" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    "turn-left": (
      <>
        <path d="M17 21V13Q17 5 9 5H7" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        <path d="M11 9L7 5L3 9" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    "turn-slight-right": (
      <>
        <path d="M8 21V13Q9 5 17 5" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        <path d="M13 9L17 5L21 9" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    "turn-slight-left": (
      <>
        <path d="M16 21V13Q15 5 7 5" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        <path d="M11 9L7 5L3 9" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    "turn-sharp-right": (
      <>
        <path d="M7 21V16Q7 10 13 8L17 6" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        <path d="M13 10L17 6L17 11" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    "turn-sharp-left": (
      <>
        <path d="M17 21V16Q17 10 11 8L7 6" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        <path d="M11 10L7 6L7 11" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    "uturn-left": (
      <>
        <path d="M15 21V9Q15 3 9 3Q3 3 3 9V14" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        <path d="M6 10L3 14L0 10" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    "uturn-right": (
      <>
        <path d="M9 21V9Q9 3 15 3Q21 3 21 9V14" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        <path d="M18 10L21 14L24 10" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    "roundabout-right": (
      <>
        <circle cx="12" cy="12" r="5.5" stroke={s} strokeWidth="2" fill="none" />
        <path d="M17.5 12H20" stroke={s} strokeWidth={sw} strokeLinecap={lc} />
        <path d="M16.5 8.5L20 12L16.5 15.5" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    "roundabout-left": (
      <>
        <circle cx="12" cy="12" r="5.5" stroke={s} strokeWidth="2" fill="none" />
        <path d="M6.5 12H4" stroke={s} strokeWidth={sw} strokeLinecap={lc} />
        <path d="M7.5 8.5L4 12L7.5 15.5" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
      </>
    ),
    ferry: (
      <>
        <path d="M3 12H21M3 12L6 9M3 12L6 15" stroke={s} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} />
        <path d="M5 17Q12 21 19 17" stroke={s} strokeWidth="2" strokeLinecap={lc} fill="none" />
      </>
    ),
  };

  const aliases: Record<string, string> = {
    "keep-right": "turn-slight-right",
    "keep-left": "turn-slight-left",
    "ramp-right": "turn-slight-right",
    "ramp-left": "turn-slight-left",
    "merge": "straight",
    "fork-right": "turn-slight-right",
    "fork-left": "turn-slight-left",
    "ferry-train": "ferry",
  };

  const key = aliases[maneuver] ?? maneuver;
  const content = paths[key] ?? paths["straight"];

  return (
    <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
      {content}
    </svg>
  );
}

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

// Stat chip with icon + label
function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-500">{icon}</span>
      <span className="text-slate-200 font-semibold text-sm tabular-nums">{value}</span>
      {label && <span className="text-slate-500 text-xs">{label}</span>}
    </div>
  );
}

export default function NavigationBar({
  step,
  distanceToNext,
  stepIndex,
  totalSteps,
  remainingDistance,
  remainingSeconds,
}: Props) {
  const maneuver = step.maneuver ?? "";
  const instruction = useMemo(() => stripHtml(step.instructions), [step.instructions]);

  return (
    <div
      className="absolute left-0 right-0 z-30 shadow-2xl"
      style={{
        top: 0,
        paddingTop: "env(safe-area-inset-top)",
        background: "rgba(10,16,30,0.97)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Maneuver row */}
      <div className="flex items-center gap-0 px-4 pt-3 pb-2.5">
        {/* Arrow tile */}
        <div
          className="flex-shrink-0 flex flex-col items-center justify-center rounded-2xl mr-3"
          style={{
            width: 64,
            height: 64,
            background: "linear-gradient(135deg, #2563EB, #3B82F6)",
            boxShadow: "0 4px 16px rgba(59,130,246,0.35)",
          }}
        >
          <ManeuverArrow maneuver={maneuver} />
          <span
            className="text-blue-200 font-semibold tabular-nums mt-0.5"
            style={{ fontSize: 11 }}
          >
            {stepDistFmt(distanceToNext)}
          </span>
        </div>

        {/* Instruction */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold leading-snug line-clamp-2" style={{ fontSize: 16 }}>
            {instruction}
          </p>
          <p className="text-slate-500 text-xs mt-0.5 font-medium">
            {stepIndex + 1} / {totalSteps} adım
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div
        className="flex items-center justify-between px-4 pb-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <Stat
          icon={
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
              <circle cx="8" cy="14" r="1.5" fill="currentColor"/>
            </svg>
          }
          value={formatDistance(remainingDistance)}
          label="kaldı"
        />

        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />

        <Stat
          icon={
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 4.5V8L10.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
          value={formatDuration(remainingSeconds)}
        />

        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />

        <Stat
          icon={
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 14L8 2L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4.5 10h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          }
          value={etaLabel(remainingSeconds)}
        />
      </div>
    </div>
  );
}
