"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Map, useMapsLibrary } from "@vis.gl/react-google-maps";
import MapContent from "./MapContent";
import SearchPanel from "./SearchPanel";
import RoutePanel from "./RoutePanel";
import RadarAlert from "./RadarAlert";
import NavigationBar from "./NavigationBar";
import SpeedDisplay from "./SpeedDisplay";
import {
  haversineDistance,
  distanceToPath,
  isRadarAhead,
  calcRemainingDistance,
  calcRemainingTime,
} from "@/lib/geo";
import type { RadarPoint } from "@/app/api/radars/route";

interface RouteInfo {
  summary: string;
  duration: string;
  distance: string;
}

// Off-route threshold: more than this meters from the route polyline → reroute
const OFF_ROUTE_THRESHOLD = 60;
// Minimum seconds between automatic reroutes
const REROUTE_COOLDOWN = 15;

export default function NavigationApp() {
  const routesLib = useMapsLibrary("routes");
  useMapsLibrary("places");
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
  const [steps, setSteps] = useState<google.maps.DirectionsStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distToNextStep, setDistToNextStep] = useState(0);
  const [searchKey, setSearchKey] = useState(0);

  // Speed & heading from GPS
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);

  // Rerouting state
  const [rerouting, setRerouting] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const alertCooldownRef = useRef<number>(0);
  const rerouteTimeRef = useRef<number>(0);
  // Cached flat path of current route for off-route checks
  const routePathRef = useRef<{ lat: number; lng: number }[]>([]);
  // Destination kept for rerouting
  const destRef = useRef<google.maps.LatLng | null>(null);

  // Fetch radar data once
  useEffect(() => {
    fetch("/api/radars")
      .then((r) => r.json())
      .then((data: RadarPoint[]) => {
        setRadars(data);
        setRadarsLoaded(true);
      })
      .catch(() => setRadarsLoaded(true));
  }, []);

  // Update route path cache when route changes
  useEffect(() => {
    if (!directionsResult) {
      routePathRef.current = [];
      setSteps([]);
      setCurrentStepIndex(0);
      return;
    }
    const route = directionsResult.routes[selectedRouteIndex];
    routePathRef.current = (route?.overview_path ?? []).map((p) => ({
      lat: p.lat(),
      lng: p.lng(),
    }));
    const newSteps = route?.legs[0]?.steps ?? [];
    setSteps(newSteps);
    setCurrentStepIndex(0);
  }, [directionsResult, selectedRouteIndex]);

  // GPS position update handler
  const handlePosition = useCallback(
    (pos: GeolocationPosition) => {
      const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserPos(newPos);

      // Speed in km/h (coords.speed is m/s, null when unknown)
      const speedMs = pos.coords.speed;
      setCurrentSpeed(speedMs != null && speedMs >= 0 ? speedMs * 3.6 : null);

      // Heading (degrees from north, null when stationary/unknown)
      const heading = pos.coords.heading;
      setUserHeading(heading != null && !isNaN(heading) ? heading : null);
    },
    []
  );

  // Run position-dependent logic when userPos changes
  useEffect(() => {
    if (!userPos) return;

    // ── Radar proximity alert ──────────────────────────────────────────────
    if (radars.length > 0) {
      let closest: { radar: RadarPoint; distance: number } | null = null;
      for (const radar of radars) {
        const dist = haversineDistance(userPos, radar);
        if (dist > 500) continue;

        // Direction filter: skip if radar has direction and user is not heading toward it
        if (radar.direction != null && userHeading != null) {
          if (!isRadarAhead(userHeading, radar.direction)) continue;
        }

        if (!closest || dist < closest.distance) {
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

    // ── Step advancement ───────────────────────────────────────────────────
    if (navigating && steps.length > 0) {
      const step = steps[currentStepIndex];
      if (step) {
        const endLoc = step.end_location;
        const dist = haversineDistance(userPos, { lat: endLoc.lat(), lng: endLoc.lng() });
        setDistToNextStep(dist);
        if (dist < 25 && currentStepIndex < steps.length - 1) {
          setCurrentStepIndex((i) => i + 1);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos]);

  // Off-route detection — separate effect so it can access rerouting helpers
  useEffect(() => {
    if (!navigating || !userPos || routePathRef.current.length === 0) return;
    if (rerouting) return;
    if (!destRef.current || !routesLib) return;

    const sinceLastReroute = (Date.now() - rerouteTimeRef.current) / 1000;
    if (sinceLastReroute < REROUTE_COOLDOWN) return;

    const distToRoute = distanceToPath(userPos, routePathRef.current);
    if (distToRoute <= OFF_ROUTE_THRESHOLD) return;

    // User is off-route — recalculate from current position
    setRerouting(true);
    const origin = new google.maps.LatLng(userPos.lat, userPos.lng);
    const destination = destRef.current;

    const service = new routesLib.DirectionsService();
    service
      .route({
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
        region: "tr",
        language: "tr",
      })
      .then((result) => {
        handleRouteFound(result);
        rerouteTimeRef.current = Date.now();
      })
      .catch((e) => console.warn("Reroute failed:", e))
      .finally(() => setRerouting(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos, navigating, rerouting, routesLib]);

  const startNavigation = useCallback(() => {
    setNavigating(true);
    setCurrentStepIndex(0);
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => console.error("Konum alınamadı:", err),
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 10000 }
    );
  }, [handlePosition]);

  const stopNavigation = useCallback(() => {
    setNavigating(false);
    setNearbyRadar(null);
    setCurrentStepIndex(0);
    setCurrentSpeed(null);
    setUserHeading(null);
    setRerouting(false);
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

  // Called by SearchPanel with the destination LatLng so we can reroute later
  const handleRouteFoundWithDest = useCallback(
    (result: google.maps.DirectionsResult, destination: google.maps.LatLng) => {
      destRef.current = destination;
      handleRouteFound(result);
    },
    [handleRouteFound]
  );

  const handleClear = useCallback(() => {
    setDirectionsResult(null);
    setRoutes([]);
    setSelectedRouteIndex(0);
    setSteps([]);
    setCurrentStepIndex(0);
    setSearchKey((k) => k + 1);
    destRef.current = null;
    routePathRef.current = [];
    stopNavigation();
  }, [stopNavigation]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const currentStep = steps[currentStepIndex] ?? null;

  const remainingDistance = currentStep
    ? calcRemainingDistance(steps, currentStepIndex, distToNextStep)
    : 0;
  const remainingSeconds = currentStep
    ? calcRemainingTime(steps, currentStepIndex, distToNextStep)
    : 0;

  // Speed limit from the closest approaching radar (type=speed or corridor)
  const nearbySpeedLimit = nearbyRadar?.radar.maxspeed;

  return (
    <div className="relative w-full bg-gray-950" style={{ height: "100dvh" }}>
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

      {/* Navigation top bar */}
      {navigating && currentStep && (
        <NavigationBar
          step={currentStep}
          distanceToNext={distToNextStep}
          stepIndex={currentStepIndex}
          totalSteps={steps.length}
          remainingDistance={remainingDistance}
          remainingSeconds={remainingSeconds}
        />
      )}

      {/* Speedometer (shown during navigation) */}
      {navigating && (
        <SpeedDisplay speedKmh={currentSpeed} speedLimit={nearbySpeedLimit} />
      )}

      {/* Rerouting indicator */}
      {rerouting && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-2xl px-6 py-4 flex items-center gap-3 shadow-2xl">
          <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-white text-sm font-semibold">Rota yeniden hesaplanıyor…</span>
        </div>
      )}

      {/* Zoom hint */}
      {radarsLoaded && mapZoom < 10 && !navigating && routes.length === 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-20 bg-gray-900/90 backdrop-blur-sm text-gray-300 text-xs px-4 py-2 rounded-full border border-gray-700/50 whitespace-nowrap"
          style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          📷 Radar noktalarını görmek için yakınlaştır
        </div>
      )}

      {/* Radar legend + count */}
      {radarsLoaded && mapZoom >= 10 && routes.length === 0 && (
        <div
          className="absolute right-4 z-20 bg-gray-900/90 backdrop-blur-sm text-gray-400 text-xs px-3 py-1.5 rounded-full border border-gray-700/50"
          style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          📷 {radars.length} nokta
        </div>
      )}

      {/* Search panel */}
      {!navigating && (
        <SearchPanel
          key={searchKey}
          onRouteFound={handleRouteFoundWithDest}
          onClear={handleClear}
          hasRoute={routes.length > 0}
        />
      )}

      {/* Route selection panel */}
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

      {/* Stop navigation button */}
      {navigating && (
        <div
          className="absolute left-4 right-4 z-20 max-w-md mx-auto md:right-auto md:w-96 md:mx-0"
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

      {/* Radar alert */}
      {nearbyRadar && (
        <RadarAlert
          distance={nearbyRadar.distance}
          maxspeed={nearbyRadar.radar.maxspeed}
          type={nearbyRadar.radar.type}
        />
      )}
    </div>
  );
}
