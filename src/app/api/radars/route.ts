import { NextResponse } from "next/server";

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
  // Comprehensive query: speed cameras, red light cameras, all enforcement types
  const query = `[out:json][timeout:58];(
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
    signal: AbortSignal.timeout(60000),
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

// EGM EDS scraper: parses the official EDS map page ViewState to extract camera coordinates.
// The SharePoint page at onlineislemler.egm.gov.tr/trafik/sayfalar/edsharita.aspx
// embeds all EDS point data in the __VIEWSTATE field as base64-encoded binary.
// Coordinates are stored as tab-separated lat\tlng strings within that binary.
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

  // Extract __VIEWSTATE
  const vsMatch = html.match(/name="__VIEWSTATE"[^>]+value="([^"]+)"/);
  if (!vsMatch) return [];

  const vsDecoded = Buffer.from(vsMatch[1], "base64").toString("utf-8");

  const points: RadarPoint[] = [];
  let idCounter = 8_000_000;

  // Pattern 1: records that have name\tlat\tlng (best quality)
  const withName =
    /([^\x00-\x1f]{8,200}?)\t(3[6-9]\.\d{3,8}|4[01]\.\d{3,8})\t(2[6-9]\.\d{3,8}|3\d\.\d{3,8}|4[0-4]\.\d{3,8})/g;

  let m: RegExpExecArray | null;
  while ((m = withName.exec(vsDecoded)) !== null) {
    const lat = parseFloat(m[2]);
    const lng = parseFloat(m[3]);
    if (lat < 35 || lat > 43 || lng < 25 || lng > 46) continue;

    // Strip leading binary format artifacts (single non-alphanumeric chars)
    const name = m[1].trim().replace(/^[^A-Za-zÀ-ɏĞ-ş0-9]+/, "");

    points.push({ id: idCounter++, lat, lng, name: name || undefined, type: "speed", source: "egm" });
  }

  // Pattern 2: bare lat\tlng pairs not already captured above
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

  console.log(`[radars] EGM ViewState scraper: ${points.length} nokta`);
  return points;
}

// Remove duplicates by proximity (within 30 m keep OSM version)
function deduplicateRadars(points: RadarPoint[]): RadarPoint[] {
  const MERGE_DIST = 30; // meters
  const seen: RadarPoint[] = [];

  for (const p of points) {
    let duplicate = false;
    for (const s of seen) {
      const dLat = (p.lat - s.lat) * 111319.5;
      const dLng = (p.lng - s.lng) * 111319.5 * Math.cos((p.lat * Math.PI) / 180);
      if (Math.sqrt(dLat * dLat + dLng * dLng) < MERGE_DIST) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) seen.push(p);
  }

  return seen;
}

export async function GET() {
  try {
    if (cache && Date.now() - cacheTime < CACHE_TTL) {
      return NextResponse.json(cache);
    }

    // Fetch both sources in parallel; EGM is best-effort
    const [osmRadars, egmRadars] = await Promise.allSettled([
      fetchOSMRadars(),
      fetchEGMRadars(),
    ]);

    const osm = osmRadars.status === "fulfilled" ? osmRadars.value : [];
    const egm = egmRadars.status === "fulfilled" ? egmRadars.value : [];

    console.log(`[radars] OSM: ${osm.length}, EGM: ${egm.length}`);

    // OSM first so dedup keeps OSM version when overlapping
    const combined = deduplicateRadars([...osm, ...egm]);

    cache = combined;
    cacheTime = Date.now();

    return NextResponse.json(combined);
  } catch (err) {
    console.error("Radar fetch error:", err);
    if (cache) return NextResponse.json(cache);
    return NextResponse.json([], { status: 200 });
  }
}
