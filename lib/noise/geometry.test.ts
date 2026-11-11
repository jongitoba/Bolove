import { describe, expect, it } from "vitest";
import { bearingDegrees, nearestPointOnPolyline, planarDistanceMeters } from "./geometry";
import type { ProjectedPoint } from "./utm";

// Plain planar geometry on already-projected points - hand-calculable
// without any UTM/geodesy involved, so tested independently of it.

function pt(easting: number, northing: number): ProjectedPoint {
  return { easting, northing, zone: 32 };
}

describe("planarDistanceMeters", () => {
  it("computes a 3-4-5 triangle distance", () => {
    expect(planarDistanceMeters(pt(0, 0), pt(3, 4))).toBeCloseTo(5, 6);
  });
});

describe("bearingDegrees", () => {
  it.each([
    ["north", pt(0, 10), 0],
    ["east", pt(10, 0), 90],
    ["south", pt(0, -10), 180],
    ["west", pt(-10, 0), 270],
  ])("points due %s give bearing %d°", (_label, to, expected) => {
    expect(bearingDegrees(pt(0, 0), to)).toBeCloseTo(expected, 6);
  });
});

describe("nearestPointOnPolyline", () => {
  it("finds the perpendicular foot on a single-segment polyline", () => {
    // Horizontal segment along northing=0, from easting 0 to 100. A point
    // at (50, 30) has its nearest point at (50, 0), distance 30.
    const nearest = nearestPointOnPolyline(pt(50, 30), [pt(0, 0), pt(100, 0)]);
    expect(nearest.easting).toBeCloseTo(50, 6);
    expect(nearest.northing).toBeCloseTo(0, 6);
  });

  it("clamps to the segment endpoint when the perpendicular foot falls outside it", () => {
    // Point beyond the segment's far end (easting 150) should snap to the
    // endpoint (100, 0), not an extrapolated point on the infinite line.
    const nearest = nearestPointOnPolyline(pt(150, 10), [pt(0, 0), pt(100, 0)]);
    expect(nearest.easting).toBeCloseTo(100, 6);
    expect(nearest.northing).toBeCloseTo(0, 6);
  });

  it("picks the closer of two segments in a multi-point polyline", () => {
    // An L-shaped road: (0,0)->(100,0)->(100,100). A point at (110, 50) is
    // much closer to the vertical leg (nearest point (100,50)) than the
    // horizontal one.
    const nearest = nearestPointOnPolyline(pt(110, 50), [pt(0, 0), pt(100, 0), pt(100, 100)]);
    expect(nearest.easting).toBeCloseTo(100, 6);
    expect(nearest.northing).toBeCloseTo(50, 6);
  });

  it("throws on a degenerate (single-point) polyline", () => {
    expect(() => nearestPointOnPolyline(pt(0, 0), [pt(1, 1)])).toThrow();
  });
});
