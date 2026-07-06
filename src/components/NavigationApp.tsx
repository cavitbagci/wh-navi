"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Map, useMapsLibrary } from "@vis.gl/react-google-maps";
import MapContent from "./MapContent";
import SearchPanel from "./SearchPanel";
import RoutePanel from "./RoutePanel";
import RadarAlert from "./RadarAlert";
import NavigationBar from "./NavigationBar";
import SpeedDisplay from "./SpeedDisplay";
import DisclaimerModal from "./DisclaimerModal";
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

const OFF_ROUTE_THRESHOLD = 30;   // metres from route polyline before rerouting
const REROUTE_COOLDOWN = 15;       // seconds between auto-reroutes
const MAX_REROUTES_PER_SESSION = 10; // hard cap — stops runaway API calls if GPS goes haywire

// Bounding-box half-widths for radar proximity pre-filter (~500 m)
// Cheap absolute-value check eliminates ~99% of radars before haversine runs
const RADAR_LAT_BOX = 0.0045; // 500 m in latitude  (1° ≈ 111 km)
const RADAR_LNG_BOX = 0.0060; // 500 m in longitude at ~39°N (cos 39° ≈ 0.78)

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
  const [rerouteLimitHit, setRerouteLimitHit] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const alertCooldownRef = useRef<number>(0);
  const rerouteTimeRef = useRef<number>(0);
  const rerouteCountRef = useRef<number>(0);
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
    // Two-phase filter: cheap bbox check first, haversine only on candidates.
    // For 2000 radars this reduces haversine calls from ~2000 to ~0–5 per update.
    if (radars.length > 0) {
      let closest: { radar: RadarPoint; distance: number } | null = null;
      const { lat, lng } = userPos;
      for (const radar of radars) {
        // Phase 1: axis-aligned bounding box (just subtraction + comparison)
        if (Math.abs(radar.lat - lat) > RADAR_LAT_BOX) continue;
        if (Math.abs(radar.lng - lng) > RADAR_LNG_BOX) continue;

        // Phase 2: accurate haversine (only runs for ~0–5 nearby radars)
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

    // Hard cap — stop auto-rerouting to protect API quota
    if (rerouteCountRef.current >= MAX_REROUTES_PER_SESSION) {
      setRerouteLimitHit(true);
      return;
    }

    // User is off-route — recalculate from current position
    setRerouting(true);
    rerouteCountRef.current += 1;
    const origin = new google.maps.LatLng(userPos.lat, userPos.lng);
    const destination = destRef.current;

    const service = new routesLib.DirectionsService();
    service
      .route({
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        // No alternatives on reroute — we just need the single best route from here
        provideRouteAlternatives: false,
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
    setRerouteLimitHit(false);
    rerouteCountRef.current = 0;
    rerouteTimeRef.current = 0;
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
    setRerouteLimitHit(false);
    rerouteCountRef.current = 0;
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

      {/* First-visit disclaimer */}
      <DisclaimerModal />

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

      {/* Reroute limit banner */}
      {rerouteLimitHit && navigating && !rerouting && (
        <div
          className="absolute left-4 right-4 z-30 max-w-md mx-auto"
          style={{
            top: "calc(env(safe-area-inset-top) + 130px)",
          }}
        >
          <div
            className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{
              background: "rgba(120,53,15,0.97)",
              border: "1px solid rgba(252,211,77,0.3)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
              <path d="M12 9v4M12 17h.01" stroke="#FCD34D" strokeWidth="2" strokeLinecap="round"/>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="#FCD34D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="text-amber-200 text-xs font-medium flex-1">
              Otomatik rota güncelleme devre dışı. Durdurup yeniden başlatabilirsin.
            </p>
          </div>
        </div>
      )}

      {/* Rerouting indicator */}
      {rerouting && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 flex items-center gap-3 rounded-2xl px-6 py-4 shadow-2xl"
          style={{
            background: "rgba(10,16,30,0.97)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span className="text-white text-sm font-semibold whitespace-nowrap">Rota yeniden hesaplanıyor…</span>
        </div>
      )}

      {/* Zoom hint */}
      {radarsLoaded && mapZoom < 10 && !navigating && routes.length === 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-20 text-slate-400 text-xs px-4 py-2 rounded-full whitespace-nowrap"
          style={{
            bottom: "max(1.5rem, env(safe-area-inset-bottom))",
            background: "rgba(10,16,30,0.88)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          Radar noktalarını görmek için yakınlaştır
        </div>
      )}

      {/* Radar count */}
      {radarsLoaded && mapZoom >= 10 && routes.length === 0 && (
        <div
          className="absolute right-14 z-20 text-slate-500 text-xs px-3 py-1.5 rounded-full"
          style={{
            bottom: "max(1.5rem, env(safe-area-inset-bottom))",
            background: "rgba(10,16,30,0.85)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {radars.length} radar
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
            className="w-full text-white font-bold text-sm rounded-2xl shadow-2xl flex items-center justify-center gap-2.5 active:opacity-80 transition-opacity"
            style={{
              height: 52,
              background: "linear-gradient(135deg, #DC2626, #EF4444)",
              boxShadow: "0 4px 20px rgba(239,68,68,0.35)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect width="12" height="12" rx="2" fill="white" />
            </svg>
            Navigasyonu Durdur
          </button>
        </div>
      )}

      {/* Radar alert — positioned below nav bar when navigating */}
      {nearbyRadar && (
        <div
          className="absolute left-4 right-4 z-30 max-w-md mx-auto"
          style={{
            top: navigating
              ? "calc(env(safe-area-inset-top) + 130px)"
              : 88,
          }}
        >
          <RadarAlert
            distance={nearbyRadar.distance}
            maxspeed={nearbyRadar.radar.maxspeed}
            type={nearbyRadar.radar.type}
          />
        </div>
      )}
    </div>
  );
}
