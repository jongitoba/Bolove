"use client";

import { useEffect, useRef, useState } from "react";
import AddressSearch, { type GeocodeResult } from "./AddressSearch";
import ReisetidMap from "./ReisetidMap";
import {
  fetchRoute,
  formatDistance,
  formatDuration,
  MODE_LABELS,
  type RouteResult,
  type TravelMode,
} from "./lib/routing";
import type { GeocodedAddress } from "@/lib/geocode";
import styles from "./reisetid.module.css";

export interface HomePlace {
  lat: number;
  lon: number;
  label: string;
}

export interface SavedPlace {
  id: string;
  name: string;
  label: string;
  lat: number;
  lon: number;
  color: string;
}

type RouteState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; result: RouteResult };

const PLACE_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2"];

const MODES: TravelMode[] = ["foot", "bike", "transit", "car"];

interface Props {
  /** Pre-fills the home address, e.g. from the homepage's "Sett" field. */
  initialHome?: GeocodedAddress;
}

export default function ReisetidApp({ initialHome }: Props) {
  const [home, setHome] = useState<HomePlace | null>(initialHome ?? null);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [mode, setMode] = useState<TravelMode>("transit");
  const [placeName, setPlaceName] = useState("");
  const [routeStates, setRouteStates] = useState<Record<string, RouteState>>({});
  const colorCounter = useRef(0);

  function addPlace(result: GeocodeResult) {
    const color = PLACE_COLORS[colorCounter.current % PLACE_COLORS.length];
    colorCounter.current += 1;
    setPlaces((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: placeName.trim() || result.label,
        label: result.label,
        lat: Number(result.lat),
        lon: Number(result.lon),
        color,
      },
    ]);
    setPlaceName("");
    return true;
  }

  function removePlace(id: string) {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  }

  // Fetch a route home -> place for every place whenever the home address,
  // the place list, or the travel mode changes. Cached per (mode, from, to)
  // so switching modes back and forth doesn't refetch.
  const cacheRef = useRef(new Map<string, RouteResult>());
  useEffect(() => {
    if (!home) {
      setRouteStates({});
      return;
    }

    const controller = new AbortController();

    for (const place of places) {
      const cacheKey = `${mode}|${home.lon},${home.lat}|${place.lon},${place.lat}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setRouteStates((prev) => ({ ...prev, [place.id]: { status: "ok", result: cached } }));
        continue;
      }

      setRouteStates((prev) => ({ ...prev, [place.id]: { status: "loading" } }));
      fetchRoute(mode, home, place, controller.signal)
        .then((result) => {
          cacheRef.current.set(cacheKey, result);
          setRouteStates((prev) => ({ ...prev, [place.id]: { status: "ok", result } }));
        })
        .catch((err) => {
          if (controller.signal.aborted || err?.name === "AbortError") return;
          setRouteStates((prev) => ({ ...prev, [place.id]: { status: "error" } }));
        });
    }

    return () => controller.abort();
  }, [home, places, mode]);

  const routesForMap: Record<string, RouteResult> = {};
  for (const place of places) {
    const state = routeStates[place.id];
    if (state?.status === "ok") routesForMap[place.id] = state.result;
  }

  return (
    <div className={styles.shell}>
      <div className={styles.panel}>
        <h1>Reisetid</h1>
        <p className={styles.intro}>
          Hvor sentralt ligger boligen i <em>din</em> hverdag? Legg inn
          stedene du faktisk drar til, og se avstand og reisetid til hvert av
          dem.
        </p>

        <section className={styles.section}>
          <h2>Boligen du vurderer</h2>
          {home ? (
            <div className={styles.homeRow}>
              <span className={styles.homeDot} aria-hidden />
              <span className={styles.homeLabel}>{home.label}</span>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => setHome(null)}
              >
                Endre
              </button>
            </div>
          ) : (
            <AddressSearch
              placeholder="Søk etter adresse …"
              ariaLabel="Boligens adresse"
              onSelect={(r) => {
                setHome({ lat: Number(r.lat), lon: Number(r.lon), label: r.label });
              }}
            />
          )}
        </section>

        <section className={styles.section}>
          <h2>Stedene du drar til</h2>
          <div className={styles.addPlace}>
            <input
              type="text"
              className={styles.searchInput}
              value={placeName}
              placeholder="Navn, f.eks. Jobb eller Treningssenter"
              aria-label="Navn på sted"
              onChange={(e) => setPlaceName(e.target.value)}
            />
            <AddressSearch
              placeholder="Søk etter adresse, og velg for å legge til …"
              ariaLabel="Stedets adresse"
              onSelect={addPlace}
            />
          </div>

          {places.length > 0 && (
            <>
              <div className={styles.modeRow} role="group" aria-label="Reisemåte">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.modeButton} ${mode === m ? styles.modeButtonActive : ""}`}
                    onClick={() => setMode(m)}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>

              <ul className={styles.placeList}>
                {places.map((place) => {
                  const state = routeStates[place.id];
                  return (
                    <li key={place.id} className={styles.placeCard}>
                      <span className={styles.placeDot} style={{ background: place.color }} />
                      <div className={styles.placeBody}>
                        <span className={styles.placeName}>{place.name}</span>
                        {place.name !== place.label && (
                          <span className={styles.placeAddress}>{place.label}</span>
                        )}
                        <span className={styles.placeResult}>
                          {!home
                            ? "Velg boligadresse først"
                            : !state || state.status === "loading"
                              ? "Beregner rute …"
                              : state.status === "error"
                                ? "Fant ikke rute"
                                : `${formatDistance(state.result.distanceMeters)} · ${formatDuration(state.result.durationSeconds)}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.removeButton}
                        aria-label={`Fjern ${place.name}`}
                        onClick={() => removePlace(place.id)}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <p className={styles.disclaimer}>
          Gange, sykkel og bil rutes med OSRM på OpenStreetMap-data.
          Kollektivreiser beregnes av Entur ut fra rutetidene akkurat nå, og
          inkluderer gange til og fra holdeplass.
        </p>
      </div>

      <div className={styles.mapWrap}>
        <ReisetidMap home={home} places={places} routes={routesForMap} />
      </div>
    </div>
  );
}
