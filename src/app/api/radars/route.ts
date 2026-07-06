import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Vercel Pro function timeout — lets both fetches (OSM + EGM) complete
export const maxDuration = 60;

export type RadarType = "speed" | "redlight" | "mobile" | "corridor" | "checkpoint";

export interface RadarPoint {
  id: number;
  lat: number;
  lng: number;
  maxspeed?: number;
  name?: string;
  type: RadarType;
  direction?: number; // compass degrees (0=N,90=E), undefined = bidirectional
  source: "osm" | "egm";
}

let cache: RadarPoint[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000;

type OSMTags = Record<string, string>;

function classifyType(tags: OSMTags): RadarType {
  const highway = tags["highway"] ?? "";
  const enforcement = tags["enforcement"] ?? "";
  const mobile = tags["mobile"] ?? tags["temporary"] ?? "";

  if (highway === "red_light_camera" || enforcement === "traffic_signals") return "redlight";
  if (mobile === "yes") return "mobile";
  if (enforcement === "check") return "checkpoint";
  if (
    tags["maxspeed:type"] === "zone" ||
    tags["zone:maxspeed"] ||
    tags["enforcement"] === "average_speed"
  )
    return "corridor";
  return "speed";
}

function parseDirection(tags: OSMTags): number | undefined {
  const raw = tags["direction"] ?? tags["camera:direction"];
  if (!raw) return undefined;

  const deg = parseFloat(raw);
  if (!isNaN(deg) && deg >= 0 && deg <= 360) return deg;

  const cardinals: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  return cardinals[raw.toUpperCase()];
}

async function fetchOSMRadars(): Promise<RadarPoint[]> {
  const query = `[out:json][timeout:45];(
node["highway"="speed_camera"](35.8,25.6,42.1,44.8);
node["highway"="red_light_camera"](35.8,25.6,42.1,44.8);
node["enforcement"~"^(maxspeed|speed|traffic_signals|average_speed|check)$"](35.8,25.6,42.1,44.8);
);out body;`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "wh-navi/1.0 (navigation app; contact: cavit.bagci04@gmail.com)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(50000),
  });

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();

  return (
    data.elements as Array<{
      id: number;
      lat: number;
      lon: number;
      tags?: OSMTags;
    }>
  ).map((el) => {
    const tags: OSMTags = el.tags ?? {};
    return {
      id: el.id,
      lat: el.lat,
      lng: el.lon,
      maxspeed: tags.maxspeed ? parseInt(tags.maxspeed) || undefined : undefined,
      name: tags.name || tags["name:tr"] || undefined,
      type: classifyType(tags),
      direction: parseDirection(tags),
      source: "osm" as const,
    };
  });
}

// EGM EDS scraper: parses the official EDS harita page's __VIEWSTATE.
// The SharePoint page embeds all EDS camera coordinates in base64-encoded binary.
// Format inside decoded binary: name\tlat\tlng (tab-separated).
async function fetchEGMRadars(): Promise<RadarPoint[]> {
  const EGM_URL =
    "https://onlineislemler.egm.gov.tr/trafik/sayfalar/edsharita.aspx";

  let html: string;
  try {
    const res = await fetch(EGM_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch (e) {
    console.warn("[radars] EGM fetch failed:", e);
    return [];
  }

  const vsMatch = html.match(/name="__VIEWSTATE"[^>]+value="([^"]+)"/);
  if (!vsMatch) return [];

  const vsDecoded = Buffer.from(vsMatch[1], "base64").toString("utf-8");

  const points: RadarPoint[] = [];
  let idCounter = 8_000_000;

  // Records with name\tlat\tlng
  const withName =
    /([^\x00-\x1f]{8,200}?)\t(3[6-9]\.\d{3,8}|4[01]\.\d{3,8})\t(2[6-9]\.\d{3,8}|3\d\.\d{3,8}|4[0-4]\.\d{3,8})/g;

  let m: RegExpExecArray | null;
  while ((m = withName.exec(vsDecoded)) !== null) {
    const lat = parseFloat(m[2]);
    const lng = parseFloat(m[3]);
    if (lat < 35 || lat > 43 || lng < 25 || lng > 46) continue;
    const name = m[1].trim().replace(/^[^A-Za-zÀ-ɏĞ-ş0-9]+/, "");
    points.push({ id: idCounter++, lat, lng, name: name || undefined, type: "speed", source: "egm" });
  }

  // Bare lat\tlng pairs not already captured
  const coordOnly =
    /(3[6-9]\.\d{4,8}|4[01]\.\d{4,8})\t(2[6-9]\.\d{4,8}|3\d\.\d{4,8}|4[0-4]\.\d{4,8})/g;

  const namedCoords = new Set(points.map((p) => `${p.lat},${p.lng}`));
  while ((m = coordOnly.exec(vsDecoded)) !== null) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (lat < 35 || lat > 43 || lng < 25 || lng > 46) continue;
    const key = `${lat},${lng}`;
    if (namedCoords.has(key)) continue;
    namedCoords.add(key);
    points.push({ id: idCounter++, lat, lng, type: "speed", source: "egm" });
  }

  console.log(`[radars] EGM: ${points.length} nokta`);
  return points;
}

// O(n) deduplication using a ~30m grid.
// Points landing in the same grid cell are considered duplicates; OSM wins (comes first).
function deduplicateRadars(points: RadarPoint[]): RadarPoint[] {
  // 0.0003 deg ≈ 33 m in latitude; longitude grid adjusted by cosine(midLat)
  const GRID_DEG = 0.0003;
  const seen = new Set<string>();
  const result: RadarPoint[] = [];

  for (const p of points) {
    const gLat = Math.round(p.lat / GRID_DEG);
    const gLng = Math.round(p.lng / GRID_DEG);
    const key = `${gLat},${gLng}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }

  return result;
}

// Reads the pre-built static cache generated by scripts/fetch-radars.mjs
function loadStaticCache(): RadarPoint[] | null {
  try {
    const raw = readFileSync(join(process.cwd(), "public", "radars-cache.json"), "utf-8");
    const data = JSON.parse(raw) as RadarPoint[];
    console.log(`[radars] Static cache: ${data.length} nokta`);
    return data;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // 1. In-memory cache (warm)
    if (cache && Date.now() - cacheTime < CACHE_TTL) {
      return NextResponse.json(cache);
    }

    // 2. Static pre-built file (committed to git by scripts/fetch-radars.mjs)
    //    This is the primary path on Vercel — no timeout risk.
    const staticData = loadStaticCache();
    if (staticData && staticData.length > 0) {
      cache = staticData;
      cacheTime = Date.now();
      return NextResponse.json(staticData);
    }

    // 3. Fallback: live fetch (works on Pro with maxDuration=60, may timeout on Hobby)
    console.log("[radars] Static cache bulunamadı, canlı fetch başlıyor…");
    const [osmResult, egmResult] = await Promise.allSettled([
      fetchOSMRadars(),
      fetchEGMRadars(),
    ]);

    const osm = osmResult.status === "fulfilled" ? osmResult.value : [];
    const egm = egmResult.status === "fulfilled" ? egmResult.value : [];

    console.log(`[radars] OSM: ${osm.length}, EGM: ${egm.length}`);

    const combined = deduplicateRadars([...osm, ...egm]);
    console.log(`[radars] Toplam: ${combined.length}`);

    cache = combined;
    cacheTime = Date.now();

    return NextResponse.json(combined);
  } catch (err) {
    console.error("Radar fetch error:", err);
    if (cache) return NextResponse.json(cache);
    return NextResponse.json([], { status: 200 });
  }
}
