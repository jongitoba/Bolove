"use client";

import dynamic from "next/dynamic";
import type { GeocodedAddress } from "@/lib/geocode";

// ssr:false for the same reason as /kart: MapLibre needs a real DOM/WebGL
// context, so this subtree can only run in the browser. dynamic(..., {ssr:
// false}) must live in a Client Component; page.tsx stays a Server Component.
const ReisetidApp = dynamic(() => import("./ReisetidApp"), {
  ssr: false,
  loading: () => <p style={{ padding: "2rem" }}>Laster kart …</p>,
});

interface Props {
  initialHome?: GeocodedAddress;
}

export default function ReisetidLoader({ initialHome }: Props) {
  return <ReisetidApp initialHome={initialHome} />;
}
