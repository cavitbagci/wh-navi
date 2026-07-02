"use client";
import { useEffect, useRef } from "react";
import { useMap, useMapsLibrary, AdvancedMarker } from "@vis.gl/react-google-maps";
import type { RadarPoint } from "@/app/api/radars/route";

interface Props {
  radars: RadarPoint[];
  userPos: { lat: number; lng: number } | null;
  directionsResult: google.maps.DirectionsResult | null;
  selectedRouteIndex: number;
  navigating: boolean;
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

  useEffect(() => {
    if (!routesLib || !map) return;
    const renderer = new routesLib.DirectionsRenderer({
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: "#4285F4",
        strokeWeight: 6,
        strokeOpacity: 0.9,
      },
    });
    renderer.setMap(map);
    rendererRef.current = renderer;
    return () => {
      renderer.setMap(null);
      rendererRef.current = null;
    };
  }, [routesLib, map]);

  useEffect(() => {
    if (!rendererRef.current || !directionsResult) return;
    rendererRef.current.setDirections(directionsResult);
    rendererRef.current.setRouteIndex(selectedRouteIndex);
  }, [directionsResult, selectedRouteIndex]);

  useEffect(() => {
    if (!map || !userPos || !navigating) return;
    map.panTo(userPos);
  }, [map, userPos, navigating]);

  return (
    <>
      {radars.map((radar) => (
        <AdvancedMarker
          key={radar.id}
          position={{ lat: radar.lat, lng: radar.lng }}
          title={radar.maxspeed ? `${radar.maxspeed} km/h` : "Radar"}
        >
          <div className="relative flex items-center justify-center">
            <div className="w-7 h-7 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
              <span className="text-white text-xs leading-none">📷</span>
            </div>
            {radar.maxspeed && (
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[9px] font-bold px-1 rounded whitespace-nowrap">
                {radar.maxspeed}
              </div>
            )}
          </div>
        </AdvancedMarker>
      ))}

      {userPos && (
        <AdvancedMarker position={userPos} title="Konumunuz">
          <div className="relative">
            <div className="w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-xl" />
            <div className="absolute inset-0 w-5 h-5 bg-blue-400 rounded-full animate-ping opacity-60" />
          </div>
        </AdvancedMarker>
      )}
    </>
  );
}
