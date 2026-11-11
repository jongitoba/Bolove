import { fetchWithRetry } from "../http";
import type { LatLon } from "./types";

// T-1442 strategic noise zone overlay (Statens vegvesen's "NorStøy" WMS
// service), verified against the LIVE service the same way as nvdb.ts:
//   curl "https://ogckart-sn1.atlas.vegvesen.no/norstoy_1_0/ows?SERVICE=WMS&REQUEST=GetFeatureInfo&LAYERS=Strategiskstoykart_lden&..."
//
// Verified facts this module relies on:
//  - This dataset is WMS-only - confirmed via Geonorge's own catalog API
//    ("MapOnlyWms": true for uuid d6db9f39-...) - so there's no WFS to
//    query directly. GetFeatureInfo (asking "what's rendered at this
//    pixel?") is the standard way to get point-in-polygon answers out of a
//    WMS-only service, and this layer is explicitly queryable="1".
//  - GetCapabilities lives at www.vegvesen.no, but advertises a DIFFERENT
//    host for the actual GetFeatureInfo endpoint (ogckart-sn1.atlas.
//    vegvesen.no) - using the wrong one silently 404s.
//  - Layer name: "Strategiskstoykart_lden" (there's a sibling
//    "Strategiskstoykart_lnight" for night-time noise, unused here, and a
//    separate broader-coverage "Stoyvarselkart" forecast dataset covering
//    all national/county roads rather than just major urban areas - out of
//    scope for this module, which follows the brief's "strategic noise
//    map" description).
//  - CRS "CRS:84" (lon,lat order) sidesteps EPSG:4326's WMS 1.3.0 axis-
//    order ambiguity (which is lat,lon) entirely.
//  - No API key or custom header required (open data, unlike NVDB's
//    mandatory X-Client).
//  - A hit's GeoJSON properties include STØYINTERVALL: the LOWER bound (in
//    dB) of the 5dB-wide Lden band the point falls in as a string, e.g.
//    "70" means 70-75dB. Also confirms (via its own STØYMETODE property)
//    that this specific dataset really is calculated with "NorStøy versjon
//    3.4, beregningsmetode Cnossos" - i.e. genuine CNOSSOS-EU, unlike our
//    own deliberately-simplified formula in scoring.ts.
//  - Most queries return zero features - that IS the correct answer ("not
//    mapped here"), not an error. This matches the brief: the dataset only
//    covers major urban areas and major roads, not the whole country.

const GETFEATUREINFO_URL = "https://ogckart-sn1.atlas.vegvesen.no/norstoy_1_0/ows";
const LAYER = "Strategiskstoykart_lden";

// A ~200m box queried at 101x101 pixel resolution puts roughly 2m between
// pixels - plenty precise for "which pixel is the address" - with I=50,J=50
// (the exact centre pixel of an odd-sized grid) landing on the query point
// itself. These exact parameters were verified against the live service;
// don't shrink WIDTH/HEIGHT without re-testing (very small WMS images can
// behave oddly at polygon edges on some servers - untested here).
const QUERY_BOX_DEGREES = 0.001;
const QUERY_PIXELS = 101;
const QUERY_CENTER_PIXEL = 50;

// T-1442's own thresholds (55/65dB Lden for yellow/red zones) - these ARE
// the official regulatory cutoffs (unlike scoring.ts's Low/Medium/High
// sector buckets, which are our own product choice).
const RED_ZONE_MIN_DB = 65;
const YELLOW_ZONE_MIN_DB = 55;

export type ZoneLevel = "red" | "yellow" | null;

export interface NoiseZoneOverride {
  inZone: boolean;
  level: ZoneLevel;
  /** Lower bound (dB Lden) of the 5dB band this point falls in, if any. */
  dBRangeStart: number | null;
  /** Year Statens vegvesen ran this calculation, if known - these maps
   *  refresh roughly every 5 years, so this is a useful staleness signal. */
  calculatedYear: number | null;
}

interface WmsFeatureCollection {
  features?: { properties?: Record<string, unknown> }[];
}

export function classifyZoneLevel(dBRangeStart: number): ZoneLevel {
  if (dBRangeStart >= RED_ZONE_MIN_DB) return "red";
  if (dBRangeStart >= YELLOW_ZONE_MIN_DB) return "yellow";
  return null;
}

/** Checks whether an address falls inside a pre-computed T-1442 strategic
 *  noise zone polygon. This is an AUTHORITATIVE aggregate reading (a real
 *  CNOSSOS-EU calculation by Statens vegvesen) where it exists, but it has
 *  no directional information and only covers major urban areas/roads - use
 *  it ALONGSIDE estimateNoiseSectors (see ./scoring), not instead of it,
 *  per the brief. */
export async function checkNoiseZoneOverride(address: LatLon): Promise<NoiseZoneOverride> {
  const d = QUERY_BOX_DEGREES;
  const bbox = [address.lon - d, address.lat - d, address.lon + d, address.lat + d].join(",");

  const url =
    `${GETFEATUREINFO_URL}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo` +
    `&LAYERS=${LAYER}&QUERY_LAYERS=${LAYER}&CRS=CRS:84&BBOX=${bbox}` +
    `&WIDTH=${QUERY_PIXELS}&HEIGHT=${QUERY_PIXELS}&I=${QUERY_CENTER_PIXEL}&J=${QUERY_CENTER_PIXEL}` +
    `&INFO_FORMAT=application/json`;

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`NorStøy WMS GetFeatureInfo request failed (${res.status})`);
  }

  const data = (await res.json()) as WmsFeatureCollection;
  const properties = data.features?.[0]?.properties;
  if (!properties) {
    return { inZone: false, level: null, dBRangeStart: null, calculatedYear: null };
  }

  const dBRangeStart = Number(properties["STØYINTERVALL"]);
  const calculatedYear = Number(properties["BEREGNETÅR"]);
  const hasDbRange = Number.isFinite(dBRangeStart);

  return {
    inZone: true,
    level: hasDbRange ? classifyZoneLevel(dBRangeStart) : null,
    dBRangeStart: hasDbRange ? dBRangeStart : null,
    calculatedYear: Number.isFinite(calculatedYear) ? calculatedYear : null,
  };
}
