import { afterEach, describe, expect, it, vi } from "vitest";
import { checkNoiseZoneOverride, classifyZoneLevel } from "./noiseZone";

describe("classifyZoneLevel", () => {
  it("classifies at the T-1442 65/55dB thresholds", () => {
    expect(classifyZoneLevel(75)).toBe("red");
    expect(classifyZoneLevel(65)).toBe("red");
    expect(classifyZoneLevel(60)).toBe("yellow");
    expect(classifyZoneLevel(55)).toBe("yellow");
    expect(classifyZoneLevel(50)).toBeNull();
  });
});

describe("checkNoiseZoneOverride", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a real hit (captured near Ring 3, Ullevål, Oslo)", async () => {
    // Captured via: curl "https://ogckart-sn1.atlas.vegvesen.no/norstoy_1_0/ows?
    //   SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=Strategiskstoykart_lden
    //   &QUERY_LAYERS=Strategiskstoykart_lden&CRS=CRS:84&BBOX=...&INFO_FORMAT=application/json"
    // for a point right next to Ring 3 near Ullevål stadion.
    const realResponse = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "Strategiskstoykart_lden.fid-654e5d01_19fb9cdfbf2_1aaf",
          geometry: { type: "Polygon", coordinates: [] },
          properties: {
            STØYINTERVALL: "70",
            STØYENHET: "LDEN",
            STØYKILDE: "V",
            STØYMETODE: '"NorStøy versjon 3.4, beregningsmetode Cnossos"\n',
            BEREGNETÅR: "2021",
            OBJTYPE: "Støy",
            KOMM: "301",
          },
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(realResponse), { status: 200 })),
    );

    const result = await checkNoiseZoneOverride({ lat: 59.9469, lon: 10.7328 });

    expect(result).toEqual({
      inZone: true,
      level: "red", // 70 >= 65
      dBRangeStart: 70,
      calculatedYear: 2021,
    });
  });

  it("reports no override when the service returns zero features (most of the country)", async () => {
    // Captured for a point with no mapped noise data - the common case,
    // not an error, per the dataset's coverage.
    const emptyResponse = {
      type: "FeatureCollection",
      features: [],
      totalFeatures: "unknown",
      numberReturned: 0,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(emptyResponse), { status: 200 })),
    );

    const result = await checkNoiseZoneOverride({ lat: 59.85, lon: 10.461 });

    expect(result).toEqual({
      inZone: false,
      level: null,
      dBRangeStart: null,
      calculatedYear: null,
    });
  });

  it("classifies a yellow-band hit correctly", async () => {
    const response = {
      features: [{ properties: { STØYINTERVALL: "60", BEREGNETÅR: "2022" } }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })),
    );

    const result = await checkNoiseZoneOverride({ lat: 59.91, lon: 10.75 });
    expect(result.inZone).toBe(true);
    expect(result.level).toBe("yellow");
    expect(result.dBRangeStart).toBe(60);
  });

  it("queries the correct layer, host, and CRS", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("ogckart-sn1.atlas.vegvesen.no/norstoy_1_0/ows");
      expect(url).toContain("LAYERS=Strategiskstoykart_lden");
      expect(url).toContain("CRS=CRS:84");
      expect(url).toContain("INFO_FORMAT=application/json");
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await checkNoiseZoneOverride({ lat: 59.9139, lon: 10.7522 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws a clear error on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );

    await expect(checkNoiseZoneOverride({ lat: 59.9139, lon: 10.7522 })).rejects.toThrow(/500/);
  });
});
