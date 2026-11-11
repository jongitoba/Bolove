"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RouteResult } from "./lib/routing";
import type { SavedPlace, HomePlace } from "./ReisetidApp";
import styles from "./reisetid.module.css";

const OSLO_CENTER: [number, number] = [10.7522, 59.9139];

// Same MapTiler style mechanism as /kart - NEXT_PUBLIC_ var inlined at
// build time, client-only module tree (see ReisetidLoader.tsx).
function mapStyleUrl(): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
}

const ROUTES_SOURCE = "routes-src";
const ROUTES_LAYER = "routes-lyr";

interface Props {
  home: HomePlace | null;
  places: SavedPlace[];
  routes: Record<string, RouteResult>;
}

export default function ReisetidMap({ home, places, routes }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl(),
      center: OSLO_CENTER,
      zoom: 11,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("load", () => {
      map.addSource(ROUTES_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: ROUTES_LAYER,
        type: "line",
        source: ROUTES_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4,
          "line-opacity": 0.75,
        },
      });
      setMapReady(true);
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Markers: home (dark) + one colored marker per place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    if (home) {
      markersRef.current.push(
        new maplibregl.Marker({ color: "#171717" })
          .setLngLat([home.lon, home.lat])
          .setPopup(new maplibregl.Popup({ offset: 24, closeButton: false }).setText(home.label))
          .addTo(map),
      );
    }
    for (const place of places) {
      markersRef.current.push(
        new maplibregl.Marker({ color: place.color })
          .setLngLat([place.lon, place.lat])
          .setPopup(new maplibregl.Popup({ offset: 24, closeButton: false }).setText(place.name))
          .addTo(map),
      );
    }

    // Keep every point in view as the picture changes.
    const points: [number, number][] = [
      ...(home ? [[home.lon, home.lat] as [number, number]] : []),
      ...places.map((p) => [p.lon, p.lat] as [number, number]),
    ];
    if (points.length === 1) {
      map.flyTo({ center: points[0], zoom: 13, duration: 600 });
    } else if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const point of points) bounds.extend(point);
      map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 });
    }
  }, [home, places]);

  // Route lines, one feature per place with its color.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const source = map.getSource(ROUTES_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: "FeatureCollection",
      features: places
        .filter((p) => routes[p.id])
        .map((p) => ({
          type: "Feature" as const,
          properties: { color: p.color },
          geometry: {
            type: "LineString" as const,
            coordinates: routes[p.id].coordinates,
          },
        })),
    });
  }, [places, routes, mapReady]);

  return <div ref={containerRef} className={styles.map} />;
}
