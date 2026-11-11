import { describe, expect, it } from "vitest";
import {
  classifyLevel,
  distanceAttenuatedLevelDb,
  energySumDb,
  estimateNoiseSectors,
  sectorForBearing,
  segmentSourceLevelDb,
} from "./scoring";
import type { RoadSegment } from "./types";

describe("segmentSourceLevelDb", () => {
  it("matches a hand-calculated value for a typical urban street", () => {
    // AADT 5,000, 5% heavy, 50km/h.
    // equivalentAadt = 5000*0.95 + 5000*0.05*9 = 4750 + 2250 = 7000
    // trafficTerm = 10*log10(7000) = 38.45098
    // speedTerm = 20*log10(50/50) = 0
    // level = 21.5 (baseline) + 38.45098 + 0 = 59.95098
    expect(segmentSourceLevelDb(5000, 0.05, 50)).toBeCloseTo(59.951, 2);
  });

  it("increases with heavier traffic mix at the same AADT", () => {
    const lightMix = segmentSourceLevelDb(5000, 0.02, 50);
    const heavyMix = segmentSourceLevelDb(5000, 0.2, 50);
    expect(heavyMix).toBeGreaterThan(lightMix);
  });

  it("increases with speed limit", () => {
    const slow = segmentSourceLevelDb(5000, 0.05, 30);
    const fast = segmentSourceLevelDb(5000, 0.05, 90);
    expect(fast).toBeGreaterThan(slow);
  });

  it("returns -Infinity (no contribution) for zero traffic", () => {
    expect(segmentSourceLevelDb(0, 0.05, 50)).toBe(-Infinity);
  });

  it("doubling AADT adds exactly +3.01dB (10*log10(2))", () => {
    const base = segmentSourceLevelDb(4000, 0.1, 50);
    const doubled = segmentSourceLevelDb(8000, 0.1, 50);
    expect(doubled - base).toBeCloseTo(10 * Math.log10(2), 6);
  });
});

describe("distanceAttenuatedLevelDb", () => {
  it("applies no attenuation at the 10m reference distance", () => {
    expect(distanceAttenuatedLevelDb(60, 10)).toBeCloseTo(60, 6);
  });

  it("applies exactly -3.01dB per doubling of distance", () => {
    const at10 = distanceAttenuatedLevelDb(60, 10);
    const at20 = distanceAttenuatedLevelDb(60, 20);
    const at40 = distanceAttenuatedLevelDb(60, 40);
    expect(at10 - at20).toBeCloseTo(10 * Math.log10(2), 6);
    expect(at20 - at40).toBeCloseTo(10 * Math.log10(2), 6);
  });

  it("is louder than the reference level when closer than 10m", () => {
    expect(distanceAttenuatedLevelDb(60, 5)).toBeGreaterThan(60);
  });
});

describe("sectorForBearing", () => {
  it.each([
    [0, "N"],
    [45, "NE"],
    [90, "E"],
    [135, "SE"],
    [180, "S"],
    [225, "SW"],
    [270, "W"],
    [315, "NW"],
  ] as const)("%d° maps to %s", (bearing, expected) => {
    expect(sectorForBearing(bearing)).toBe(expected);
  });

  it("respects the 22.5° boundary between N and NE", () => {
    expect(sectorForBearing(22.4)).toBe("N");
    expect(sectorForBearing(22.5)).toBe("NE");
  });

  it("wraps correctly around 360°/0°", () => {
    expect(sectorForBearing(359)).toBe("N");
    expect(sectorForBearing(350)).toBe("N");
    expect(sectorForBearing(-10)).toBe(sectorForBearing(350));
  });
});

describe("energySumDb", () => {
  it("returns null for no sources", () => {
    expect(energySumDb([])).toBeNull();
  });

  it("passes a single level through unchanged", () => {
    expect(energySumDb([50])).toBeCloseTo(50, 6);
  });

  it("two equal sources combine to +3.01dB over one alone (not +6, not the same)", () => {
    // L_total = 10*log10(10^5 + 10^5) = 10*log10(2e5) = 50 + 10*log10(2)
    const combined = energySumDb([50, 50]);
    expect(combined).toBeCloseTo(50 + 10 * Math.log10(2), 6);
    expect(combined).not.toBeCloseTo(100, 0); // not an arithmetic sum
    expect(combined).not.toBeCloseTo(50, 1); // not just the max/either value
  });

  it("ignores non-finite levels (e.g. from zero-traffic segments)", () => {
    expect(energySumDb([50, -Infinity])).toBeCloseTo(50, 6);
  });
});

describe("classifyLevel", () => {
  it("buckets at the 45/55dB boundaries", () => {
    expect(classifyLevel(44.9)).toBe("low");
    expect(classifyLevel(45)).toBe("medium");
    expect(classifyLevel(54.9)).toBe("medium");
    expect(classifyLevel(55)).toBe("high");
  });

  it("treats null (no data) as low", () => {
    expect(classifyLevel(null)).toBe("low");
  });
});

describe("estimateNoiseSectors", () => {
  const ADDRESS = { lat: 59.9139, lon: 10.7522 }; // Oslo

  it("assigns a single road segment to the correct sector with a hand-checkable level", () => {
    // A short segment due east of the address (same latitude, longitude
    // offset), close enough that the nearest point on it is simply its
    // closer endpoint. At this latitude, 1° longitude ≈ 111,320*cos(59.9139°)
    // ≈ 55,830m, so +0.002° ≈ 111.7m east.
    const segment: RoadSegment = {
      points: [
        { lat: ADDRESS.lat, lon: ADDRESS.lon + 0.002 },
        { lat: ADDRESS.lat, lon: ADDRESS.lon + 0.003 },
      ],
      aadt: 8000,
      heavyFraction: 0.1,
      speedLimitKmh: 50,
    };

    // Hand-calculated expectation:
    // equivalentAadt = 8000*0.9 + 8000*0.1*9 = 7200 + 7200 = 14400
    // sourceLevel@10m = 21.5 + 10*log10(14400) = 21.5 + 41.584 = 63.08
    // distance ≈ 111.7m → attenuation = -10*log10(111.7/10) ≈ -10.48dB
    // expected ≈ 52.6dB
    const result = estimateNoiseSectors(ADDRESS, [segment]);

    expect(result.E.dB).toBeCloseTo(52.6, 0);
    expect(result.E.level).toBe("medium");

    for (const sector of ["N", "NE", "SE", "S", "SW", "W", "NW"] as const) {
      expect(result[sector].dB).toBeNull();
      expect(result[sector].level).toBe("low");
    }
  });

  it("energy-sums two segments in the same sector to more than either alone", () => {
    const near: RoadSegment = {
      points: [
        { lat: ADDRESS.lat, lon: ADDRESS.lon + 0.001 },
        { lat: ADDRESS.lat, lon: ADDRESS.lon + 0.0015 },
      ],
      aadt: 3000,
      heavyFraction: 0.05,
      speedLimitKmh: 50,
    };
    const far: RoadSegment = {
      points: [
        { lat: ADDRESS.lat, lon: ADDRESS.lon + 0.004 },
        { lat: ADDRESS.lat, lon: ADDRESS.lon + 0.0045 },
      ],
      aadt: 3000,
      heavyFraction: 0.05,
      speedLimitKmh: 50,
    };

    const both = estimateNoiseSectors(ADDRESS, [near, far]);
    const nearOnly = estimateNoiseSectors(ADDRESS, [near]);

    expect(both.E.dB).not.toBeNull();
    expect(nearOnly.E.dB).not.toBeNull();
    expect(both.E.dB!).toBeGreaterThan(nearOnly.E.dB!);
  });

  it("ignores segments with zero traffic", () => {
    const segment: RoadSegment = {
      points: [
        { lat: ADDRESS.lat, lon: ADDRESS.lon + 0.002 },
        { lat: ADDRESS.lat, lon: ADDRESS.lon + 0.003 },
      ],
      aadt: 0,
      heavyFraction: 0,
      speedLimitKmh: 50,
    };

    const result = estimateNoiseSectors(ADDRESS, [segment]);
    for (const id of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const) {
      expect(result[id].dB).toBeNull();
    }
  });

  it("returns all-null/low sectors when there are no nearby roads", () => {
    const result = estimateNoiseSectors(ADDRESS, []);
    for (const id of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const) {
      expect(result[id].dB).toBeNull();
      expect(result[id].level).toBe("low");
    }
  });
});
