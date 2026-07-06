"use client";
import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useMap, useMapsLibrary, AdvancedMarker } from "@vis.gl/react-google-maps";
import type { RadarPoint, RadarType } from "@/app/api/radars/route";
import { haversineDistance } from "@/lib/geo";

const RADAR_ZOOM_MIN = 10;
const MAX_VISIBLE = 100;
const NAV_ZOOM = 17;

interface Props {
  radars: RadarPoint[];
  userPos: { lat: number; lng: number } | null;
  directionsResult: google.maps.DirectionsResult | null;
  selectedRouteIndex: number;
  navigating: boolean;
}

const TYPE_STYLE: Record<
  RadarType,
  { bg: string; border: string; label: string; emoji: string }
> = {
  speed:      { bg: "#dc2626", border: "#fca5a5", label: "H",  emoji: "📷" },
  redlight:   { bg: "#d97706", border: "#fcd34d", label: "I",  emoji: "🚦" },
  mobile:     { bg: "#ca8a04", border: "#fde047", label: "M",  emoji: "📡" },
  corridor:   { bg: "#7c3aed", border: "#c4b5fd", label: "K",  emoji: "🛣" },
  checkpoint: { bg: "#0369a1", border: "#7dd3fc", label: "D",  emoji: "🚔" },
};

function RadarMarker({ radar }: { radar: RadarPoint }) {
  const style = TYPE_STYLE[radar.type];
  return (
    <div className="relative flex flex-col items-center">
      <div
        style={{
          width: 26, height: 26,
          background: style.bg,
          border: `2px solid ${style.border}`,
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
        }}
      >
        <span style={{ fontSize: 11, color: "#fff", fontWeight: 700, lineHeight: 1 }}>
          {style.label}
        </span>
      </div>
      {radar.maxspeed && (
        <div style={{
          marginTop: 2, background: style.bg, color: "#fff",
          fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3, whiteSpace: "nowrap",
        }}>
          {radar.maxspeed}
        </div>
      )}
    </div>
  );
}

// Location/center icon — Google Maps style
function LocationIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Crosshair lines */}
      <line x1="12" y1="2"  x2="12" y2="5"  stroke={active ? "#3B82F6" : "white"} strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="19" x2="12" y2="22" stroke={active ? "#3B82F6" : "white"} strokeWidth="2" strokeLinecap="round"/>
      <line x1="2"  y1="12" x2="5"  y2="12" stroke={active ? "#3B82F6" : "white"} strokeWidth="2" strokeLinecap="round"/>
      <line x1="19" y1="12" x2="22" y2="12" stroke={active ? "#3B82F6" : "white"} strokeWidth="2" strokeLinecap="round"/>
      {/* Outer circle */}
      <circle cx="12" cy="12" r="7" stroke={active ? "#3B82F6" : "white"} strokeWidth="1.5" fill="none"/>
      {/* Inner dot */}
      <circle cx="12" cy="12" r="2.5" fill={active ? "#3B82F6" : "white"}/>
    </svg>
  );
}

export default function MapContent({
  radars,
  userPos,
  directionsResult,
  selectedRouteIndex,
  navigating,
}: Props) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const traveledPolyRef = useRef<google.maps.Polyline | null>(null);

  // autoFollow: map follows user during nav; disabled when user manually drags
  const [autoFollow, setAutoFollow] = useState(true);

  const [zoom, setZoom] = useState(6);
  const [bounds, setBounds] = useState<google.maps.LatLngBounds | null>(null);

  // Zoom + bounds tracking
  useEffect(() => {
    if (!map) return;
    const listeners = [
      map.addListener("zoom_changed", () => setZoom(map.getZoom() ?? 6)),
      map.addListener("bounds_changed", () => setBounds(map.getBounds() ?? null)),
    ];
    setZoom(map.getZoom() ?? 6);
    setBounds(map.getBounds() ?? null);
    return () => listeners.forEach((l) => l.remove());
  }, [map]);

  // Detect manual drag → pause auto-follow
  useEffect(() => {
    if (!map) return;
    const l = map.addListener("dragstart", () => setAutoFollow(false));
    return () => l.remove();
  }, [map]);

  // Re-enable auto-follow when navigation starts or route changes
  useEffect(() => {
    setAutoFollow(true);
  }, [navigating, directionsResult]);

  // Center button handler
  const handleCenter = useCallback(() => {
    if (!map || !userPos) return;
    setAutoFollow(true);
    map.panTo(userPos);
    map.setZoom(navigating ? NAV_ZOOM : 15);
  }, [map, userPos, navigating]);

  // DirectionsRenderer — recreate on route change
  useEffect(() => {
    if (!routesLib || !map) return;

    rendererRef.current?.setMap(null);
    rendererRef.current = null;

    if (!directionsResult) return;

    const renderer = new routesLib.DirectionsRenderer({
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: "#3B82F6",
        strokeWeight: 6,
        strokeOpacity: 0.85,
      },
    });
    renderer.setMap(map);
    renderer.setDirections(directionsResult);
    renderer.setRouteIndex(selectedRouteIndex);
    rendererRef.current = renderer;

    return () => {
      renderer.setMap(null);
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directionsResult, routesLib, map]);

  useEffect(() => {
    rendererRef.current?.setRouteIndex(selectedRouteIndex);
  }, [selectedRouteIndex]);

  // Gray "traveled" polyline — create when nav starts, destroy when nav stops
  useEffect(() => {
    if (!map) return;

    traveledPolyRef.current?.setMap(null);
    traveledPolyRef.current = null;

    if (!navigating || !directionsResult) return;

    traveledPolyRef.current = new google.maps.Polyline({
      path: [],
      strokeColor: "#6B7280",
      strokeWeight: 7,
      strokeOpacity: 0.8,
      zIndex: 2,
      map,
    });

    return () => {
      traveledPolyRef.current?.setMap(null);
      traveledPolyRef.current = null;
    };
  }, [navigating, directionsResult, map]);

  // Update gray polyline as user moves
  useEffect(() => {
    const poly = traveledPolyRef.current;
    if (!navigating || !userPos || !directionsResult || !poly) return;

    const path = directionsResult.routes[selectedRouteIndex]?.overview_path ?? [];
    if (path.length === 0) return;

    let nearestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = haversineDistance(userPos, { lat: path[i].lat(), lng: path[i].lng() });
      if (d < minDist) { minDist = d; nearestIdx = i; }
    }

    poly.setPath(path.slice(0, nearestIdx + 1));
  }, [userPos, navigating, directionsResult, selectedRouteIndex]);

  // Zoom in when navigation starts
  useEffect(() => {
    if (!map || !navigating) return;
    map.setZoom(NAV_ZOOM);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigating]);

  // Auto-follow: pan to user on each GPS update (if auto-follow is on)
  useEffect(() => {
    if (!map || !userPos || !navigating || !autoFollow) return;
    map.panTo(userPos);
  }, [map, userPos, navigating, autoFollow]);

  const visibleRadars = useMemo(() => {
    if (zoom < RADAR_ZOOM_MIN || !bounds) return [];
    return radars
      .filter((r) => bounds.contains({ lat: r.lat, lng: r.lng }))
      .slice(0, MAX_VISIBLE);
  }, [radars, zoom, bounds]);

  // Bottom offset for center button: stays above stop-nav button during nav
  const btnBottom = navigating
    ? "calc(max(1rem, env(safe-area-inset-bottom)) + 4.5rem)"
    : "max(1.5rem, env(safe-area-inset-bottom))";

  return (
    <>
      {/* ── Radar markers ── */}
      {visibleRadars.map((radar) => (
        <AdvancedMarker
          key={radar.id}
          position={{ lat: radar.lat, lng: radar.lng }}
          title={
            `${TYPE_STYLE[radar.type].emoji} ` +
            (radar.name ? `${radar.name} · ` : "") +
            (radar.maxspeed ? `${radar.maxspeed} km/h` : radar.type)
          }
        >
          <RadarMarker radar={radar} />
        </AdvancedMarker>
      ))}

      {/* ── User position dot ── */}
      {userPos && (
        <AdvancedMarker position={userPos} title="Konumunuz">
          <div style={{ position: "relative", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div
              className="animate-ping"
              style={{
                position: "absolute",
                width: 24, height: 24,
                borderRadius: "50%",
                background: "rgba(59,130,246,0.4)",
              }}
            />
            <div style={{
              width: 14, height: 14,
              borderRadius: "50%",
              background: "#3B82F6",
              border: "2px solid white",
              boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
              position: "relative",
            }} />
          </div>
        </AdvancedMarker>
      )}

      {/* ── Center / locate button ── */}
      {userPos && (
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: btnBottom,
            zIndex: 20,
          }}
        >
          <button
            onClick={handleCenter}
            title={autoFollow && navigating ? "Takip ediliyor" : "Konumuma git"}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(17,24,39,0.96)",
              border: autoFollow && navigating
                ? "1.5px solid #3B82F6"
                : "1.5px solid rgba(75,85,99,0.6)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "border-color 0.2s",
            }}
          >
            <LocationIcon active={autoFollow && navigating} />
          </button>
        </div>
      )}
    </>
  );
}
