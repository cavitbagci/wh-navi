"use client";

interface Props {
  speedKmh: number | null;
  speedLimit?: number;
}

export default function SpeedDisplay({ speedKmh, speedLimit }: Props) {
  if (speedKmh === null) return null;

  const speed = Math.round(speedKmh);
  const overLimit = speedLimit != null && speed > speedLimit;
  const isHighSpeed = speed >= 100;

  return (
    <div
      className="absolute left-4 z-20 flex flex-col items-center"
      style={{
        bottom: "max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))",
      }}
    >
      {/* Speed bubble */}
      <div
        className="flex flex-col items-center justify-center rounded-2xl shadow-2xl transition-colors duration-300"
        style={{
          width: 72,
          paddingTop: 10,
          paddingBottom: speedLimit != null ? 4 : 10,
          background: overLimit
            ? "rgba(185,28,28,0.96)"
            : "rgba(10,16,30,0.96)",
          border: overLimit
            ? "2px solid rgba(252,165,165,0.6)"
            : "1px solid rgba(255,255,255,0.09)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <span
          className="text-white font-black tabular-nums leading-none"
          style={{ fontSize: isHighSpeed ? 24 : 28 }}
        >
          {speed}
        </span>
        <span
          className="font-medium leading-none"
          style={{
            fontSize: 10,
            color: overLimit ? "rgba(254,202,202,0.85)" : "#64748B",
            marginTop: 3,
            marginBottom: speedLimit != null ? 6 : 0,
          }}
        >
          km/s
        </span>

        {/* European-style speed limit sign */}
        {speedLimit != null && (
          <div
            className="flex items-center justify-center font-black"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "white",
              border: `3px solid ${overLimit ? "rgba(252,165,165,0.8)" : "#DC2626"}`,
              color: "#1E293B",
              fontSize: speedLimit >= 100 ? 11 : 13,
              boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
              marginBottom: 6,
            }}
          >
            {speedLimit}
          </div>
        )}
      </div>
    </div>
  );
}
