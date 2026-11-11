"use client";

import { useEffect, useId, useState } from "react";
import type { NoiseLevel, NoiseZoneOverride, SectorId, SectorResults } from "@/lib/noise";
import type { GeocodedAddress } from "@/lib/geocode";
import styles from "./stoynivaa.module.css";

interface NoiseResponse {
  address: { lat: number; lon: number };
  sectors: SectorResults;
  zone_override: NoiseZoneOverride;
  source: string;
  confidence: NoiseLevel;
}

interface GeocodeApiResult {
  lat: string;
  lon: string;
  label: string;
}

// 3x3 layout with the address itself at the centre - null marks that slot.
const SECTOR_LAYOUT: (SectorId | null)[] = ["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"];

const LEVEL_LABEL: Record<NoiseLevel, string> = {
  low: "Lav",
  medium: "Middels",
  high: "Høy",
};

const LEVEL_CLASS: Record<NoiseLevel, string> = {
  low: styles.levelLow,
  medium: styles.levelMedium,
  high: styles.levelHigh,
};

const CONFIDENCE_TEXT: Record<NoiseLevel, string> = {
  high: "Basert på Statens vegvesens offisielle støyberegning (T-1442) for denne adressen.",
  medium: "Basert på trafikkdata fra Nasjonal vegdatabank (NVDB) og en forenklet støymodell.",
  low: "Fant ingen trafikkdata i nærheten av adressen - resultatet er usikkert.",
};

interface Props {
  /** Pre-fills and pre-selects the address, e.g. from the homepage's "Sett"
   *  field - skips straight to a submitted, fetched result. */
  initialAddress?: GeocodedAddress;
}

// Plain-content tool (no map) - address in, an 8-sector noise estimate out.
// Backend: app/api/noise/route.ts, wiring lib/noise/{nvdb,scoring,noiseZone}.
export default function StoynivaaApp({ initialAddress }: Props) {
  const addressId = useId();
  const [query, setQuery] = useState(initialAddress?.label ?? "");
  const [results, setResults] = useState<GeocodedAddress[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<GeocodedAddress | null>(initialAddress ?? null);

  const [data, setData] = useState<NoiseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Guard against re-searching when `query` already matches a just-picked
    // selection, written as a state comparison (not a consumable ref flag)
    // so it stays correct under React Strict Mode's dev-only double-invoked
    // mount effects - see Landing.tsx (solkalkulator) for the same pattern.
    if (selected && selected.label === query) {
      setResults([]);
      setOpen(false);
      return;
    }

    setSelected(null);
    if (query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) return;
        const raw = (await res.json()) as GeocodeApiResult[];
        if (cancelled) return;
        setResults(raw.map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), label: r.label })));
        setOpen(raw.length > 0);
      } catch {
        // network error - dropdown just stays empty
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected]);

  useEffect(() => {
    if (!selected) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/noise?lat=${selected.lat}&lon=${selected.lon}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Kunne ikke beregne støynivå for denne adressen");
        return (await res.json()) as NoiseResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ukjent feil");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  function pick(result: GeocodedAddress) {
    setSelected(result);
    setQuery(result.label);
    setResults([]);
    setOpen(false);
  }

  return (
    <div className={styles.wrap}>
      <h1>Støynivå</h1>
      <p className={styles.intro}>
        Se hvor mye trafikkstøy boligen er utsatt for, brutt ned per himmelretning.
      </p>

      <div className={styles.card}>
        <div className={styles.field}>
          <label htmlFor={addressId}>Adresse</label>
          <div className={styles.searchWrap}>
            <input
              id={addressId}
              type="text"
              className={styles.textInput}
              placeholder="F.eks. Storgata 1, Oslo"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {open && results.length > 0 && (
              <ul className={styles.dropdown} role="listbox">
                {results.map((r, i) => (
                  <li key={`${r.lat}-${r.lon}-${i}`}>
                    <button
                      type="button"
                      className={styles.option}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(r);
                      }}
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {loading && <p className={styles.status}>Beregner støynivå …</p>}
      {error && <p className={styles.statusError}>{error}</p>}

      {data && (
        <div className={styles.results}>
          {data.zone_override.inZone && data.zone_override.level && data.zone_override.dBRangeStart !== null && (
            <div
              className={`${styles.zoneBanner} ${
                data.zone_override.level === "red" ? styles.zoneBannerRed : styles.zoneBannerYellow
              }`}
            >
              Ligger i en offisiell støysone ({data.zone_override.level === "red" ? "rød" : "gul"}, T-1442):{" "}
              {data.zone_override.dBRangeStart}–{data.zone_override.dBRangeStart + 5} dB Lden
              {data.zone_override.calculatedYear ? ` (beregnet ${data.zone_override.calculatedYear})` : ""}.
            </div>
          )}

          <div className={styles.compassGrid}>
            {SECTOR_LAYOUT.map((id, i) => {
              if (id === null) {
                return <div key={`center-${i}`} className={styles.compassCenter} aria-hidden="true" />;
              }
              const sector = data.sectors[id];
              return (
                <div key={id} className={`${styles.sectorCell} ${LEVEL_CLASS[sector.level]}`}>
                  <span className={styles.sectorLabel}>{id}</span>
                  <span className={styles.sectorValue}>{sector.dB === null ? "–" : `${sector.dB} dB`}</span>
                  <span className={styles.sectorLevel}>{LEVEL_LABEL[sector.level]}</span>
                </div>
              );
            })}
          </div>

          <p className={styles.confidence}>{CONFIDENCE_TEXT[data.confidence]}</p>
          <p className={styles.disclaimer}>
            Støynivåene er et forenklet anslag basert på trafikkmengde, fartsgrense og avstand til
            nærmeste vei fra Nasjonal vegdatabank - ikke en fullstendig akustisk beregning. Bruk
            resultatet som en pekepinn, ikke et eksakt mål.
          </p>
        </div>
      )}
    </div>
  );
}
