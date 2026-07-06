"use client";

interface RouteInfo {
  summary: string;
  duration: string;
  distance: string;
}

interface Props {
  routes: RouteInfo[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  navigating: boolean;
  onStartNavigation: () => void;
  onStopNavigation: () => void;
  onCancel: () => void;
}

const panelBg = "rgba(10,16,30,0.97)";
const border = "1px solid rgba(255,255,255,0.08)";

export default function RoutePanel({
  routes,
  selectedIndex,
  onSelect,
  navigating,
  onStartNavigation,
  onStopNavigation,
  onCancel,
}: Props) {
  if (routes.length === 0) return null;

  return (
    <div
      className="absolute left-4 right-4 z-20 max-w-md mx-auto md:right-auto md:w-96 md:mx-0"
      style={{
        bottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div
        className="rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          background: panelBg,
          border,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          maxHeight: "46vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: border }}
        >
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-widest">
            {routes.length} Rota
          </span>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium transition-colors rounded-lg px-2.5 py-1"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>İptal</span>
          </button>
        </div>

        {/* Route cards — scrollable */}
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {routes.map((route, i) => {
            const selected = i === selectedIndex;
            return (
              <button
                key={i}
                onClick={() => onSelect(i)}
                className="w-full text-left rounded-xl transition-all"
                style={{
                  padding: "12px 14px",
                  background: selected
                    ? "rgba(59,130,246,0.18)"
                    : "rgba(255,255,255,0.04)",
                  border: selected
                    ? "1.5px solid rgba(59,130,246,0.5)"
                    : "1.5px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Route number */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      width: 26,
                      height: 26,
                      background: selected ? "#3B82F6" : "rgba(255,255,255,0.1)",
                      color: selected ? "white" : "#94A3B8",
                      marginTop: 2,
                    }}
                  >
                    {i + 1}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-bold tabular-nums leading-none"
                      style={{
                        fontSize: 20,
                        color: selected ? "#F1F5F9" : "#CBD5E1",
                      }}
                    >
                      {route.duration}
                    </div>
                    <div
                      className="text-xs mt-1 truncate"
                      style={{ color: selected ? "#93C5FD" : "#64748B" }}
                    >
                      {route.distance}
                      {route.summary && (
                        <>
                          <span className="mx-1 opacity-50">·</span>
                          {route.summary}
                        </>
                      )}
                    </div>
                  </div>

                  {selected && (
                    <div className="flex-shrink-0 mt-1">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="9" stroke="#3B82F6" strokeWidth="1.5"/>
                        <path d="M6 10l3 3 5-5" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Action button — fixed at bottom */}
        <div className="flex-shrink-0 p-3 pt-0">
          {!navigating ? (
            <button
              onClick={onStartNavigation}
              className="w-full text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2.5 transition-opacity active:opacity-80"
              style={{
                height: 50,
                background: "linear-gradient(135deg, #16A34A, #22C55E)",
                boxShadow: "0 4px 16px rgba(34,197,94,0.3)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 4l15 8-15 8V4z" fill="white"/>
              </svg>
              Navigasyonu Başlat
            </button>
          ) : (
            <button
              onClick={onStopNavigation}
              className="w-full text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2.5 transition-opacity active:opacity-80"
              style={{
                height: 50,
                background: "linear-gradient(135deg, #DC2626, #EF4444)",
                boxShadow: "0 4px 16px rgba(239,68,68,0.3)",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect width="12" height="12" rx="2" fill="white"/>
              </svg>
              Navigasyonu Durdur
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
