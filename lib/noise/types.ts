export interface LatLon {
  lat: number;
  lon: number;
}

export const SECTOR_IDS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type SectorId = (typeof SECTOR_IDS)[number];

export type NoiseLevel = "low" | "medium" | "high";

export interface RoadSegment {
  /** Polyline geometry, at least 2 points, in WGS84 lat/lon. */
  points: LatLon[];
  /** Annual average daily traffic, vehicles/day. */
  aadt: number;
  /** Fraction of heavy vehicles, 0-1 (e.g. 0.08 for 8%). */
  heavyFraction: number;
  /** Posted speed limit, km/h. */
  speedLimitKmh: number;
}

export interface SectorResult {
  /** Energy-summed, distance-attenuated level for this sector, or null if
   *  no road segments contribute to it. */
  dB: number | null;
  level: NoiseLevel;
}

export type SectorResults = Record<SectorId, SectorResult>;
