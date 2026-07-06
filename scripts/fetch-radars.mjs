/**
 * Radar verisini OSM + EGM'den çeker ve public/radars-cache.json dosyasına kaydeder.
 *
 * Kullanım:
 *   node scripts/fetch-radars.mjs
 *
 * Ardından dosyayı git'e ekle:
 *   git add public/radars-cache.json
 *   git commit -m "chore: radar cache güncelle"
 *   git push
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "public", "radars-cache.json");

// ── OSM ─────────────────────────────────────────────────────────────────────

function classifyType(tags) {
  const highway = tags["highway"] ?? "";
  const enforcement = tags["enforcement"] ?? "";
  const mobile = tags["mobile"] ?? tags["temporary"] ?? "";
  if (highway === "red_light_camera" || enforcement === "traffic_signals") return "redlight";
  if (mobile === "yes") return "mobile";
  if (enforcement === "check") return "checkpoint";
  if (tags["maxspeed:type"] === "zone" || tags["zone:maxspeed"] || enforcement === "average_speed")
    return "corridor";
  return "speed";
}

function parseDirection(tags) {
  const raw = tags["direction"] ?? tags["camera:direction"];
  if (!raw) return undefined;
  const deg = parseFloat(raw);
  if (!isNaN(deg) && deg >= 0 && deg <= 360) return deg;
  const cardinals = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  return cardinals[raw.toUpperCase()];
}

async function fetchOSM() {
  console.log("OSM Overpass sorgusu başlatıldı…");
  const query = `[out:json][timeout:120];(
node["highway"="speed_camera"](35.8,25.6,42.1,44.8);
node["highway"="red_light_camera"](35.8,25.6,42.1,44.8);
node["enforcement"~"^(maxspeed|speed|traffic_signals|average_speed|check)$"](35.8,25.6,42.1,44.8);
);out body;`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "wh-navi/1.0 (radar cache script)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(130_000),
  });

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();

  const points = data.elements.map((el) => {
    const tags = el.tags ?? {};
    return {
      id: el.id,
      lat: el.lat,
      lng: el.lon,
      maxspeed: tags.maxspeed ? parseInt(tags.maxspeed) || undefined : undefined,
      name: tags.name || tags["name:tr"] || undefined,
      type: classifyType(tags),
      direction: parseDirection(tags),
      source: "osm",
    };
  });

  console.log(`OSM: ${points.length} nokta`);
  return points;
}

// ── EGM ─────────────────────────────────────────────────────────────────────

async function fetchEGM() {
  console.log("EGM EDS Harita sayfası çekiliyor…");
  const res = await fetch(
    "https://onlineislemler.egm.gov.tr/trafik/sayfalar/edsharita.aspx",
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(40_000),
    }
  );
  if (!res.ok) throw new Error(`EGM HTTP ${res.status}`);
  const html = await res.text();

  const vsMatch = html.match(/name="__VIEWSTATE"[^>]+value="([^"]+)"/);
  if (!vsMatch) throw new Error("__VIEWSTATE bulunamadı");

  const vsDecoded = Buffer.from(vsMatch[1], "base64").toString("utf-8");
  const points = [];
  let idCounter = 8_000_000;

  const withName =
    /([^\x00-\x1f]{8,200}?)\t(3[6-9]\.\d{3,8}|4[01]\.\d{3,8})\t(2[6-9]\.\d{3,8}|3\d\.\d{3,8}|4[0-4]\.\d{3,8})/g;
  let m;
  while ((m = withName.exec(vsDecoded)) !== null) {
    const lat = parseFloat(m[2]);
    const lng = parseFloat(m[3]);
    if (lat < 35 || lat > 43 || lng < 25 || lng > 46) continue;
    const name = m[1].trim().replace(/^[^A-Za-zÀ-ɏ0-9]+/, "");
    points.push({ id: idCounter++, lat, lng, name: name || undefined, type: "speed", source: "egm" });
  }

  const namedCoords = new Set(points.map((p) => `${p.lat},${p.lng}`));
  const coordOnly =
    /(3[6-9]\.\d{4,8}|4[01]\.\d{4,8})\t(2[6-9]\.\d{4,8}|3\d\.\d{4,8}|4[0-4]\.\d{4,8})/g;
  while ((m = coordOnly.exec(vsDecoded)) !== null) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (lat < 35 || lat > 43 || lng < 25 || lng > 46) continue;
    const key = `${lat},${lng}`;
    if (namedCoords.has(key)) continue;
    namedCoords.add(key);
    points.push({ id: idCounter++, lat, lng, type: "speed", source: "egm" });
  }

  console.log(`EGM: ${points.length} nokta`);
  return points;
}

// ── Dedup ────────────────────────────────────────────────────────────────────

function deduplicateRadars(points) {
  const GRID_DEG = 0.0003; // ~33m
  const seen = new Set();
  const result = [];
  for (const p of points) {
    const key = `${Math.round(p.lat / GRID_DEG)},${Math.round(p.lng / GRID_DEG)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [osmResult, egmResult] = await Promise.allSettled([fetchOSM(), fetchEGM()]);

  const osm = osmResult.status === "fulfilled" ? osmResult.value : [];
  const egm = egmResult.status === "fulfilled" ? egmResult.value : [];

  if (osmResult.status === "rejected") console.error("OSM HATA:", osmResult.reason);
  if (egmResult.status === "rejected") console.error("EGM HATA:", egmResult.reason);

  const combined = deduplicateRadars([...osm, ...egm]);
  console.log(`\nToplam (dedup sonrası): ${combined.length} nokta`);
  console.log(`  OSM: ${osm.length}, EGM: ${egm.length}`);

  mkdirSync(join(__dirname, "..", "public"), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(combined), "utf-8");
  console.log(`\nKaydedildi: ${OUT_PATH}`);
  console.log("\nSonraki adımlar:");
  console.log("  git add public/radars-cache.json");
  console.log('  git commit -m "chore: radar cache güncelle"');
  console.log("  git push");
}

main().catch((e) => {
  console.error("Script hatası:", e);
  process.exit(1);
});
