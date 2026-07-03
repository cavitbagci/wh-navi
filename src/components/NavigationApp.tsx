"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Map, useMapsLibrary } from "@vis.gl/react-google-maps";
import MapContent from "./MapContent";
import SearchPanel from "./SearchPanel";
import RoutePanel from "./RoutePanel";
import RadarAlert from "./RadarAlert";
import { haversineDistance } from "@/lib/geo";
import type { RadarPoint } from "@/app/api/radars/route";

interface RouteInfo {
  summary: string;
  duration: string;
  distance: string;
}


export default function NavigationApp() {
  useMapsLibrary("places");
  useMapsLibrary("routes");
  useMapsLibrary("geocoding");

  const [radars, setRadars] = useState<RadarPoint[]>([]);
  const [radarsLoaded, setRadarsLoaded] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [nearbyRadar, setNearbyRadar] = useState<{ radar: RadarPoint; distance: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(6);
  const watchIdRef = useRef<number | null>(null);
  const alertCooldownRef = useRef<number>(0);

  // Radar verisini yükle
  useEffect(() => {
    fetch("/api/radars")
      .then((r) => r.json())
      .then((data: RadarPoint[]) => {
        setRadars(data);
        setRadarsLoaded(true);
      })
      .catch(() => setRadarsLoaded(true));
  }, []);

  // Yakın radar kontrolü
  useEffect(() => {
    if (!userPos || !navigating || radars.length === 0) {
      setNearbyRadar(null);
      return;
    }
    let closest: { radar: RadarPoint; distance: number } | null = null;
    for (const radar of radars) {
      const dist = haversineDistance(userPos, radar);
      if (dist < 500 && (!closest || dist < closest.distance)) {
        closest = { radar, distance: dist };
      }
    }
    if (closest && Date.now() - alertCooldownRef.current > 5000) {
      setNearbyRadar(closest);
      alertCooldownRef.current = Date.now();
    } else if (!closest) {
      setNearbyRadar(null);
    }
  }, [userPos, radars, navigating]);

  const startNavigation = useCallback(() => {
    setNavigating(true);
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) =>
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.error("Konum alınamadı:", err),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }, []);

  const stopNavigation = useCallback(() => {
    setNavigating(false);
    setNearbyRadar(null);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const handleRouteFound = useCallback((result: google.maps.DirectionsResult) => {
    setDirectionsResult(result);
    setSelectedRouteIndex(0);
    setRoutes(
      result.routes.map((r) => ({
        summary: r.summary,
        duration: r.legs[0]?.duration?.text ?? "",
        distance: r.legs[0]?.distance?.text ?? "",
      }))
    );
  }, []);

  const handleClear = useCallback(() => {
    setDirectionsResult(null);
    setRoutes([]);
    setSelectedRouteIndex(0);
    stopNavigation();
  }, [stopNavigation]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-gray-950">
      {/* Harita */}
      <Map
        defaultCenter={{ lat: 39.0, lng: 35.0 }}
        defaultZoom={6}
        mapId="DEMO_MAP_ID"
        onZoomChanged={(e) => setMapZoom(e.detail.zoom)}
        gestureHandling="greedy"
        disableDefaultUI={false}
        colorScheme="DARK"
        className="w-full h-full"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
      >
        <MapContent
          radars={radars}
          userPos={userPos}
          directionsResult={directionsResult}
          selectedRouteIndex={selectedRouteIndex}
          navigating={navigating}
        />
      </Map>

      {/* Zoom ipucu */}
      {radarsLoaded && mapZoom < 10 && !navigating && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-gray-900/90 backdrop-blur-sm text-gray-300 text-xs px-4 py-2 rounded-full border border-gray-700/50 whitespace-nowrap">
          📷 Radar noktalarını görmek için yakınlaştır
        </div>
      )}

      {/* Radar sayısı */}
      {radarsLoaded && mapZoom >= 10 && (
        <div className="absolute bottom-6 right-4 z-20 bg-gray-900/90 backdrop-blur-sm text-gray-400 text-xs px-3 py-1.5 rounded-full border border-gray-700/50">
          📷 {radars.length} nokta
        </div>
      )}

      {/* Arama paneli */}
      <SearchPanel
        onRouteFound={handleRouteFound}
        onClear={handleClear}
        hasRoute={routes.length > 0}
      />

      {/* Rota paneli */}
      {routes.length > 0 && (
        <RoutePanel
          routes={routes}
          selectedIndex={selectedRouteIndex}
          onSelect={setSelectedRouteIndex}
          navigating={navigating}
          onStartNavigation={startNavigation}
          onStopNavigation={stopNavigation}
          onCancel={handleClear}
        />
      )}

      {/* Radar uyarısı */}
      {nearbyRadar && (
        <RadarAlert
          distance={nearbyRadar.distance}
          maxspeed={nearbyRadar.radar.maxspeed}
        />
      )}
    </div>
  );
}
