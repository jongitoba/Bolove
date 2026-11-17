"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import ToolsSection from "./ToolsSection";
import type { GeocodedAddress } from "@/lib/geocode";
import styles from "./page.module.css";

interface RawGeocodeResult {
  lat: string;
  lon: string;
  label: string;
}

export default function HomeContent() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RawGeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [sharedAddress, setSharedAddress] = useState<GeocodedAddress | null>(null);
  const skipNextSearch = useRef(false);

  // Debounced address search against /api/geocode, same pattern as
  // /reisetid's AddressSearch and /solkalkulator's Landing.
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    setSharedAddress(null);
    if (query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as RawGeocodeResult[];
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
  }, [query]);

  function pick(result: RawGeocodeResult) {
    skipNextSearch.current = true;
    setSharedAddress({ label: result.label, lat: Number(result.lat), lon: Number(result.lon) });
    setQuery(result.label);
    setResults([]);
    setOpen(false);
  }

  function handleSubmit(e: FormEvent) {
    // Picking an address from the dropdown already sets it; Solkalkulator,
    // Reisetid and Støynivå below pick it up automatically (see
    // ToolsSection/toolTabs). Nothing else to do on submit.
    e.preventDefault();
  }

  return (
    <>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Før du kjøper, bli kjent med hjemmet</p>
        <h1 className={styles.headline}>
          Sol, stillhet og reisetid — verifisert før du signerer noe som helst.
        </h1>
        <p className={styles.subhead}>
          Skriv inn en adresse. Få en privat analyse av solforholdene på
          balkongen og reisetiden til stedene som betyr noe for deg.
        </p>

        <form className={styles.addressForm} onSubmit={handleSubmit}>
          <div className={styles.addressFieldWrap}>
            <input
              type="text"
              className={styles.addressInput}
              placeholder="Skippergata 12b, 0152 Oslo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              aria-label="Adresse"
            />
            {open && results.length > 0 && (
              <ul className={styles.addressDropdown} role="listbox">
                {results.map((r, i) => (
                  <li key={`${r.lat}-${r.lon}-${i}`}>
                    <button
                      type="button"
                      className={styles.addressOption}
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
          <button type="submit" className={styles.addressSubmit} disabled={!sharedAddress}>
            Sett
          </button>
        </form>
      </section>

      <ToolsSection sharedAddress={sharedAddress} />
    </>
  );
}
