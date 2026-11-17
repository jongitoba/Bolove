import type { ComponentType } from "react";
import SolkalkulatorLoader from "@/app/(tools)/solkalkulator/SolkalkulatorLoader";
import KartLoader from "@/app/(tools)/kart/KartLoader";
import LanekalkulatorApp from "@/app/(tools)/lanekalkulator/LanekalkulatorApp";
import EierbrokApp from "@/app/(tools)/eierbrok/EierbrokApp";
import ReisetidLoader from "@/app/(tools)/reisetid/ReisetidLoader";
import StoynivaaApp from "@/app/(tools)/stoynivaa/StoynivaaApp";
import type { GeocodedAddress } from "@/lib/geocode";

export type ToolTabId = "sun" | "map" | "loan" | "ownership" | "commute" | "noise";

export interface ToolComponentProps {
  /** The address "Sett" on the homepage, if any - only Solkalkulator,
   *  Reisetid's home address, and Støynivå use this; the other tools
   *  ignore it. */
  sharedAddress?: GeocodedAddress | null;
}

export interface ToolTab {
  id: ToolTabId;
  label: string;
  /** Map/WebGL tools need an explicit-height container to render into. */
  bounded: boolean;
  /**
   * Reisetid's map fills all the way to the embed's right edge (unlike Kart,
   * where the detail panel occupies that corner, or Solkalkulator, where the
   * header does) - MapLibre's own zoom/compass control sits at the exact
   * same top-right spot our fullscreen button would, so it needs to be
   * pushed down to clear it.
   */
  fullscreenButtonOffset?: boolean;
  Component: ComponentType<ToolComponentProps>;
}

function StoynivaaTab({ sharedAddress }: ToolComponentProps) {
  return <StoynivaaApp initialAddress={sharedAddress ?? undefined} />;
}

function SolkalkulatorTab({ sharedAddress }: ToolComponentProps) {
  return <SolkalkulatorLoader initialAddress={sharedAddress ?? undefined} />;
}

function ReisetidTab({ sharedAddress }: ToolComponentProps) {
  return <ReisetidLoader initialHome={sharedAddress ?? undefined} />;
}

export const TOOL_TABS: ToolTab[] = [
  { id: "sun", label: "Solkalkulator", bounded: true, Component: SolkalkulatorTab },
  { id: "map", label: "Kart", bounded: true, Component: KartLoader },
  { id: "loan", label: "Lånekalkulator", bounded: false, Component: LanekalkulatorApp },
  { id: "ownership", label: "Eierbrøk", bounded: false, Component: EierbrokApp },
  {
    id: "commute",
    label: "Reisetid",
    bounded: true,
    fullscreenButtonOffset: true,
    Component: ReisetidTab,
  },
  { id: "noise", label: "Støynivå", bounded: false, Component: StoynivaaTab },
];
