// Public surface of lib/noise, for consumers outside this folder
// (app/api/noise/route.ts, app/(paid)/stoynivaa/StoynivaaApp.tsx). Modules
// inside lib/noise import each other directly (./scoring, ./nvdb, etc.),
// not through this barrel - keep this export list matched to what's
// actually used from outside, not everything each module happens to export.
export type { NoiseLevel, SectorId, SectorResults } from "./types";
export { estimateNoiseSectors } from "./scoring";
export { fetchRoadSegments } from "./nvdb";
export { checkNoiseZoneOverride, type NoiseZoneOverride } from "./noiseZone";
