export function haversineDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng *
      sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Compass bearing from a to b, 0-360 degrees (0=North, 90=East)
export function getBearing(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Smallest angular difference between two compass headings, 0-180
export function angleDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// Returns true if radar (pointing at `radarDirection`) would catch a vehicle
// heading `userHeading`. Radars typically face toward oncoming traffic.
export function isRadarAhead(userHeading: number, radarDirection: number): boolean {
  return angleDiff(userHeading, radarDirection) < 90;
}

// Minimum distance (meters) from point p to polyline defined by path vertices.
// Uses flat-earth approximation — accurate enough for < 10 km distances.
export function distanceToPath(
  p: { lat: number; lng: number },
  path: { lat: number; lng: number }[]
): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return haversineDistance(p, path[0]);

  const METERS_PER_DEG_LAT = 111319.5;
  let minDist = Infinity;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const avgLat = (p.lat + a.lat + b.lat) / 3;
    const cosLat = Math.cos((avgLat * Math.PI) / 180);

    const px = (p.lng - a.lng) * cosLat * METERS_PER_DEG_LAT;
    const py = (p.lat - a.lat) * METERS_PER_DEG_LAT;
    const dx = (b.lng - a.lng) * cosLat * METERS_PER_DEG_LAT;
    const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT;

    const lenSq = dx * dx + dy * dy;
    let dist: number;

    if (lenSq < 1) {
      dist = haversineDistance(p, a);
    } else {
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
      const rx = px - t * dx;
      const ry = py - t * dy;
      dist = Math.sqrt(rx * rx + ry * ry);
    }

    if (dist < minDist) minDist = dist;
  }

  return minDist;
}

// Remaining route distance in meters, summing steps from currentIdx onward.
export function calcRemainingDistance(
  steps: { distance?: { value: number } }[],
  currentIdx: number,
  distToNextStep: number
): number {
  let total = distToNextStep;
  for (let i = currentIdx + 1; i < steps.length; i++) {
    total += steps[i].distance?.value ?? 0;
  }
  return total;
}

// Remaining route time in seconds, proportional within current step.
export function calcRemainingTime(
  steps: { distance?: { value: number }; duration?: { value: number } }[],
  currentIdx: number,
  distToNextStep: number
): number {
  const curStep = steps[currentIdx];
  const stepDist = curStep?.distance?.value ?? 1;
  const stepDur = curStep?.duration?.value ?? 0;
  const curRemaining = stepDist > 0 ? (distToNextStep / stepDist) * stepDur : 0;

  let total = curRemaining;
  for (let i = currentIdx + 1; i < steps.length; i++) {
    total += steps[i].duration?.value ?? 0;
  }
  return total;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 10) * 10} m`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  if (h > 0) return `${h} sa ${m} dk`;
  return `${m} dk`;
}
