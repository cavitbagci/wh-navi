"use client";
import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import AppLogo from "./AppLogo";

interface Props {
  onRouteFound: (result: google.maps.DirectionsResult, destination: google.maps.LatLng) => void;
  onClear: () => void;
  hasRoute: boolean;
}

type Field = "origin" | "dest";

function GpsIcon({ spinning }: { spinning?: boolean }) {
  if (spinning) {
    return (
      <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M7 16V4M7 4L3 8M7 4L11 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 8v12M17 20l4-4M17 20l-4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-medium rounded-full transition-all"
      style={{
        paddingLeft: 10,
        paddingRight: 10,
        height: 28,
        background: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
        border: active ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
        color: active ? "#93C5FD" : "#64748B",
      }}
    >
      {active && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="#93C5FD" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {label}
    </button>
  );
}

export default function SearchPanel({ onRouteFound, onClear, hasRoute }: Props) {
  const placesLib = useMapsLibrary("places");
  const routesLib = useMapsLibrary("routes");
  const originRef = useRef<HTMLInputElement>(null);
  const destRef = useRef<HTMLInputElement>(null);

  // Keep refs to Autocomplete widgets so we can update their bias later
  const originACRef = useRef<google.maps.places.Autocomplete | null>(null);
  const destACRef = useRef<google.maps.places.Autocomplete | null>(null);

  const originPlaceRef = useRef<google.maps.places.PlaceResult | null>(null);
  const destPlaceRef = useRef<google.maps.places.PlaceResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState<Field | null>(null);
  const [error, setError] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);

  // Route options
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [avoidTolls, setAvoidTolls] = useState(false);

  // User position for autocomplete bias — fetched silently once on mount
  const [biasPos, setBiasPos] = useState<google.maps.LatLng | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBiasPos(
          new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude)
        );
      },
      () => {}, // silent fail — bias is optional
      { timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  // When location becomes known, update both autocomplete widgets with a bias box.
  // strictBounds: false → still returns results outside the box (e.g. distant cities),
  // but ranks nearby results first.
  useEffect(() => {
    if (!biasPos) return;
    const delta = 0.45; // ~50 km in each direction
    const deltaLng = 0.6;
    const bounds = new google.maps.LatLngBounds(
      { lat: biasPos.lat() - delta, lng: biasPos.lng() - deltaLng },
      { lat: biasPos.lat() + delta, lng: biasPos.lng() + deltaLng }
    );
    originACRef.current?.setOptions({ bounds, strictBounds: false });
    destACRef.current?.setOptions({ bounds, strictBounds: false });
  }, [biasPos]);

  // Create Autocomplete widgets — session tokens are managed automatically by the widget
  useEffect(() => {
    if (!placesLib || !originRef.current || !destRef.current) return;

    const baseOpts: google.maps.places.AutocompleteOptions = {
      componentRestrictions: { country: "tr" },
      fields: ["geometry", "name", "formatted_address"],
    };

    const originAC = new placesLib.Autocomplete(originRef.current, baseOpts);
    originAC.addListener("place_changed", () => {
      originPlaceRef.current = originAC.getPlace();
    });
    originACRef.current = originAC;

    const destAC = new placesLib.Autocomplete(destRef.current, baseOpts);
    destAC.addListener("place_changed", () => {
      destPlaceRef.current = destAC.getPlace();
    });
    destACRef.current = destAC;

    // If we already have a bias position, apply it immediately
    if (biasPos) {
      const delta = 0.45;
      const deltaLng = 0.6;
      const bounds = new google.maps.LatLngBounds(
        { lat: biasPos.lat() - delta, lng: biasPos.lng() - deltaLng },
        { lat: biasPos.lat() + delta, lng: biasPos.lng() + deltaLng }
      );
      originAC.setOptions({ bounds, strictBounds: false });
      destAC.setOptions({ bounds, strictBounds: false });
    }

    return () => {
      google.maps.event.clearInstanceListeners(originAC);
      google.maps.event.clearInstanceListeners(destAC);
      originACRef.current = null;
      destACRef.current = null;
    };
    // biasPos intentionally excluded — the separate effect handles updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib]);

  const useMyLocation = (field: Field) => {
    if (!navigator.geolocation) {
      setError("Tarayıcınız konum özelliğini desteklemiyor.");
      return;
    }
    setLocating(field);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);

        // Also update autocomplete bias with the fresh position
        setBiasPos(latlng);

        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: latlng }, (results, status) => {
          setLocating(null);
          if (status === "OK" && results?.[0]) {
            const place = results[0];
            if (field === "origin") {
              if (originRef.current) originRef.current.value = place.formatted_address ?? "";
              originPlaceRef.current = place;
            } else {
              if (destRef.current) destRef.current.value = place.formatted_address ?? "";
              destPlaceRef.current = place;
            }
          } else {
            setError("Konum adrese çevrilemedi.");
          }
        });
      },
      () => {
        setLocating(null);
        setError("Konum alınamadı. İzin verdiğinizden emin olun.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSwap = () => {
    const originVal = originRef.current?.value ?? "";
    const destVal = destRef.current?.value ?? "";
    if (originRef.current) originRef.current.value = destVal;
    if (destRef.current) destRef.current.value = originVal;
    const tmp = originPlaceRef.current;
    originPlaceRef.current = destPlaceRef.current;
    destPlaceRef.current = tmp;
  };

  const handleRoute = async () => {
    if (!routesLib) return;
    setError("");

    const origin = originPlaceRef.current?.geometry?.location;
    const destination = destPlaceRef.current?.geometry?.location;

    if (!origin || !destination) {
      setError("Lütfen başlangıç ve varış noktası seçin.");
      return;
    }

    setLoading(true);
    try {
      const service = new routesLib.DirectionsService();
      const result = await service.route({
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
        avoidHighways,
        avoidTolls,
        // Real-time traffic data — gives more realistic route durations and alternatives
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: google.maps.TrafficModel.BEST_GUESS,
        },
        region: "tr",
        language: "tr",
      });
      onRouteFound(result, destination);
      setIsExpanded(false);
    } catch {
      setError("Rota bulunamadı. Lütfen adresleri kontrol edin.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    if (originRef.current) originRef.current.value = "";
    if (destRef.current) destRef.current.value = "";
    originPlaceRef.current = null;
    destPlaceRef.current = null;
    setError("");
    setIsExpanded(true);
    setAvoidHighways(false);
    setAvoidTolls(false);
    onClear();
  };

  const panelBg = "rgba(10,16,30,0.96)";
  const inputBg = "rgba(255,255,255,0.05)";
  const border = "1px solid rgba(255,255,255,0.08)";

  return (
    <div
      className="absolute top-4 left-4 right-4 z-20 max-w-md mx-auto md:right-auto md:w-96 md:mx-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        className="rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: panelBg,
          border,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {/* Header */}
        <button
          className="w-full flex items-center justify-between px-4 py-3.5"
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
        >
          <div className="flex items-center gap-2.5">
            <AppLogo size={28} />
            <span className="text-white font-semibold text-sm tracking-wide select-none">
              WH Navigasyon
            </span>
          </div>
          <div
            className="flex items-center justify-center rounded-full transition-transform duration-200"
            style={{
              width: 28,
              height: 28,
              background: "rgba(255,255,255,0.06)",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4L6 8L10 4" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>

        {/* Form */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-2">
            {/* Inputs */}
            <div className="relative">
              {/* Origin */}
              <div
                className="flex items-center gap-3 px-3 rounded-xl"
                style={{ background: inputBg, border, height: 48 }}
              >
                <div className="flex-shrink-0 rounded-full" style={{ width: 9, height: 9, background: "#22C55E" }} />
                <input
                  ref={originRef}
                  placeholder="Başlangıç noktası"
                  style={{
                    flex: 1,
                    background: "transparent",
                    color: "#F1F5F9",
                    fontSize: 14,
                    outline: "none",
                    border: "none",
                    minWidth: 0,
                  }}
                  className="placeholder-slate-500"
                />
                <button
                  onClick={() => useMyLocation("origin")}
                  disabled={locating !== null}
                  title="Mevcut konumumu kullan"
                  className="flex-shrink-0 text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors"
                >
                  <GpsIcon spinning={locating === "origin"} />
                </button>
              </div>

              {/* Swap */}
              <div className="flex items-center my-0.5 relative" style={{ height: 24 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)", marginLeft: 16 }} />
                <button
                  onClick={handleSwap}
                  title="Başlangıç ve varışı değiştir"
                  className="flex items-center justify-center rounded-full text-slate-400 hover:text-white transition-colors flex-shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    margin: "0 8px",
                  }}
                >
                  <SwapIcon />
                </button>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)", marginRight: 16 }} />
              </div>

              {/* Destination */}
              <div
                className="flex items-center gap-3 px-3 rounded-xl"
                style={{ background: inputBg, border, height: 48 }}
              >
                <div className="flex-shrink-0 rounded-full" style={{ width: 9, height: 9, background: "#EF4444" }} />
                <input
                  ref={destRef}
                  placeholder="Varış noktası"
                  style={{
                    flex: 1,
                    background: "transparent",
                    color: "#F1F5F9",
                    fontSize: 14,
                    outline: "none",
                    border: "none",
                    minWidth: 0,
                  }}
                  className="placeholder-slate-500"
                />
                <button
                  onClick={() => useMyLocation("dest")}
                  disabled={locating !== null}
                  title="Mevcut konumumu varış yap"
                  className="flex-shrink-0 text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors"
                >
                  <GpsIcon spinning={locating === "dest"} />
                </button>
              </div>
            </div>

            {/* Route options */}
            <div className="flex items-center gap-2 pt-0.5">
              <ToggleChip
                active={avoidHighways}
                onClick={() => setAvoidHighways((v) => !v)}
                label="Otoyol kaçın"
              />
              <ToggleChip
                active={avoidTolls}
                onClick={() => setAvoidTolls((v) => !v)}
                label="Ücretli kaçın"
              />
            </div>

            {error && <p className="text-red-400 text-xs px-1">{error}</p>}

            <div className="flex gap-2 pt-0.5">
              <button
                onClick={handleRoute}
                disabled={loading}
                className="flex-1 text-white font-semibold text-sm rounded-xl transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  height: 46,
                  background: loading ? "#2563EB" : "linear-gradient(135deg, #2563EB, #3B82F6)",
                  boxShadow: "0 4px 16px rgba(59,130,246,0.3)",
                }}
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Hesaplanıyor…</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M3 12L21 12M21 12L14 5M21 12L14 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Rota Bul</span>
                  </>
                )}
              </button>

              {hasRoute && (
                <button
                  onClick={handleClear}
                  className="px-4 text-slate-300 hover:text-white text-sm rounded-xl font-medium transition-colors"
                  style={{
                    height: 46,
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.09)",
                  }}
                >
                  İptal
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
