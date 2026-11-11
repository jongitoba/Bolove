import type { LatLon } from "./types";

// Forward Transverse Mercator projection (WGS84 ellipsoid), the standard
// closed-form series formula for UTM (Snyder, "Map Projections - A Working
// Manual", USGS Professional Paper 1395, 1987, formulas 8-9 through 8-11).
// This part is ordinary, well-established geodesy - not domain-specific to
// noise modelling, and not something we're approximating.
//
// Zone choice: Norway is covered by UTM zones 32N/33N in practice (Kartverket
// publishes most national geodata as EUREF89 UTM32 (EPSG:25832) or UTM33
// (EPSG:25833)). We pick between them with a simple longitude split at 12°E,
// which is the practical convention those datasets use - not the stricter
// international UTM zone-letter exception system (which widens zone 32V to
// cover 3°E-12°E for southern Norway specifically). That exception exists to
// avoid awkward zone splits around Svalbard/southwest Norway; it doesn't
// matter here because we only ever need ONE consistent zone for a single
// address ± ~500m, not a nationally-consistent map.

export type UtmZone = 32 | 33;

export interface ProjectedPoint {
  easting: number;
  northing: number;
  zone: UtmZone;
}

const WGS84_A = 6378137.0; // semi-major axis, metres
const WGS84_F = 1 / 298.257223563; // flattening
const K0 = 0.9996; // UTM scale factor at the central meridian
const FALSE_EASTING = 500000;

const E2 = WGS84_F * (2 - WGS84_F); // eccentricity squared
const EP2 = E2 / (1 - E2); // e'^2

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function utmZoneForLongitude(lon: number): UtmZone {
  return lon < 12 ? 32 : 33;
}

function centralMeridianDeg(zone: UtmZone): number {
  return zone === 32 ? 9 : 15;
}

/** Projects a WGS84 lat/lon into the given UTM zone. Always pass the SAME
 *  zone for every point in one calculation (e.g. determine it once from the
 *  address, and reuse it for every road point) - projecting each point to
 *  its own "natural" zone independently would introduce large spurious
 *  errors for points near the 12°E boundary. */
export function projectToUtm(point: LatLon, zone: UtmZone): ProjectedPoint {
  const lambda0 = toRad(centralMeridianDeg(zone));
  const phi = toRad(point.lat);
  const lambda = toRad(point.lon);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = WGS84_A / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = EP2 * cosPhi * cosPhi;
  const A = (lambda - lambda0) * cosPhi;

  const M =
    WGS84_A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 * E2 * E2) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 * E2) / 256 + (45 * E2 * E2 * E2) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 * E2 * E2) / 3072) * Math.sin(6 * phi));

  const easting =
    FALSE_EASTING +
    K0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * A ** 5) / 120);

  const northing =
    K0 *
    (M +
      N *
        tanPhi *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * A ** 6) / 720));

  return { easting, northing, zone };
}
