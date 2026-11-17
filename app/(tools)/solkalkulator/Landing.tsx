"use client";

import { useEffect, useState } from "react";
import { searchAddresses } from "./lib/api";
import type { AddressResult } from "./lib/types";
import type { SolkalkulatorSelection } from "./lib/main";
import type { GeocodedAddress } from "@/lib/geocode";
import styles from "./landing.module.css";

const DEFAULT_FLOOR = 3;

interface Props {
  onSubmit: (selection: SolkalkulatorSelection) => void;
  /** Pre-fills and pre-selects the address, e.g. from the homepage's "Sett"
   *  field - skips straight to a valid, submittable selection. */
  initialAddress?: GeocodedAddress;
}

// The site-styled entry screen for /solkalkulator - address + floor, then
// handoff to the ported balcony-sun map/report view (lib/main.ts), which is
// left untouched. See CLAUDE.md "solkalkulator" section.
export default function Landing({ onSubmit, initialAddress }: Props) {
  const [query, setQuery] = useState(initialAddress?.label ?? "");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AddressResult | null>(
    initialAddress
      ? { lat: initialAddress.lat, lng: initialAddress.lon, label: initialAddress.label }
      : null,
  );
  const [floor, setFloor] = useState(DEFAULT_FLOOR);

  useEffect(() => {
    // If the query already matches a real selection (the initial prefill,
    // or a value just picked from the dropdown), there's nothing to search
    // for. Written as a check against current state rather than a
    // consumable "skip once" flag, so it stays correct under React Strict
    // Mode's dev-only double-invocation of effects on mount.
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
        const data = await searchAddresses(query.trim());
        if (cancelled) return;
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        // network error - dropdown just stays empty
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected]);

  function pick(result: AddressResult) {
    setSelected(result);
    setQuery(result.label);
    setResults([]);
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    onSubmit({
      address: selected.label,
      floor: Math.max(1, Math.round(floor) || DEFAULT_FLOOR),
      coords: { lat: selected.lat, lng: selected.lng },
    });
  }

  return (
    <div className={styles.wrap}>
      <h1>Solkalkulator</h1>
      <p className={styles.intro}>
        Se hvor mye sol balkongen din får gjennom året, basert på
        bygningsdata og solens bane.
      </p>

      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="solkalkulator-address">Adresse</label>
          <div className={styles.searchWrap}>
            <input
              id="solkalkulator-address"
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
                  <li key={`${r.lat}-${r.lng}-${i}`}>
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

        <div className={styles.field}>
          <label htmlFor="solkalkulator-floor">Etasje</label>
          <input
            id="solkalkulator-floor"
            type="number"
            className={styles.textInput}
            min={1}
            max={50}
            value={floor}
            onChange={(e) => setFloor(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>

        <button type="submit" className={styles.button} disabled={!selected}>
          Neste: plasser balkong →
        </button>
      </form>
    </div>
  );
}
