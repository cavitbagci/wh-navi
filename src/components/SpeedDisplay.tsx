"use client";

interface Props {
  speedKmh: number | null;
  speedLimit?: number; // from nearby radar
}

export default function SpeedDisplay({ speedKmh, speedLimit }: Props) {
  if (speedKmh === null) return null;

  const speed = Math.round(speedKmh);
  const overLimit = speedLimit != null && speed > speedLimit;

  return (
    <div
      className={`absolute left-4 z-20 flex flex-col items-center justify-center rounded-2xl shadow-2xl border-2 transition-colors ${
        overLimit
          ? "bg-red-700 border-red-400"
          : "bg-gray-900/95 border-gray-700/50"
      }`}
      style={{
        width: 68,
        bottom: "max(5rem, calc(env(safe-area-inset-bottom) + 4rem))",
      }}
    >
      <span
        className={`font-black leading-none tabular-nums ${
          speed >= 100 ? "text-2xl" : "text-3xl"
        } ${overLimit ? "text-white" : "text-white"}`}
        style={{ paddingTop: 8 }}
      >
        {speed}
      </span>
      <span
        className={`text-[10px] font-medium pb-1 ${
          overLimit ? "text-red-200" : "text-gray-400"
        }`}
      >
        km/s
      </span>
      {speedLimit != null && (
        <div
          className={`w-10 h-10 rounded-full border-[3px] flex items-center justify-center mb-1 text-xs font-black ${
            overLimit
              ? "border-white text-white bg-red-600"
              : "border-red-500 text-white bg-gray-800"
          }`}
        >
          {speedLimit}
        </div>
      )}
    </div>
  );
}
