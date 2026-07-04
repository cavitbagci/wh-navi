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

export default function SearchPanel({ onRouteFound, onClear, hasRoute }: Props) {
  const placesLib = useMapsLibrary("places");
  const routesLib = useMapsLibrary("routes");
  const originRef = useRef<HTMLInputElement>(null);
  const destRef = useRef<HTMLInputElement>(null);
  const originPlaceRef = useRef<google.maps.places.PlaceResult | null>(null);
  const destPlaceRef = useRef<google.maps.places.PlaceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState<Field | null>(null);
  const [error, setError] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (!placesLib || !originRef.current || !destRef.current) return;

    const opts: google.maps.places.AutocompleteOptions = {
      componentRestrictions: { country: "tr" },
      fields: ["geometry", "name", "formatted_address"],
    };

    const originAC = new placesLib.Autocomplete(originRef.current, opts);
    originAC.addListener("place_changed", () => {
      originPlaceRef.current = originAC.getPlace();
    });

    const destAC = new placesLib.Autocomplete(destRef.current, opts);
    destAC.addListener("place_changed", () => {
      destPlaceRef.current = destAC.getPlace();
    });

    return () => {
      google.maps.event.clearInstanceListeners(originAC);
      google.maps.event.clearInstanceListeners(destAC);
    };
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
    onClear();
  };

  return (
    <div className="absolute top-4 left-4 right-4 z-20 max-w-md mx-auto md:right-auto md:w-96 md:mx-0">
      <div className="bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-700/50 overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2.5">
            <AppLogo size={30} />
            <span className="text-white font-semibold text-sm tracking-wide">
              WH Navigasyon
            </span>
          </div>
          <button className="text-gray-400 hover:text-white transition-colors text-xs">
            {isExpanded ? "▲" : "▼"}
          </button>
        </div>

        {/* Form */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-2">
            {/* Origin */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
              <div className="w-3 h-3 rounded-full bg-green-400 flex-shrink-0" />
              <input
                ref={originRef}
                placeholder="Başlangıç noktası"
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none min-w-0"
              />
              <button
                onClick={() => useMyLocation("origin")}
                disabled={locating !== null}
                className="text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors flex-shrink-0 text-base"
                title="Konumumu başlangıç yap"
              >
                {locating === "origin" ? (
                  <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  "📍"
                )}
              </button>
            </div>

            {/* Destination */}
            <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
              <div className="w-3 h-3 rounded-full bg-red-400 flex-shrink-0" />
              <input
                ref={destRef}
                placeholder="Varış noktası"
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none min-w-0"
              />
              <button
                onClick={() => useMyLocation("dest")}
                disabled={locating !== null}
                className="text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors flex-shrink-0 text-base"
                title="Konumumu varış yap"
              >
                {locating === "dest" ? (
                  <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  "📍"
                )}
              </button>
            </div>

            {error && <p className="text-red-400 text-xs px-1">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleRoute}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
              >
                {loading ? "Hesaplanıyor..." : "Rota Bul"}
              </button>
              {hasRoute && (
                <button
                  onClick={handleClear}
                  className="px-4 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-xl transition-colors"
                >
                  Temizle
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
