"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./reisetid.module.css";

export interface GeocodeResult {
  lat: string;
  lon: string;
  label: string;
}

interface Props {
  placeholder: string;
  ariaLabel: string;
  /** Return true to clear the input after selection (for "add" flows). */
  onSelect: (result: GeocodeResult) => boolean | void;
}

// Debounced dropdown search against /api/geocode (Kartverket's address
// register) - same endpoint /solkalkulator uses for its landing form.
export default function AddressSearch({ placeholder, ariaLabel, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as GeocodeResult[];
        setResults(data);
        setOpen(true);
      } catch {
        // aborted or network error - keep whatever we had
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  function pick(result: GeocodeResult) {
    const clear = onSelect(result);
    skipNextSearch.current = true;
    setQuery(clear ? "" : result.label);
    setResults([]);
    setOpen(false);
  }

  return (
    <div className={styles.searchWrap}>
      <input
        type="text"
        className={styles.searchInput}
        value={query}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {searching && <span className={styles.searchSpinner} aria-hidden />}
      {open && results.length > 0 && (
        <ul className={styles.searchDropdown} role="listbox">
          {results.map((r, i) => (
            <li key={`${r.lat}-${r.lon}-${i}`}>
              <button
                type="button"
                className={styles.searchOption}
                // onMouseDown so the click wins over the input's onBlur close
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
  );
}
