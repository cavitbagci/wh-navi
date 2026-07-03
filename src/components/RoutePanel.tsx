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
    <div className="absolute bottom-6 left-4 right-4 z-20 max-w-md mx-auto">
      <div className="bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-700/50 p-4 space-y-3">
        {/* Başlık + iptal butonu */}
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-xs font-medium uppercase tracking-wide">
            {routes.length} rota bulundu
          </span>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 text-gray-400 hover:text-white text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <span>✕</span>
            <span>İptal</span>
          </button>
        </div>

        {/* Rota seçenekleri */}
        <div className="space-y-2">
          {routes.map((route, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                selectedIndex === i
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    selectedIndex === i ? "bg-white text-blue-600" : "bg-gray-600 text-white"
                  }`}
                >
                  {i + 1}
                </div>
                <div>
                  <div className="font-semibold text-sm">{route.duration}</div>
                  <div className={`text-xs ${selectedIndex === i ? "text-blue-200" : "text-gray-500"}`}>
                    {route.distance} · {route.summary}
                  </div>
                </div>
              </div>
              {selectedIndex === i && (
                <span className="text-blue-200 text-xs flex-shrink-0">Seçili</span>
              )}
            </button>
          ))}
        </div>

        {/* Navigasyon butonu */}
        {!navigating ? (
          <button
            onClick={onStartNavigation}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <span>▶</span>
            <span>Navigasyonu Başlat</span>
          </button>
        ) : (
          <button
            onClick={onStopNavigation}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <span>■</span>
            <span>Navigasyonu Durdur</span>
          </button>
        )}
      </div>
    </div>
  );
}
