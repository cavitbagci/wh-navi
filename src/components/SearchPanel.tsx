"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import AppLogo from "./AppLogo";

interface Props {
  onRouteFound: (result: google.maps.DirectionsResult, destination: google.maps.LatLng) => void;
  onClear: () => void;
  hasRoute: boolean;
}

type Field = "origin" | "dest";

// ── Recent places ──────────────────────────────────────────────────────────────

interface RecentPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const RECENT_KEY = "wh-navi-recent-v1";
const MAX_RECENT = 8;

function loadRecent(): RecentPlace[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}

function saveRecent(p: RecentPlace) {
  const list = loadRecent().filter((r) => r.address !== p.address);
  localStorage.setItem(RECENT_KEY, JSON.stringify([p, ...list].slice(0, MAX_RECENT)));
}

function placeToRecent(place: google.maps.places.PlaceResult): RecentPlace | null {
  const loc = place.geometry?.location;
  if (!loc || !place.formatted_address) return null;
  return {
    name: place.name ?? place.formatted_address,
    address: place.formatted_address,
    lat: loc.lat(),
    lng: loc.lng(),
  };
}

function recentToFakePlace(r: RecentPlace): google.maps.places.PlaceResult {
  return {
    geometry: { location: new google.maps.LatLng(r.lat, r.lng) },
    name: r.name,
    formatted_address: r.address,
  };
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function GpsIcon({ spinning }: { spinning?: boolean }) {
  if (spinning) return <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />;
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

function HistoryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M3 12a9 9 0 109-9H3" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M3 7v5h5" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 7v5l3 3" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function ToggleChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-medium rounded-full transition-all"
      style={{
        paddingLeft: 10, paddingRight: 10, height: 28,
        background: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
        border: active ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
        color: active ? "#93C5FD" : "#64748B",
      }}
    >
      {active && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="#93C5FD" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {label}
    </button>
  );
}

// ── WaypointInput — self-contained Autocomplete for one intermediate stop ─────

interface WaypointInputProps {
  index: number;
  placesLib: google.maps.PlacesLibrary | null;
  biasPos: google.maps.LatLng | null;
  onPlaceChange: (place: google.maps.places.PlaceResult | null) => void;
  onRemove: () => void;
}

function WaypointInput({ index, placesLib, biasPos, onPlaceChange, onRemove }: WaypointInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  // Keep onPlaceChange stable in the listener via ref
  const cbRef = useRef(onPlaceChange);
  cbRef.current = onPlaceChange;

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;
    const ac = new placesLib.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "tr" },
      fields: ["geometry", "name", "formatted_address"],
    });
    ac.addListener("place_changed", () => cbRef.current(ac.getPlace()));
    acRef.current = ac;
    return () => {
      google.maps.event.clearInstanceListeners(ac);
      acRef.current = null;
    };
  }, [placesLib]);

  useEffect(() => {
    if (!biasPos || !acRef.current) return;
    acRef.current.setOptions({
      bounds: new google.maps.LatLngBounds(
        { lat: biasPos.lat() - 0.45, lng: biasPos.lng() - 0.6 },
        { lat: biasPos.lat() + 0.45, lng: biasPos.lng() + 0.6 }
      ),
      strictBounds: false,
    });
  }, [biasPos]);

  return (
    <div
      className="flex items-center gap-3 px-3 rounded-xl"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", height: 48 }}
    >
      <div className="flex-shrink-0 rounded" style={{ width: 9, height: 9, background: "#A78BFA" }} />
      <input
        ref={inputRef}
        placeholder={`Ara durak ${index + 1}`}
        style={{ flex: 1, background: "transparent", color: "#F1F5F9", fontSize: 14, outline: "none", border: "none", minWidth: 0 }}
        className="placeholder-slate-500"
      />
      <button onClick={onRemove} className="flex-shrink-0 text-slate-500 hover:text-red-400 transition-colors">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

// ── RecentDropdown ────────────────────────────────────────────────────────────

function RecentDropdown({ items, onSelect }: { items: RecentPlace[]; onSelect: (p: RecentPlace) => void }) {
  if (items.length === 0) return null;
  return (
    <div
      className="absolute left-0 right-0 z-50 rounded-xl overflow-hidden shadow-2xl"
      style={{
        top: "calc(100% + 4px)",
        background: "rgba(10,16,30,0.99)",
        border: "1px solid rgba(255,255,255,0.09)",
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <HistoryIcon />
        <span className="text-slate-500 text-xs font-medium">Son Aramalar</span>
      </div>
      {items.map((place, i) => (
        <button
          key={i}
          onMouseDown={() => onSelect(place)}
          className="w-full flex flex-col items-start px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
          style={{ borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
        >
          <span className="text-slate-200 text-sm font-medium truncate w-full">{place.name}</span>
          <span className="text-slate-500 text-xs truncate w-full">{place.address}</span>
        </button>
      ))}
    </div>
  );
}

// ── SearchPanel ───────────────────────────────────────────────────────────────

export default function SearchPanel({ onRouteFound, onClear, hasRoute }: Props) {
  const placesLib = useMapsLibrary("places");
  const routesLib = useMapsLibrary("routes");
  const originRef = useRef<HTMLInputElement>(null);
  const destRef = useRef<HTMLInputElement>(null);
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
  const [avoidNorthMarmara, setAvoidNorthMarmara] = useState(false);

  // Intermediate waypoints (max 3)
  const [waypoints, setWaypoints] = useState<Array<google.maps.places.PlaceResult | null>>([]);

  // Recent searches
  const [recentPlaces, setRecentPlaces] = useState<RecentPlace[]>([]);
  const [originFocused, setOriginFocused] = useState(false);
  const [destFocused, setDestFocused] = useState(false);
  const [originEmpty, setOriginEmpty] = useState(true);
  const [destEmpty, setDestEmpty] = useState(true);

  // Autocomplete location bias
  const [biasPos, setBiasPos] = useState<google.maps.LatLng | null>(null);

  useEffect(() => {
    setRecentPlaces(loadRecent());
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setBiasPos(new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude)),
      () => {},
      { timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  // Update bias on both autocomplete widgets
  useEffect(() => {
    if (!biasPos) return;
    const bounds = new google.maps.LatLngBounds(
      { lat: biasPos.lat() - 0.45, lng: biasPos.lng() - 0.6 },
      { lat: biasPos.lat() + 0.45, lng: biasPos.lng() + 0.6 }
    );
    originACRef.current?.setOptions({ bounds, strictBounds: false });
    destACRef.current?.setOptions({ bounds, strictBounds: false });
  }, [biasPos]);

  // Create Autocomplete widgets
  useEffect(() => {
    if (!placesLib || !originRef.current || !destRef.current) return;

    const baseOpts: google.maps.places.AutocompleteOptions = {
      componentRestrictions: { country: "tr" },
      fields: ["geometry", "name", "formatted_address"],
    };

    const originAC = new placesLib.Autocomplete(originRef.current, baseOpts);
    originAC.addListener("place_changed", () => {
      const place = originAC.getPlace();
      originPlaceRef.current = place;
      setOriginEmpty(false);
      const r = placeToRecent(place);
      if (r) { saveRecent(r); setRecentPlaces(loadRecent()); }
    });
    originACRef.current = originAC;

    const destAC = new placesLib.Autocomplete(destRef.current, baseOpts);
    destAC.addListener("place_changed", () => {
      const place = destAC.getPlace();
      destPlaceRef.current = place;
      setDestEmpty(false);
      const r = placeToRecent(place);
      if (r) { saveRecent(r); setRecentPlaces(loadRecent()); }
    });
    destACRef.current = destAC;

    if (biasPos) {
      const bounds = new google.maps.LatLngBounds(
        { lat: biasPos.lat() - 0.45, lng: biasPos.lng() - 0.6 },
        { lat: biasPos.lat() + 0.45, lng: biasPos.lng() + 0.6 }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLib]);

  const selectRecent = (place: RecentPlace, field: Field) => {
    const fake = recentToFakePlace(place);
    if (field === "origin") {
      if (originRef.current) originRef.current.value = place.name;
      originPlaceRef.current = fake;
      setOriginEmpty(false);
      setOriginFocused(false);
    } else {
      if (destRef.current) destRef.current.value = place.name;
      destPlaceRef.current = fake;
      setDestEmpty(false);
      setDestFocused(false);
    }
  };

  const useMyLocation = (field: Field) => {
    if (!navigator.geolocation) { setError("Tarayıcınız konum özelliğini desteklemiyor."); return; }
    setLocating(field);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        setBiasPos(latlng);
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: latlng }, (results, status) => {
          setLocating(null);
          if (status === "OK" && results?.[0]) {
            const place = results[0];
            const fakePlace: google.maps.places.PlaceResult = {
              geometry: { location: latlng },
              name: "Mevcut Konum",
              formatted_address: place.formatted_address,
            };
            if (field === "origin") {
              if (originRef.current) originRef.current.value = "Mevcut Konum";
              originPlaceRef.current = fakePlace;
              setOriginEmpty(false);
            } else {
              if (destRef.current) destRef.current.value = "Mevcut Konum";
              destPlaceRef.current = fakePlace;
              setDestEmpty(false);
            }
          } else {
            setError("Konum adrese çevrilemedi.");
          }
        });
      },
      () => { setLocating(null); setError("Konum alınamadı. İzin verdiğinizden emin olun."); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSwap = () => {
    const ov = originRef.current?.value ?? "";
    const dv = destRef.current?.value ?? "";
    if (originRef.current) originRef.current.value = dv;
    if (destRef.current) destRef.current.value = ov;
    const tmp = originPlaceRef.current;
    originPlaceRef.current = destPlaceRef.current;
    destPlaceRef.current = tmp;
    setOriginEmpty(dv === "");
    setDestEmpty(ov === "");
  };

  const addWaypoint = () => {
    if (waypoints.length >= 3) return;
    setWaypoints((prev) => [...prev, null]);
  };

  const removeWaypoint = (i: number) => {
    setWaypoints((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateWaypoint = useCallback((i: number, place: google.maps.places.PlaceResult | null) => {
    setWaypoints((prev) => { const n = [...prev]; n[i] = place; return n; });
  }, []);

  const geocodeText = (text: string): Promise<google.maps.LatLng | null> =>
    new Promise((resolve) => {
      new google.maps.Geocoder().geocode(
        { address: text, region: "tr", language: "tr" },
        (results, status) => {
          resolve(status === "OK" && results?.[0]?.geometry?.location
            ? results[0].geometry.location
            : null);
        }
      );
    });

  const handleRoute = async () => {
    if (!routesLib) return;
    setError("");

    let origin = originPlaceRef.current?.geometry?.location ?? null;
    let destination = destPlaceRef.current?.geometry?.location ?? null;

    // Fallback: geocode typed text if user didn't select from dropdown
    const originText = originRef.current?.value?.trim();
    const destText = destRef.current?.value?.trim();
    if (!origin && originText) {
      setLoading(true);
      origin = await geocodeText(originText);
    }
    if (!destination && destText) {
      setLoading(true);
      destination = await geocodeText(destText);
    }

    if (!origin || !destination) {
      setLoading(false);
      setError("Lütfen başlangıç ve varış noktası seçin.");
      return;
    }

    // User-defined intermediate stops
    const userWaypoints: google.maps.DirectionsWaypoint[] = waypoints
      .filter((p): p is google.maps.places.PlaceResult => p?.geometry?.location != null)
      .map((p) => ({ location: p.geometry!.location!, stopover: true }));

    // North Marmara bypass via waypoint (non-stopover)
    const bypassWaypoints: google.maps.DirectionsWaypoint[] = [];
    if (avoidNorthMarmara && !avoidHighways) {
      const oLng = origin.lng(), dLng = destination.lng();
      if ((oLng < 29.05 && dLng > 29.05) || (dLng < 29.05 && oLng > 29.05)) {
        bypassWaypoints.push({
          location: new google.maps.LatLng(41.046, 29.034),
          stopover: false,
        });
      }
    }

    const allWaypoints = [...userWaypoints, ...bypassWaypoints];
    const hasWaypoints = allWaypoints.length > 0;

    setLoading(true);
    try {
      const service = new routesLib.DirectionsService();
      const result = await service.route({
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: !hasWaypoints,
        avoidHighways,
        avoidTolls,
        ...(hasWaypoints ? { waypoints: allWaypoints, optimizeWaypoints: false } : {}),
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
    setAvoidNorthMarmara(false);
    setWaypoints([]);
    setOriginEmpty(true);
    setDestEmpty(true);
    onClear();
  };

  const panelBg = "rgba(10,16,30,0.96)";
  const inputBg = "rgba(255,255,255,0.05)";
  const borderStyle = "1px solid rgba(255,255,255,0.08)";

  return (
    <div
      className="absolute top-4 left-4 right-4 z-20 max-w-md mx-auto md:right-auto md:w-96 md:mx-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        className="rounded-2xl shadow-2xl"
        style={{ background: panelBg, border: borderStyle, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      >
        {/* Header */}
        <button
          className="w-full flex items-center justify-between px-4 py-3.5"
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
        >
          <div className="flex items-center gap-2.5">
            <AppLogo size={28} />
            <span className="text-white font-semibold text-sm tracking-wide select-none">WH Navigasyon</span>
          </div>
          <div
            className="flex items-center justify-center rounded-full transition-transform duration-200"
            style={{ width: 28, height: 28, background: "rgba(255,255,255,0.06)", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4L6 8L10 4" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </button>

        {/* Form */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-2">
            {/* Origin */}
            <div style={{ position: "relative" }}>
              <div className="flex items-center gap-3 px-3 rounded-xl" style={{ background: inputBg, border: borderStyle, height: 48 }}>
                <div className="flex-shrink-0 rounded-full" style={{ width: 9, height: 9, background: "#22C55E" }} />
                <input
                  ref={originRef}
                  placeholder="Başlangıç noktası"
                  onChange={(e) => setOriginEmpty(e.target.value === "")}
                  onFocus={() => setOriginFocused(true)}
                  onBlur={() => setTimeout(() => setOriginFocused(false), 150)}
                  style={{ flex: 1, background: "transparent", color: "#F1F5F9", fontSize: 14, outline: "none", border: "none", minWidth: 0 }}
                  className="placeholder-slate-500"
                />
                <button onClick={() => useMyLocation("origin")} disabled={locating !== null} className="flex-shrink-0 text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors">
                  <GpsIcon spinning={locating === "origin"} />
                </button>
              </div>
              {originFocused && originEmpty && (
                <RecentDropdown items={recentPlaces} onSelect={(p) => selectRecent(p, "origin")} />
              )}
            </div>

            {/* Swap */}
            <div className="flex items-center my-0.5 relative" style={{ height: 24 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)", marginLeft: 16 }} />
              <button
                onClick={handleSwap}
                title="Başlangıç ve varışı değiştir"
                className="flex items-center justify-center rounded-full text-slate-400 hover:text-white transition-colors flex-shrink-0"
                style={{ width: 28, height: 28, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", margin: "0 8px" }}
              >
                <SwapIcon />
              </button>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)", marginRight: 16 }} />
            </div>

            {/* Waypoints */}
            {waypoints.map((_, i) => (
              <WaypointInput
                key={i}
                index={i}
                placesLib={placesLib}
                biasPos={biasPos}
                onPlaceChange={(place) => updateWaypoint(i, place)}
                onRemove={() => removeWaypoint(i)}
              />
            ))}

            {/* Destination */}
            <div style={{ position: "relative" }}>
              <div className="flex items-center gap-3 px-3 rounded-xl" style={{ background: inputBg, border: borderStyle, height: 48 }}>
                <div className="flex-shrink-0 rounded-full" style={{ width: 9, height: 9, background: "#EF4444" }} />
                <input
                  ref={destRef}
                  placeholder="Varış noktası"
                  onChange={(e) => setDestEmpty(e.target.value === "")}
                  onFocus={() => setDestFocused(true)}
                  onBlur={() => setTimeout(() => setDestFocused(false), 150)}
                  style={{ flex: 1, background: "transparent", color: "#F1F5F9", fontSize: 14, outline: "none", border: "none", minWidth: 0 }}
                  className="placeholder-slate-500"
                />
                <button onClick={() => useMyLocation("dest")} disabled={locating !== null} className="flex-shrink-0 text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors">
                  <GpsIcon spinning={locating === "dest"} />
                </button>
              </div>
              {destFocused && destEmpty && (
                <RecentDropdown items={recentPlaces} onSelect={(p) => selectRecent(p, "dest")} />
              )}
            </div>

            {/* Add waypoint button */}
            {waypoints.length < 3 && (
              <button
                onClick={addWaypoint}
                className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                style={{ paddingLeft: 4 }}
              >
                <div className="flex items-center justify-center rounded-full" style={{ width: 20, height: 20, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                Ara durak ekle
              </button>
            )}

            {/* Route options */}
            <div className="flex items-center gap-2 pt-0.5 flex-wrap">
              <ToggleChip active={avoidHighways} onClick={() => setAvoidHighways((v) => !v)} label="Otoyol kaçın" />
              <ToggleChip active={avoidTolls} onClick={() => setAvoidTolls((v) => !v)} label="Ücretli kaçın" />
              <ToggleChip active={avoidNorthMarmara} onClick={() => setAvoidNorthMarmara((v) => !v)} label="K. Marmara kaçın (beta)" />
            </div>

            {error && <p className="text-red-400 text-xs px-1">{error}</p>}

            <div className="flex gap-2 pt-0.5">
              <button
                onClick={handleRoute}
                disabled={loading}
                className="flex-1 text-white font-semibold text-sm rounded-xl transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ height: 46, background: loading ? "#2563EB" : "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 16px rgba(59,130,246,0.3)" }}
              >
                {loading ? (
                  <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Hesaplanıyor…</span></>
                ) : (
                  <><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 12L21 12M21 12L14 5M21 12L14 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg><span>Rota Bul</span></>
                )}
              </button>
              {hasRoute && (
                <button onClick={handleClear} className="px-4 text-slate-300 hover:text-white text-sm rounded-xl font-medium transition-colors" style={{ height: 46, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}>
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
