"use client";
import { useEffect, useRef, useMemo, useState } from "react";
import { useMap, useMapsLibrary, AdvancedMarker } from "@vis.gl/react-google-maps";
import type { RadarPoint, RadarType } from "@/app/api/radars/route";

const RADAR_ZOOM_MIN = 10;
const MAX_VISIBLE = 100;

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
          width: 26,
          height: 26,
          background: style.bg,
          border: `2px solid ${style.border}`,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
        }}
      >
        <span style={{ fontSize: 11, color: "#fff", fontWeight: 700, lineHeight: 1 }}>
          {style.label}
        </span>
      </div>
      {radar.maxspeed && (
        <div
          style={{
            marginTop: 2,
            background: style.bg,
            color: "#fff",
            fontSize: 8,
            fontWeight: 700,
            padding: "1px 4px",
            borderRadius: 3,
            whiteSpace: "nowrap",
          }}
        >
          {radar.maxspeed}
        </div>
      )}
    </div>
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
  const [zoom, setZoom] = useState(6);
  const [bounds, setBounds] = useState<google.maps.LatLngBounds | null>(null);

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

  const visibleRadars = useMemo(() => {
    if (zoom < RADAR_ZOOM_MIN || !bounds) return [];
    return radars
      .filter((r) => bounds.contains({ lat: r.lat, lng: r.lng }))
      .slice(0, MAX_VISIBLE);
  }, [radars, zoom, bounds]);

  // Recreate renderer when directionsResult changes
  useEffect(() => {
    if (!routesLib || !map) return;

    if (rendererRef.current) {
      rendererRef.current.setMap(null);
      rendererRef.current = null;
    }

    if (!directionsResult) return;

    const renderer = new routesLib.DirectionsRenderer({
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: "#4285F4",
        strokeWeight: 6,
        strokeOpacity: 0.9,
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
  // selectedRouteIndex intentionally excluded — handled by separate effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directionsResult, routesLib, map]);

  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.setRouteIndex(selectedRouteIndex);
  }, [selectedRouteIndex]);

  useEffect(() => {
    if (!map || !userPos || !navigating) return;
    map.panTo(userPos);
  }, [map, userPos, navigating]);

  return (
    <>
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

      {userPos && (
        <AdvancedMarker position={userPos} title="Konumunuz">
          <div className="relative w-5 h-5">
            <div className="w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-xl" />
            <div className="absolute inset-0 w-5 h-5 bg-blue-400 rounded-full animate-ping opacity-60" />
          </div>
        </AdvancedMarker>
      )}
    </>
  );
}
