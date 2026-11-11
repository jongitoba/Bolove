import { describe, expect, it } from "vitest";
import { projectToUtm, utmZoneForLongitude } from "./utm";
import { planarDistanceMeters, bearingDegrees } from "./geometry";

// UTM projection tested in isolation from the noise math, per the brief.
// We don't hardcode an absolute "known good" easting/northing (that would
// require an external reference conversion we can't independently verify
// here) - instead we check the properties that actually matter for this
// application: internal self-consistency of distance and bearing, cross-
// checked against a simple spherical-earth approximation that's easy to
// hand-verify.

describe("utmZoneForLongitude", () => {
  it("picks zone 32 west of 12°E", () => {
    expect(utmZoneForLongitude(10.7522)).toBe(32); // Oslo
    expect(utmZoneForLongitude(5.3221)).toBe(32); // Bergen
    expect(utmZoneForLongitude(11.999)).toBe(32);
  });

  it("picks zone 33 at/east of 12°E", () => {
    expect(utmZoneForLongitude(12.0)).toBe(33);
    expect(utmZoneForLongitude(18.9553)).toBe(33); // Alta
  });
});

describe("projectToUtm", () => {
  const OSLO = { lat: 59.9139, lon: 10.7522 };

  it("is deterministic", () => {
    const zone = utmZoneForLongitude(OSLO.lon);
    const a = projectToUtm(OSLO, zone);
    const b = projectToUtm(OSLO, zone);
    expect(a).toEqual(b);
  });

  it("places projected easting/northing in the expected order-of-magnitude range for Norway", () => {
    // UTM easting is always near 500,000 close to the central meridian;
    // northing for Norway's latitudes (58-71°N) falls roughly 6.4M-7.9M.
    const zone = utmZoneForLongitude(OSLO.lon);
    const p = projectToUtm(OSLO, zone);
    expect(p.easting).toBeGreaterThan(400000);
    expect(p.easting).toBeLessThan(600000);
    expect(p.northing).toBeGreaterThan(6400000);
    expect(p.northing).toBeLessThan(7900000);
  });

  it("distance between two points ~0.001° of latitude apart matches the spherical-earth estimate", () => {
    // 1° of latitude is ~111,320m everywhere on Earth (meridians converge
    // at the poles, but latitude spacing itself barely varies with WGS84's
    // small flattening) - a solid, hand-checkable reference independent of
    // the UTM math we're testing.
    const zone = utmZoneForLongitude(OSLO.lon);
    const a = projectToUtm(OSLO, zone);
    const b = projectToUtm({ lat: OSLO.lat + 0.001, lon: OSLO.lon }, zone);

    const expectedMeters = 0.001 * 111320;
    const actualMeters = planarDistanceMeters(a, b);

    expect(actualMeters).toBeGreaterThan(expectedMeters * 0.99);
    expect(actualMeters).toBeLessThan(expectedMeters * 1.01);
  });

  it("distance between two points ~0.001° of longitude apart matches the spherical-earth estimate", () => {
    // At latitude φ, 1° of longitude is ~111,320 * cos(φ) metres.
    const zone = utmZoneForLongitude(OSLO.lon);
    const a = projectToUtm(OSLO, zone);
    const b = projectToUtm({ lat: OSLO.lat, lon: OSLO.lon + 0.001 }, zone);

    const cosLat = Math.cos((OSLO.lat * Math.PI) / 180);
    const expectedMeters = 0.001 * 111320 * cosLat;
    const actualMeters = planarDistanceMeters(a, b);

    expect(actualMeters).toBeGreaterThan(expectedMeters * 0.99);
    expect(actualMeters).toBeLessThan(expectedMeters * 1.01);
  });

  it("a point directly north projects to bearing ~0°, directly east to ~90°, ON the central meridian", () => {
    // Off the central meridian, true north and UTM "grid north" genuinely
    // diverge (grid convergence) - e.g. at Oslo (1.75° east of zone 32's
    // 9°E meridian, ~60°N) a point due geographic north lands at a grid
    // bearing of ~358.5°, not 0°, and that ~1.5° gap is correct UTM
    // behaviour, not a bug. So this sanity check uses a point exactly ON
    // the central meridian, where convergence is zero and grid/true north
    // coincide exactly.
    const zone = utmZoneForLongitude(OSLO.lon);
    const onMeridian = { lat: OSLO.lat, lon: 9.0 };
    const origin = projectToUtm(onMeridian, zone);

    const north = projectToUtm({ lat: onMeridian.lat + 0.01, lon: onMeridian.lon }, zone);
    const east = projectToUtm({ lat: onMeridian.lat, lon: onMeridian.lon + 0.01 }, zone);

    expect(bearingDegrees(origin, north)).toBeCloseTo(0, 1);
    expect(bearingDegrees(origin, east)).toBeCloseTo(90, 0);
  });
});
