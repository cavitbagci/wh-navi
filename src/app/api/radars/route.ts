import { NextResponse } from "next/server";

export interface RadarPoint {
  id: number;
  lat: number;
  lng: number;
  maxspeed?: number;
  name?: string;
}

let cache: RadarPoint[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function fetchOSMRadars(): Promise<RadarPoint[]> {
  const query = `[out:json][timeout:55];(node["highway"="speed_camera"](35.8,25.6,42.1,44.8);node["enforcement"="maxspeed"](35.8,25.6,42.1,44.8););out body;`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "User-Agent": "wh-navi/1.0 (navigation app)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(58000),
  });

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();

  return (
    data.elements as Array<{
      id: number;
      lat: number;
      lon: number;
      tags?: { maxspeed?: string; name?: string };
    }>
  ).map((el) => ({
    id: el.id,
    lat: el.lat,
    lng: el.lon,
    maxspeed: el.tags?.maxspeed ? parseInt(el.tags.maxspeed) : undefined,
    name: el.tags?.name,
  }));
}

export async function GET() {
  try {
    if (cache && Date.now() - cacheTime < CACHE_TTL) {
      return NextResponse.json(cache);
    }
    const radars = await fetchOSMRadars();
    cache = radars;
    cacheTime = Date.now();
    return NextResponse.json(radars);
  } catch (err) {
    console.error("Radar fetch error:", err);
    if (cache) return NextResponse.json(cache);
    return NextResponse.json([], { status: 200 });
  }
}
