import { utmZoneForLongitude, projectToUtm, type ProjectedPoint } from "./utm";
import { nearestPointOnPolyline, planarDistanceMeters } from "./geometry";
import { fetchWithRetry } from "../http";
import type { LatLon, RoadSegment } from "./types";

// NVDB API v4 client (Statens vegvesen's national road database). Everything
// here was verified against the LIVE API (not guessed from documentation
// snippets, which turned out to be incomplete/JS-rendered in places) via:
//   curl -H "X-Client: ..." "https://nvdbapiles.atlas.vegvesen.no/vegobjekter/540?..."
//
// Verified facts this module relies on:
//  - Object type 540 = "Trafikkmengde" (ÅDT). Attribute id 4623 = "ÅDT,
//    total" (integer, vehicles/day), 4624 = "ÅDT, andel lange kjøretøy"
//    (integer, PERCENT of heavy vehicles), 4621 = "År, gjelder for".
//  - Object type 105 = "Fartsgrense". Attribute id 2021 = "Fartsgrense"
//    (integer, km/h).
//  - Every request needs an `X-Client` header identifying the caller -
//    requests without one are rejected outright (400), even though the
//    underlying data itself is open (NLOD licence, no auth token needed).
//  - `geometri.wkt` is LINESTRING Z / MULTILINESTRING Z, but with
//    coordinates in **lat,lon,height order** - NOT the WKT-standard
//    lon,lat. This matches EPSG:4326's own strict axis definition (which
//    really is lat,lon), rather than the lon,lat convention most GIS
//    tooling/GeoJSON uses in practice. Very easy to get silently backwards;
//    confirmed by inspecting real coordinates (~59.9, ~10.7 for an Oslo
//    query - unambiguous which one is the latitude).
//  - Responses are paginated via `metadata.neste.href`.

const NVDB_BASE_URL = "https://nvdbapiles.atlas.vegvesen.no";
const X_CLIENT = "Bolove/1.0 (stoynivaa)";
const MAX_PAGES = 10; // sanity cap - a single address's bbox should never need this many

const OBJEKTTYPE_TRAFIKKMENGDE = 540;
const OBJEKTTYPE_FARTSGRENSE = 105;

const EGENSKAP_AADT_TOTAL = 4623;
const EGENSKAP_AADT_HEAVY_PERCENT = 4624;
const EGENSKAP_SPEED_LIMIT = 2021;

// Used when no Fartsgrense object can be matched to a traffic segment
// within MAX_SPEED_MATCH_DISTANCE_M - 50km/h is Norway's default speed
// limit in built-up areas (vegtrafikkloven/skiltforskriften), a reasonable
// fallback for a v1. Flagged so it's obviously a fallback, not a real
// reading.
const DEFAULT_SPEED_LIMIT_KMH = 50;
const MAX_SPEED_MATCH_DISTANCE_M = 75;

// A traffic-volume object whose points sit well below the surrounding
// street-level Z reveals itself as a TUNNEL, not a road at ground level -
// verified against a real address near Bjørvika, where the E18 tunnel
// (Festningstunnelen/Operatunnelen, running ~12-19m underground there) was
// otherwise scored as an ordinary 36 000-42 000 AADT SURFACE highway a few
// hundred metres away, dwarfing every real nearby street and producing a
// nonsensical "høy støy" reading on the sectors facing it.
// NVDB's Vegnett API does expose an explicit medium ("T"=terreng/ground,
// "L"=bru/air, "U"=undergrunn/tunnel) per veglenkesekvens, but that's a
// separate lookup per road link - impractical to call once per traffic
// segment (up to ~150-200 per address) on every request. The Z coordinate
// already present in the geometry we fetch anyway gives the same answer for
// the "U" case for free: real surface streets in one local area cluster
// tightly (verified: -1 to +13m around the local median for a real
// dense-city address), while a tunnel segment's points sit far below that -
// a comparison against the LOCAL median (not a fixed elevation) is what
// makes this work anywhere in the country regardless of the area's actual
// altitude. Deliberately NOT symmetric: an elevated road/bridge ("L", sits
// ABOVE the local median) isn't specially detected and is scored as an
// ordinary surface segment - noisy in reality too, just less severely wrong
// than the tunnel case, so left as a known v1 gap rather than guessed at.
const UNDERGROUND_BELOW_MEDIAN_M = 8;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The local street-level Z baseline (metres) to compare segment elevations
 *  against - computed fresh per request since NVDB's Z datum/local terrain
 *  varies by area, not a fixed constant. */
function localGroundLevelZ(parsedTraffic: ElevatedPoint[][][]): number {
  return median(parsedTraffic.flat(2).map((p) => p.z));
}

/** True when a segment's points sit far enough below the local median
 *  street-level elevation to be a tunnel rather than a surface road - see
 *  UNDERGROUND_BELOW_MEDIAN_M above for the full reasoning and its known
 *  (bridges-not-handled) gap. */
function isUnderground(points: ElevatedPoint[], localGroundZ: number): boolean {
  return median(points.map((p) => p.z)) < localGroundZ - UNDERGROUND_BELOW_MEDIAN_M;
}

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** Bounding box of roughly `radiusMeters` around a point, for use as an API
 *  query bound only - uses a simple spherical-earth approximation (fine for
 *  "which rows to fetch", unlike the UTM-projected math used for the actual
 *  scoring, which needs to be precise). */
export function bboxAroundAddress(address: LatLon, radiusMeters: number): BoundingBox {
  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / (111320 * Math.cos((address.lat * Math.PI) / 180));
  return {
    minLon: address.lon - lonDelta,
    minLat: address.lat - latDelta,
    maxLon: address.lon + lonDelta,
    maxLat: address.lat + latDelta,
  };
}

interface NvdbEgenskap {
  id: number;
  verdi: unknown;
}

interface NvdbVegobjekt {
  id: number;
  egenskaper?: NvdbEgenskap[];
  geometri?: { wkt: string };
}

interface NvdbResponse {
  metadata: { returnert: number; neste?: { href: string } };
  objekter: NvdbVegobjekt[];
}

function egenskapValue(obj: NvdbVegobjekt, id: number): unknown {
  return obj.egenskaper?.find((e) => e.id === id)?.verdi;
}

interface ElevatedPoint extends LatLon {
  /** Height coordinate from the WKT's "Z" component, metres - NVDB doesn't
   *  document the exact vertical datum, but empirically (verified against
   *  the live API) it's consistent enough within one area to tell surface
   *  roads from tunnels apart by comparison alone - see isUnderground
   *  above. */
  z: number;
}

/** Parses NVDB's `LINESTRING Z (...)` / `MULTILINESTRING Z ((...), (...))`
 *  WKT into one or more polylines, keeping the Z/height coordinate. Each
 *  part of a MultiLineString becomes its own polyline (they can be
 *  geometrically disconnected). Swaps NVDB's lat,lon axis order to our
 *  (and everyone else's) lon-agnostic {lat, lon} shape. */
function parseNvdbWktWithElevation(wkt: string): ElevatedPoint[][] {
  const isMulti = wkt.startsWith("MULTILINESTRING");
  const body = wkt
    .replace(/^MULTILINESTRING Z?\s*/, "")
    .replace(/^LINESTRING Z?\s*/, "")
    .trim();

  const parts = isMulti
    ? [...body.matchAll(/\(([^()]+)\)/g)].map((m) => m[1])
    : [body.replace(/^\(|\)$/g, "")];

  return parts.map((part) =>
    part
      .split(",")
      .map((triple) => triple.trim())
      .filter(Boolean)
      .map((triple) => {
        const [lat, lon, z] = triple.split(/\s+/).map(Number);
        return { lat, lon, z };
      }),
  );
}

/** Same as parseNvdbWktWithElevation, but drops Z - the shape every other
 *  caller (and the existing tests) expects. */
export function parseNvdbWkt(wkt: string): LatLon[][] {
  return parseNvdbWktWithElevation(wkt).map((part) => part.map(({ lat, lon }) => ({ lat, lon })));
}

async function fetchAllPages(objekttypeId: number, bbox: BoundingBox): Promise<NvdbVegobjekt[]> {
  const kartutsnitt = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  let url =
    `${NVDB_BASE_URL}/vegobjekter/${objekttypeId}` +
    `?kartutsnitt=${kartutsnitt}&srid=4326&inkluder=egenskaper,geometri`;

  const all: NvdbVegobjekt[] = [];
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetchWithRetry(url, { headers: { "X-Client": X_CLIENT } });
    if (!res.ok) {
      throw new Error(`NVDB request failed (${res.status}) for objekttype ${objekttypeId}`);
    }
    const data = (await res.json()) as NvdbResponse;
    all.push(...data.objekter);
    url = data.metadata.neste?.href ?? "";
  }
  return all;
}

interface TrafficSegment {
  points: LatLon[];
  aadt: number;
  heavyFraction: number;
}

interface SpeedSegment {
  points: LatLon[];
  speedLimitKmh: number;
}

function midpoint(points: LatLon[]): LatLon {
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
  return { lat, lon };
}

/** Core of matchSpeedLimit, operating on already-UTM-projected points so a
 *  caller matching many traffic segments against the same speed segments
 *  (fetchRoadSegments below) can project each speed polyline once instead
 *  of once per traffic segment. */
function nearestSpeedLimit(
  projectedMidpoint: ProjectedPoint,
  projectedSpeedSegments: { points: ProjectedPoint[]; speedLimitKmh: number }[],
): number {
  let best = DEFAULT_SPEED_LIMIT_KMH;
  let bestDist = Infinity;

  for (const segment of projectedSpeedSegments) {
    if (segment.points.length < 2) continue;
    const nearest = nearestPointOnPolyline(projectedMidpoint, segment.points);
    const dist = planarDistanceMeters(projectedMidpoint, nearest);
    if (dist < bestDist) {
      bestDist = dist;
      best = segment.speedLimitKmh;
    }
  }

  return bestDist <= MAX_SPEED_MATCH_DISTANCE_M ? best : DEFAULT_SPEED_LIMIT_KMH;
}

/** Finds the speed limit of whichever Fartsgrense segment is closest to a
 *  traffic segment's midpoint (nearest point on that segment's own
 *  polyline), within MAX_SPEED_MATCH_DISTANCE_M. This is a proximity
 *  heuristic, not a real join on NVDB's linear-referencing system
 *  (veglenkeposisjon) - good enough to pick "the speed limit of the road
 *  right here" for a v1, but can occasionally match the wrong carriageway
 *  at a complex junction. Falls back to DEFAULT_SPEED_LIMIT_KMH when
 *  nothing is close enough. */
export function matchSpeedLimit(trafficMidpoint: LatLon, speedSegments: SpeedSegment[]): number {
  if (speedSegments.length === 0) return DEFAULT_SPEED_LIMIT_KMH;

  const zone = utmZoneForLongitude(trafficMidpoint.lon);
  const projectedSpeedSegments = speedSegments.map((s) => ({
    points: s.points.map((p) => projectToUtm(p, zone)),
    speedLimitKmh: s.speedLimitKmh,
  }));

  return nearestSpeedLimit(projectToUtm(trafficMidpoint, zone), projectedSpeedSegments);
}

/** Fetches nearby road segments (traffic volume + speed limit, joined by
 *  proximity) from NVDB, ready for the scoring engine in ./scoring. Excludes
 *  tunnel segments (see UNDERGROUND_BELOW_MEDIAN_M above) - they carry real
 *  traffic but don't emit surface noise where they're mapped. Does real
 *  network I/O - callers should cache results (NVDB data refreshes at most
 *  yearly; this isn't meant for live per-request queries at scale). */
export async function fetchRoadSegments(address: LatLon, radiusMeters: number): Promise<RoadSegment[]> {
  const bbox = bboxAroundAddress(address, radiusMeters);

  const [trafficObjects, speedObjects] = await Promise.all([
    fetchAllPages(OBJEKTTYPE_TRAFIKKMENGDE, bbox),
    fetchAllPages(OBJEKTTYPE_FARTSGRENSE, bbox),
  ]);

  // Parse each traffic object's WKT exactly once, then reuse it both for
  // the local-ground-elevation baseline and for building the segments.
  const parsedTraffic = trafficObjects.map((obj) =>
    obj.geometri ? parseNvdbWktWithElevation(obj.geometri.wkt) : [],
  );
  const localGroundZ = localGroundLevelZ(parsedTraffic);

  const trafficSegments: TrafficSegment[] = trafficObjects.flatMap((obj, i) => {
    const aadt = egenskapValue(obj, EGENSKAP_AADT_TOTAL);
    const heavyPercent = egenskapValue(obj, EGENSKAP_AADT_HEAVY_PERCENT);
    if (typeof aadt !== "number") return []; // no ÅDT reading on this object, skip

    return parsedTraffic[i]
      .filter((points) => !isUnderground(points, localGroundZ))
      .map((points) => ({
        points: points.map(({ lat, lon }) => ({ lat, lon })),
        aadt,
        heavyFraction: typeof heavyPercent === "number" ? heavyPercent / 100 : 0,
      }));
  });

  const speedSegments: SpeedSegment[] = speedObjects.flatMap((obj) => {
    if (!obj.geometri) return [];
    const speed = egenskapValue(obj, EGENSKAP_SPEED_LIMIT);
    if (typeof speed !== "number") return [];

    return parseNvdbWkt(obj.geometri.wkt).map((points) => ({ points, speedLimitKmh: speed }));
  });

  // Project each speed segment's polyline once, up front, instead of once
  // per traffic segment inside matchSpeedLimit - with up to ~150-200
  // traffic segments matched against ~50-100 speed segments per request,
  // re-projecting the same speed geometry from scratch every time was pure
  // waste.
  const zone = utmZoneForLongitude(address.lon);
  const projectedSpeedSegments = speedSegments.map((s) => ({
    points: s.points.map((p) => projectToUtm(p, zone)),
    speedLimitKmh: s.speedLimitKmh,
  }));

  return trafficSegments.map((segment) => ({
    points: segment.points,
    aadt: segment.aadt,
    heavyFraction: segment.heavyFraction,
    speedLimitKmh: nearestSpeedLimit(projectToUtm(midpoint(segment.points), zone), projectedSpeedSegments),
  }));
}
