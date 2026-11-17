export type TravelMode = "foot" | "bike" | "transit" | "car";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  /** GeoJSON LineString coordinates: [lon, lat][] */
  coordinates: [number, number][];
}

export const MODE_LABELS: Record<TravelMode, string> = {
  foot: "Gange",
  bike: "Sykkel",
  transit: "Kollektiv",
  car: "Bil",
};

// Walking/cycling/driving use FOSSGIS's public OSRM instances (the routing
// engine behind openstreetmap.org's directions) - open, CORS-enabled, no
// key. One instance per profile; the "/driving/" path segment is part of
// OSRM's URL scheme and is ignored by profile-specific instances.
const OSRM_PROFILES: Record<Exclude<TravelMode, "transit">, string> = {
  foot: "routed-foot",
  bike: "routed-bike",
  car: "routed-car",
};

interface OsrmResponse {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
  }[];
}

async function fetchOsrmRoute(
  mode: Exclude<TravelMode, "transit">,
  from: LatLon,
  to: LatLon,
  signal: AbortSignal,
): Promise<RouteResult> {
  const url =
    `https://routing.openstreetmap.de/${OSRM_PROFILES[mode]}/route/v1/driving/` +
    `${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = (await res.json()) as OsrmResponse;
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route) throw new Error("No route found");

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    coordinates: route.geometry.coordinates,
  };
}

// Public transport uses Entur's national journey planner (open API for all
// scheduled transport in Norway; only requirement is an identifying
// ET-Client-Name header). Legs carry encoded polylines that we decode and
// stitch into one line - includes the walking legs to/from stops.
const ENTUR_URL = "https://api.entur.io/journey-planner/v3/graphql";

const ENTUR_QUERY = `
query ($from: Location!, $to: Location!) {
  trip(from: $from, to: $to, numTripPatterns: 1) {
    tripPatterns {
      duration
      legs {
        distance
        pointsOnLink { points }
      }
    }
  }
}`;

interface EnturResponse {
  data?: {
    trip?: {
      tripPatterns?: {
        duration: number;
        legs: { distance: number; pointsOnLink?: { points?: string } }[];
      }[];
    };
  };
}

/** Decodes a Google-encoded polyline (precision 1e-5) to [lon, lat] pairs. */
function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    for (const which of [0, 1] as const) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lon += delta;
    }
    coords.push([lon / 1e5, lat / 1e5]);
  }

  return coords;
}

async function fetchTransitRoute(
  from: LatLon,
  to: LatLon,
  signal: AbortSignal,
): Promise<RouteResult> {
  const res = await fetch(ENTUR_URL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "ET-Client-Name": "bolove-reisetid",
    },
    body: JSON.stringify({
      query: ENTUR_QUERY,
      variables: {
        from: { coordinates: { latitude: from.lat, longitude: from.lon } },
        to: { coordinates: { latitude: to.lat, longitude: to.lon } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Entur ${res.status}`);
  const data = (await res.json()) as EnturResponse;
  const pattern = data.data?.trip?.tripPatterns?.[0];
  if (!pattern) throw new Error("No route found");

  const coordinates = pattern.legs.flatMap((leg) =>
    leg.pointsOnLink?.points ? decodePolyline(leg.pointsOnLink.points) : [],
  );
  const distanceMeters = pattern.legs.reduce((sum, leg) => sum + (leg.distance ?? 0), 0);

  return { distanceMeters, durationSeconds: pattern.duration, coordinates };
}

export function fetchRoute(
  mode: TravelMode,
  from: LatLon,
  to: LatLon,
  signal: AbortSignal,
): Promise<RouteResult> {
  return mode === "transit"
    ? fetchTransitRoute(from, to, signal)
    : fetchOsrmRoute(mode, from, to, signal);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} t ${rest} min` : `${hours} t`;
}
