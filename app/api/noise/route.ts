import { NextRequest, NextResponse } from "next/server";
import { checkNoiseZoneOverride, estimateNoiseSectors, fetchRoadSegments } from "@/lib/noise";

// Ties together modules 1-3 (lib/noise/{nvdb,scoring,noiseZone}.ts) into the
// single endpoint the UI calls: our own per-sector estimate from NVDB
// traffic data (module 1+3), plus - where it exists - Statens vegvesen's own
// authoritative T-1442 zone calculation (module 2) as a cross-check.
//
// Segments are fetched within a fixed radius: wide enough that a busy road
// just past the property line still contributes (distance attenuation in
// estimateNoiseSectors makes far segments negligible on their own), without
// pulling in traffic data from unrelated, far-away streets.
const ROAD_SEARCH_RADIUS_M = 500;

export async function GET(request: NextRequest) {
  const latParam = request.nextUrl.searchParams.get("lat");
  const lonParam = request.nextUrl.searchParams.get("lon");
  const lat = Number(latParam);
  const lon = Number(lonParam);

  if (!latParam || !lonParam || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Missing or invalid lat/lon" }, { status: 400 });
  }

  const address = { lat, lon };

  try {
    // Kick off the zone-override WMS lookup but don't await it yet -
    // estimateNoiseSectors only depends on `segments`, so it can run (CPU-
    // bound) while the zone lookup's own request tail is still in flight,
    // instead of blocking on both before starting either.
    const zoneOverridePromise = checkNoiseZoneOverride(address);
    const segments = await fetchRoadSegments(address, ROAD_SEARCH_RADIUS_M);
    const sectors = estimateNoiseSectors(address, segments);
    const zoneOverride = await zoneOverridePromise;

    // "high" whenever Statens vegvesen has already done a real CNOSSOS-EU
    // calculation for this point (authoritative, not our approximation).
    // Otherwise, confidence reflects how much NVDB traffic data we actually
    // found to feed our own simplified model - zero segments means every
    // sector defaults to "low" for lack of data, not because it's quiet.
    const confidence = zoneOverride.inZone ? "high" : segments.length > 0 ? "medium" : "low";

    return NextResponse.json({
      address,
      sectors,
      zone_override: zoneOverride,
      source: "NVDB (Statens vegvesen) + NorStøy T-1442",
      confidence,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
