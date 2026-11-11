import type { ProjectedPoint } from "./utm";

// Plane geometry on already-UTM-projected points. UTM is conformal with
// very low scale distortion at the sub-kilometre scale we operate at here
// (address ± ~500m), so ordinary Euclidean distance/bearing on
// easting/northing is accurate - this is exactly why projection happens
// before any of this, instead of doing distance/bearing math on raw
// lat/lon degrees (which are not equal-area/equal-angle and would give
// meaningfully wrong bearings, especially this far north).

export function planarDistanceMeters(a: ProjectedPoint, b: ProjectedPoint): number {
  const de = b.easting - a.easting;
  const dn = b.northing - a.northing;
  return Math.sqrt(de * de + dn * dn);
}

/** Compass bearing (0-360°, 0 = north, clockwise) from `from` to `to`. */
export function bearingDegrees(from: ProjectedPoint, to: ProjectedPoint): number {
  const de = to.easting - from.easting;
  const dn = to.northing - from.northing;
  const deg = (Math.atan2(de, dn) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Nearest point to `point` on the segment [a, b] (all already projected). */
function nearestPointOnSegment(
  point: ProjectedPoint,
  a: ProjectedPoint,
  b: ProjectedPoint,
): ProjectedPoint {
  const abx = b.easting - a.easting;
  const aby = b.northing - a.northing;
  const lengthSq = abx * abx + aby * aby;

  if (lengthSq === 0) return a; // degenerate segment (a === b)

  const apx = point.easting - a.easting;
  const apy = point.northing - a.northing;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lengthSq));

  return {
    easting: a.easting + t * abx,
    northing: a.northing + t * aby,
    zone: a.zone,
  };
}

/** Nearest point to `point` anywhere on the polyline (must have >= 2 points,
 *  all already projected in the same zone as `point`). */
export function nearestPointOnPolyline(
  point: ProjectedPoint,
  polyline: ProjectedPoint[],
): ProjectedPoint {
  if (polyline.length < 2) {
    throw new Error("nearestPointOnPolyline requires at least 2 points");
  }

  let best = nearestPointOnSegment(point, polyline[0], polyline[1]);
  let bestDist = planarDistanceMeters(point, best);

  for (let i = 1; i < polyline.length - 1; i++) {
    const candidate = nearestPointOnSegment(point, polyline[i], polyline[i + 1]);
    const dist = planarDistanceMeters(point, candidate);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }

  return best;
}
