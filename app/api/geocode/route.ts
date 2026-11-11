import { NextRequest, NextResponse } from "next/server";
import { fetchWithRetry } from "@/lib/http";

// Replaces balcony-sun's Express proxy (server/index.ts), which forwarded to
// Nominatim. This uses Kartverket's open address API instead - plain fetch,
// no Node APIs, so it runs fine in the Cloudflare Worker. The response is
// reshaped into the same { lat, lon }[] (Nominatim-like) contract that
// app/(paid)/solkalkulator/lib/api.ts already expects, so that file - ported
// unchanged - didn't need to change.
const GEONORGE_URL = "https://ws.geonorge.no/adresser/v1/sok";

interface GeonorgeAddress {
  adressetekst?: string;
  postnummer?: string;
  poststed?: string;
  representasjonspunkt?: { lat: number; lon: number };
}

interface GeonorgeResponse {
  adresser?: GeonorgeAddress[];
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  try {
    const url = `${GEONORGE_URL}?sok=${encodeURIComponent(q)}&treffPerSide=5`;
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": "Bolove/1.0 (solkalkulator)" },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
    }

    const data = (await res.json()) as GeonorgeResponse;
    const results = (data.adresser ?? [])
      .filter((a) => a.representasjonspunkt)
      .map((a) => ({
        lat: String(a.representasjonspunkt!.lat),
        lon: String(a.representasjonspunkt!.lon),
        label: [a.adressetekst, [a.postnummer, a.poststed].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
      }));

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}
