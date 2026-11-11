import { utmZoneForLongitude, projectToUtm } from "./utm";
import { bearingDegrees, nearestPointOnPolyline, planarDistanceMeters } from "./geometry";
import { SECTOR_IDS, type LatLon, type NoiseLevel, type RoadSegment, type SectorId, type SectorResults } from "./types";

// ---------------------------------------------------------------------------
// SIMPLIFIED / ILLUSTRATIVE ROAD NOISE MODEL - READ BEFORE TRUSTING THE dB
// NUMBERS THIS PRODUCES.
//
// This is NOT a verified reproduction of the official Nordic road traffic
// noise method ("Road Traffic Noise - Nordic Prediction Method", TemaNord
// 1996:525) or CNOSSOS-EU (EU Directive (EU) 2015/996, Annex II, the method
// Norway's strategic noise maps have been moving toward for END/T-1442
// compliance). Both of those use vehicle-category-specific emission curves
// (separate light/medium/heavy terms, separate rolling-noise and
// propulsion-noise components, coefficients fitted from measurement
// campaigns) reproduced from the primary documents - we don't have those
// tables to hand, and guessing precise-looking coefficients from memory
// would be worse than being upfront that we didn't.
//
// What IS standard acoustics, not in dispute, and genuinely implemented
// correctly below:
//  - Noise ENERGY (not dB) scales with the number of vehicles, so the
//    dominant term is 10*log10(traffic): doubling traffic → +3dB. True
//    regardless of which prediction standard you use.
//  - Heavier vehicles are meaningfully louder - commonly cited as one heavy
//    vehicle emitting roughly as much noise ENERGY as ~8-10 passenger cars
//    at similar speed (Nordic/CNOSSOS source curves show heavy vehicles
//    running ~8-10dB louder than light vehicles per-vehicle, which is what
//    an 8-10x energy ratio means in dB terms).
//  - Noise increases with speed (engine + tyre/road rolling noise); real
//    models use speed-dependent curves that differ by vehicle category. We
//    use one shared, coarse correction instead.
//  - -3dB per doubling of distance (cylindrical/line-source spreading,
//    free-field, no barriers/terrain/ground absorption) - this is what was
//    asked for, and is a standard simplification for a v1.
//
// HEAVY_EQUIVALENCE, SPEED_REFERENCE_KMH and BASELINE_DB below are
// calibrated so a "typical urban street" (AADT 5,000, 5% heavy, 50km/h)
// lands around 60dB at 10 metres, which matches real-world expectation -
// they are NOT derived from the primary standards. Before this is used for
// anything beyond a rough directional screening signal, replace them with
// values reproduced from the actual Nordic method or CNOSSOS-EU tables.
// ---------------------------------------------------------------------------

const REFERENCE_DISTANCE_M = 10;
const MIN_DISTANCE_M = 1; // floor to avoid log(0)/log(negative) right at the source
const HEAVY_EQUIVALENCE = 9; // one heavy vehicle ≈ 9 light vehicles' worth of noise energy
const SPEED_REFERENCE_KMH = 50;
const BASELINE_DB = 21.5; // calibrated for plausibility - see comment above

/** Source noise level at the 10m reference distance for one road segment. */
export function segmentSourceLevelDb(
  aadt: number,
  heavyFraction: number,
  speedLimitKmh: number,
): number {
  if (aadt <= 0) return -Infinity; // no traffic, no contribution

  const equivalentAadt = aadt * (1 - heavyFraction) + aadt * heavyFraction * HEAVY_EQUIVALENCE;
  const trafficTerm = 10 * Math.log10(equivalentAadt);
  const speedTerm = 20 * Math.log10(Math.max(speedLimitKmh, 10) / SPEED_REFERENCE_KMH);

  return BASELINE_DB + trafficTerm + speedTerm;
}

/** Applies free-field distance attenuation (-3dB per doubling of distance)
 *  from the 10m reference level to the actual distance. */
export function distanceAttenuatedLevelDb(sourceLevelDb: number, distanceMeters: number): number {
  const d = Math.max(distanceMeters, MIN_DISTANCE_M);
  return sourceLevelDb - 10 * Math.log10(d / REFERENCE_DISTANCE_M);
}

/** Assigns a compass bearing (0-360°) to one of 8 sectors, each 45° wide and
 *  centred on its compass point (N covers [337.5°, 360°) ∪ [0°, 22.5°), etc). */
export function sectorForBearing(bearingDeg: number): SectorId {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % SECTOR_IDS.length;
  return SECTOR_IDS[index];
}

/** Energy-sums a set of dB levels (NOT an arithmetic average/sum) - the
 *  physically correct way to combine independent noise sources:
 *  L_total = 10*log10( sum(10^(L_i/10)) ). Returns null for an empty input
 *  (no sources → nothing to report, not 0dB). */
export function energySumDb(levelsDb: number[]): number | null {
  const finite = levelsDb.filter((l) => Number.isFinite(l));
  if (finite.length === 0) return null;

  const totalEnergy = finite.reduce((sum, l) => sum + 10 ** (l / 10), 0);
  return 10 * Math.log10(totalEnergy);
}

// Bucket cutoffs are deliberately lower/more sensitive than T-1442's
// official 55/65dB Lden red/yellow zone thresholds: T-1442 zones represent
// aggregate regulatory outdoor-noise-exposure categories, while this is a
// per-direction early-warning signal for a homebuyer looking at ONE
// address - a different use case, so a different (lower) bar. Product
// choice, not a physics constant; adjust freely.
const LEVEL_LOW_MAX_DB = 45;
const LEVEL_MEDIUM_MAX_DB = 55;

export function classifyLevel(dB: number | null): NoiseLevel {
  if (dB === null) return "low";
  if (dB < LEVEL_LOW_MAX_DB) return "low";
  if (dB < LEVEL_MEDIUM_MAX_DB) return "medium";
  return "high";
}

/** Pure scoring engine entry point: given an address and nearby road
 *  segments (already fetched from NVDB by the caller - this module does no
 *  I/O), returns an energy-summed, distance-attenuated noise estimate for
 *  each of the 8 compass sectors. */
export function estimateNoiseSectors(address: LatLon, segments: RoadSegment[]): SectorResults {
  const zone = utmZoneForLongitude(address.lon);
  const projectedAddress = projectToUtm(address, zone);

  const levelsBySector: Record<SectorId, number[]> = {
    N: [],
    NE: [],
    E: [],
    SE: [],
    S: [],
    SW: [],
    W: [],
    NW: [],
  };

  for (const segment of segments) {
    if (segment.points.length < 2) continue; // degenerate geometry, skip

    const sourceLevel = segmentSourceLevelDb(
      segment.aadt,
      segment.heavyFraction,
      segment.speedLimitKmh,
    );
    if (!Number.isFinite(sourceLevel)) continue;

    const projectedPoints = segment.points.map((p) => projectToUtm(p, zone));
    const nearest = nearestPointOnPolyline(projectedAddress, projectedPoints);
    const distance = planarDistanceMeters(projectedAddress, nearest);
    const bearing = bearingDegrees(projectedAddress, nearest);

    const attenuated = distanceAttenuatedLevelDb(sourceLevel, distance);
    levelsBySector[sectorForBearing(bearing)].push(attenuated);
  }

  const result = {} as SectorResults;
  for (const id of SECTOR_IDS) {
    const dB = energySumDb(levelsBySector[id]);
    result[id] = {
      dB: dB === null ? null : Math.round(dB * 10) / 10,
      level: classifyLevel(dB),
    };
  }
  return result;
}
