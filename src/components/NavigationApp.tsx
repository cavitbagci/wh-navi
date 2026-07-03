"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Map, useMapsLibrary } from "@vis.gl/react-google-maps";
import MapContent from "./MapContent";
import SearchPanel from "./SearchPanel";
import RoutePanel from "./RoutePanel";
import RadarAlert from "./RadarAlert";
import NavigationBar from "./NavigationBar";
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
  // Adım adım navigasyon
  const [steps, setSteps] = useState<google.maps.DirectionsStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distToNextStep, setDistToNextStep] = useState(0);
  // SearchPanel'i sıfırlamak için key
  const [searchKey, setSearchKey] = useState(0);

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

  // Rota değişince adımları güncelle
  useEffect(() => {
    if (!directionsResult) {
      setSteps([]);
      setCurrentStepIndex(0);
      return;
    }
    const newSteps = directionsResult.routes[selectedRouteIndex]?.legs[0]?.steps ?? [];
    setSteps(newSteps);
    setCurrentStepIndex(0);
  }, [directionsResult, selectedRouteIndex]);

  // Kullanıcı konumu değişince adım ilerlet + radar kontrol
  useEffect(() => {
    if (!userPos) return;

    // Radar kontrolü
    if (navigating && radars.length > 0) {
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
    }

    // Adım ilerletme
    if (!navigating || steps.length === 0) return;
    const step = steps[currentStepIndex];
    if (!step) return;
    const endLoc = step.end_location;
    const dist = haversineDistance(userPos, { lat: endLoc.lat(), lng: endLoc.lng() });
    setDistToNextStep(dist);
    if (dist < 25 && currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((i) => i + 1);
    }
  }, [userPos, navigating, radars, steps, currentStepIndex]);

  const startNavigation = useCallback(() => {
    setNavigating(true);
    setCurrentStepIndex(0);
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.error("Konum alınamadı:", err),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }, []);

  const stopNavigation = useCallback(() => {
    setNavigating(false);
    setNearbyRadar(null);
    setCurrentStepIndex(0);
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
    setSteps([]);
    setCurrentStepIndex(0);
    setSearchKey((k) => k + 1); // SearchPanel'i sıfırla
    stopNavigation();
  }, [stopNavigation]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const currentStep = steps[currentStepIndex] ?? null;

  return (
    <div className="relative w-full bg-gray-950" style={{ height: "100dvh" }}>
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
        clickableIcons={false}
      >
        <MapContent
          radars={radars}
          userPos={userPos}
          directionsResult={directionsResult}
          selectedRouteIndex={selectedRouteIndex}
          navigating={navigating}
        />
      </Map>

      {/* Navigasyon talimat çubuğu */}
      {navigating && currentStep && (
        <NavigationBar
          step={currentStep}
          distanceToNext={distToNextStep}
          stepIndex={currentStepIndex}
          totalSteps={steps.length}
        />
      )}

      {/* Zoom ipucu */}
      {radarsLoaded && mapZoom < 10 && !navigating && routes.length === 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-20 bg-gray-900/90 backdrop-blur-sm text-gray-300 text-xs px-4 py-2 rounded-full border border-gray-700/50 whitespace-nowrap"
          style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          📷 Radar noktalarını görmek için yakınlaştır
        </div>
      )}

      {/* Radar sayısı */}
      {radarsLoaded && mapZoom >= 10 && routes.length === 0 && (
        <div
          className="absolute right-4 z-20 bg-gray-900/90 backdrop-blur-sm text-gray-400 text-xs px-3 py-1.5 rounded-full border border-gray-700/50"
          style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          📷 {radars.length} nokta
        </div>
      )}

      {/* Arama paneli — key ile sıfırlanır */}
      {!navigating && (
        <SearchPanel
          key={searchKey}
          onRouteFound={handleRouteFound}
          onClear={handleClear}
          hasRoute={routes.length > 0}
        />
      )}

      {/* Rota paneli */}
      {routes.length > 0 && !navigating && (
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

      {/* Navigasyon durdur butonu */}
      {navigating && (
        <div
          className="absolute left-4 right-4 z-20 max-w-md mx-auto"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={stopNavigation}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-2xl shadow-2xl transition-colors flex items-center justify-center gap-2"
          >
            <span>■</span>
            <span>Navigasyonu Durdur</span>
          </button>
        </div>
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
