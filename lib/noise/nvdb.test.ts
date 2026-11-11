import { afterEach, describe, expect, it, vi } from "vitest";
import { bboxAroundAddress, fetchRoadSegments, matchSpeedLimit, parseNvdbWkt } from "./nvdb";

describe("parseNvdbWkt", () => {
  it("parses a LINESTRING Z, swapping NVDB's lat,lon,height order to {lat, lon}", () => {
    // Hand-crafted, unambiguous: first coordinate component is always ~59
    // (a plausible Norwegian latitude), second ~10 (longitude) - if the
    // parser had the axis order backwards, this test would catch it.
    const wkt = "LINESTRING Z (59.1 10.1 5.0,59.2 10.2 6.0,59.3 10.3 7.0)";
    const result = parseNvdbWkt(wkt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([
      { lat: 59.1, lon: 10.1 },
      { lat: 59.2, lon: 10.2 },
      { lat: 59.3, lon: 10.3 },
    ]);
  });

  it("parses a MULTILINESTRING Z into one polyline per part", () => {
    const wkt = "MULTILINESTRING Z ((59.1 10.1 5.0,59.2 10.2 6.0),(60.1 11.1 5.0,60.2 11.2 6.0))";
    const result = parseNvdbWkt(wkt);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([
      { lat: 59.1, lon: 10.1 },
      { lat: 59.2, lon: 10.2 },
    ]);
    expect(result[1]).toEqual([
      { lat: 60.1, lon: 11.1 },
      { lat: 60.2, lon: 11.2 },
    ]);
  });

  it("parses a real excerpt captured from the live NVDB API (objekttype 540, Oslo)", () => {
    // Captured via: curl -H "X-Client: ..." \
    //   "https://nvdbapiles.atlas.vegvesen.no/vegobjekter/540?kartutsnitt=10.74,59.91,10.765,59.92&srid=4326&inkluder=egenskaper,geometri,lokasjon"
    // (truncated to the first few points of one real MULTILINESTRING).
    const wkt =
      "MULTILINESTRING Z ((59.90690216 10.76209383 4.518,59.90693152 10.76211375 4.648," +
      "59.90697811 10.76214427 4.768),(59.91092014 10.75786786 3.158,59.91093651 10.7578802 3.128))";

    const result = parseNvdbWkt(wkt);

    expect(result).toHaveLength(2);
    expect(result[0][0]).toEqual({ lat: 59.90690216, lon: 10.76209383 });
    expect(result[1][0]).toEqual({ lat: 59.91092014, lon: 10.75786786 });
  });
});

describe("bboxAroundAddress", () => {
  it("produces a roughly symmetric box scaled to the requested radius", () => {
    const address = { lat: 59.9139, lon: 10.7522 };
    const box = bboxAroundAddress(address, 500);

    expect(box.minLat).toBeLessThan(address.lat);
    expect(box.maxLat).toBeGreaterThan(address.lat);
    expect(box.minLon).toBeLessThan(address.lon);
    expect(box.maxLon).toBeGreaterThan(address.lon);

    // ~500m at this latitude should be a few thousandths of a degree, not
    // (say) whole degrees or millionths - a coarse sanity range.
    const latSpan = box.maxLat - box.minLat;
    expect(latSpan).toBeGreaterThan(0.005);
    expect(latSpan).toBeLessThan(0.02);
  });
});

describe("matchSpeedLimit", () => {
  const trafficMidpoint = { lat: 59.9139, lon: 10.7522 };

  it("returns the nearest speed segment's limit when one is close enough", () => {
    const near = {
      points: [
        { lat: 59.9139, lon: 10.7523 },
        { lat: 59.914, lon: 10.7524 },
      ],
      speedLimitKmh: 50,
    };
    const far = {
      points: [
        { lat: 59.95, lon: 10.8 },
        { lat: 59.951, lon: 10.801 },
      ],
      speedLimitKmh: 80,
    };

    expect(matchSpeedLimit(trafficMidpoint, [near, far])).toBe(50);
  });

  it("falls back to the default (50 km/h) when nothing is close enough", () => {
    const far = {
      points: [
        { lat: 59.95, lon: 10.8 },
        { lat: 59.951, lon: 10.801 },
      ],
      speedLimitKmh: 80,
    };

    expect(matchSpeedLimit(trafficMidpoint, [far])).toBe(50);
  });

  it("falls back to the default when there are no speed segments at all", () => {
    expect(matchSpeedLimit(trafficMidpoint, [])).toBe(50);
  });
});

describe("fetchRoadSegments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Response shapes below mirror real captured NVDB API responses (see
  // parseNvdbWkt's tests) - trimmed to the fields this module reads.
  function trafficResponse(hasNextPage: boolean) {
    return {
      metadata: hasNextPage
        ? { returnert: 1, neste: { href: "https://nvdbapiles.atlas.vegvesen.no/vegobjekter/540?page=2" } }
        : { returnert: 1 },
      objekter: [
        {
          id: 1,
          egenskaper: [
            { id: 4623, verdi: 11700 }, // ÅDT, total
            { id: 4624, verdi: 9 }, // ÅDT, andel lange kjøretøy (%)
          ],
          geometri: { wkt: "LINESTRING Z (59.9139 10.7522 5.0,59.914 10.7524 6.0)" },
        },
      ],
    };
  }

  function trafficResponsePage2() {
    return {
      metadata: { returnert: 1 },
      objekter: [
        {
          id: 2,
          egenskaper: [
            { id: 4623, verdi: 3000 },
            { id: 4624, verdi: 2 },
          ],
          geometri: { wkt: "LINESTRING Z (59.92 10.76 5.0,59.921 10.761 6.0)" },
        },
      ],
    };
  }

  function speedResponse() {
    return {
      metadata: { returnert: 1 },
      objekter: [
        {
          id: 3,
          egenskaper: [{ id: 2021, verdi: 60 }], // deliberately != the 50km/h default, so the test can tell a real match from a fallback
          geometri: { wkt: "LINESTRING Z (59.9139 10.7523 5.0,59.914 10.7525 6.0)" },
        },
      ],
    };
  }

  it("fetches, follows pagination, parses, and joins traffic + speed data", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      // Every call must carry the required X-Client header (see nvdb.ts's
      // header comment - NVDB rejects requests without one outright).
      expect((init?.headers as Record<string, string> | undefined)?.["X-Client"]).toBeTruthy();

      const isTraffic = url.includes("/vegobjekter/540");
      const isPage2 = url.includes("page=2");
      const body = isPage2 ? trafficResponsePage2() : isTraffic ? trafficResponse(true) : speedResponse();
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const segments = await fetchRoadSegments({ lat: 59.9139, lon: 10.7522 }, 500);

    // Traffic pagination followed: 2 pages -> 2 segments.
    expect(segments).toHaveLength(2);

    const first = segments[0];
    expect(first.aadt).toBe(11700);
    expect(first.heavyFraction).toBeCloseTo(0.09, 6);
    expect(first.speedLimitKmh).toBe(60); // matched to the nearby Fartsgrense segment

    const second = segments[1];
    expect(second.aadt).toBe(3000);
    expect(second.speedLimitKmh).toBe(50); // no nearby Fartsgrense -> default
  });

  it("throws a clear error when NVDB returns a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );

    await expect(fetchRoadSegments({ lat: 59.9139, lon: 10.7522 }, 500)).rejects.toThrow(/500/);
  });

  it("excludes tunnel segments (real E18/Festningstunnelen data) while keeping real surface streets", async () => {
    // Both WKT excerpts below are real, captured live near Skippergata 12B,
    // Oslo (0154) - see nvdb.ts's UNDERGROUND_BELOW_MEDIAN_M comment for the
    // full story: this exact tunnel object (42 100 AADT) was originally
    // being scored as a surface road a few hundred metres away, dwarfing
    // every real nearby street.
    const tunnelWkt =
      "LINESTRING Z (59.90668699 10.7410858 -14.87,59.90669869 10.74095356 -15.15,59.9067381 10.74057789 -16.24)";
    const surfaceWkt =
      "LINESTRING Z (59.90690216 10.76209383 4.518,59.90696417 10.76190108 4.018,59.90699485 10.76175817 3.918)";
    // A handful of ordinary nearby surface streets, purely so the local
    // median-elevation baseline reflects real ground level (~2-5m here)
    // rather than being computed from just the two segments under test.
    const context = [
      "LINESTRING Z (59.9065156 10.7472619 2.4,59.90648504 10.74766038 2.6)",
      "LINESTRING Z (59.90647758 10.74875011 3.1,59.90658545 10.74843711 3.4)",
      "LINESTRING Z (59.90803739 10.74857807 2.1,59.90811213 10.74874716 2.2)",
    ];

    function response() {
      return {
        metadata: { returnert: 5 },
        objekter: [
          { id: 1, egenskaper: [{ id: 4623, verdi: 42100 }, { id: 4624, verdi: 11 }], geometri: { wkt: tunnelWkt } },
          { id: 2, egenskaper: [{ id: 4623, verdi: 8000 }, { id: 4624, verdi: 10 }], geometri: { wkt: surfaceWkt } },
          ...context.map((wkt, i) => ({
            id: 100 + i,
            egenskaper: [{ id: 4623, verdi: 1000 }, { id: 4624, verdi: 5 }],
            geometri: { wkt },
          })),
        ],
      };
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const isTraffic = url.includes("/vegobjekter/540");
        const body = isTraffic ? response() : { metadata: { returnert: 0 }, objekter: [] };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    const segments = await fetchRoadSegments({ lat: 59.90922498616874, lon: 10.746533066178886 }, 500);

    expect(segments.some((s) => s.aadt === 42100)).toBe(false); // the tunnel
    expect(segments.some((s) => s.aadt === 8000)).toBe(true); // the real surface street
  });
});
