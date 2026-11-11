import type { ComponentType } from "react";
import SolkalkulatorLoader from "@/app/(paid)/solkalkulator/SolkalkulatorLoader";
import KartLoader from "@/app/(paid)/kart/KartLoader";
import LanekalkulatorApp from "@/app/(paid)/lanekalkulator/LanekalkulatorApp";
import EierbrokApp from "@/app/(paid)/eierbrok/EierbrokApp";
import ReisetidLoader from "@/app/(paid)/reisetid/ReisetidLoader";
import StoynivaaApp from "@/app/(paid)/stoynivaa/StoynivaaApp";
import type { GeocodedAddress } from "@/lib/geocode";
import styles from "./page.module.css";

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
  Preview: ComponentType;
}

function SunPreview() {
  return (
    <div className={styles.tabPanel}>
      <div>
        <h2 className={styles.tabQuestion}>
          Hvor mange timer med direkte sol får egentlig balkongen?
        </h2>
        <p className={styles.tabExplainer}>
          Vi følger solbanen ut fra boligens nøyaktige orientering og etasje,
          og tar hensyn til nabobygg, gjennom alle årstider.
        </p>
        <div className={styles.statRow}>
          <div className={styles.stat}>
            <span className={styles.statValue}>6,2t</span>
            <span className={styles.statLabel}>snitt sommersol</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>SØ</span>
            <span className={styles.statLabel}>balkongens retning</span>
          </div>
        </div>
      </div>
      <div className={styles.diagramPlaceholder}>solbane-diagram</div>
    </div>
  );
}

function MapPreview() {
  return (
    <div className={styles.tabPanel}>
      <div>
        <h2 className={styles.tabQuestion}>
          Hvordan henger prisen sammen med resten av nabolaget?
        </h2>
        <p className={styles.tabExplainer}>
          Utforsk boligpriser, byggeår og andre nøkkeltall fra SSB og
          kommunen, lagt rett oppå kartet.
        </p>
        <div className={styles.statRow}>
          <div className={styles.stat}>
            <span className={styles.statValue}>42 900</span>
            <span className={styles.statLabel}>kr/m² i grunnkretsen</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>128</span>
            <span className={styles.statLabel}>boliger solgt siste år</span>
          </div>
        </div>
      </div>
      <div className={styles.diagramPlaceholder}>kart-forhåndsvisning</div>
    </div>
  );
}

function LoanPreview() {
  return (
    <div className={styles.tabPanel}>
      <div>
        <h2 className={styles.tabQuestion}>
          Hva vil boliglånet egentlig koste deg hver måned?
        </h2>
        <p className={styles.tabExplainer}>
          Sett inn pris, egenkapital og rente, og se nedbetalingsplanen
          oppdateres i sanntid.
        </p>
        <div className={styles.statRow}>
          <div className={styles.stat}>
            <span className={styles.statValue}>16 504 kr</span>
            <span className={styles.statLabel}>eksempel per måned</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>5,94 mill</span>
            <span className={styles.statLabel}>lånet vil totalt koste</span>
          </div>
        </div>
      </div>
      <div className={styles.diagramPlaceholder}>nedbetalingsplan</div>
    </div>
  );
}

function OwnershipPreview() {
  return (
    <div className={styles.tabPanel}>
      <div>
        <h2 className={styles.tabQuestion}>
          Hvem eier hvor mye når dere kjøper sammen?
        </h2>
        <p className={styles.tabExplainer}>
          Fordel eierandelen etter egenkapital, og se en egen
          nedbetalingsplan for hver person.
        </p>
        <div className={styles.statRow}>
          <div className={styles.stat}>
            <span className={styles.statValue}>2–4</span>
            <span className={styles.statLabel}>personer</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>50/50</span>
            <span className={styles.statLabel}>eksempel-fordeling</span>
          </div>
        </div>
      </div>
      <div className={styles.diagramPlaceholder}>eierbrøk-oversikt</div>
    </div>
  );
}

function CommutePreview() {
  return (
    <div className={styles.tabPanel}>
      <div>
        <h2 className={styles.tabQuestion}>
          Hvor sentralt ligger boligen i din hverdag?
        </h2>
        <p className={styles.tabExplainer}>
          Legg inn jobb, gym og andre steder du drar til, og se avstand og
          reisetid med bil, sykkel, gange eller kollektiv.
        </p>
        <div className={styles.statRow}>
          <div className={styles.stat}>
            <span className={styles.statValue}>18 min</span>
            <span className={styles.statLabel}>eksempel til jobb</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>4</span>
            <span className={styles.statLabel}>reisemåter</span>
          </div>
        </div>
      </div>
      <div className={styles.diagramPlaceholder}>rutekart</div>
    </div>
  );
}

function NoisePreview() {
  return (
    <div className={styles.tabPanel}>
      <div>
        <h2 className={styles.tabQuestion}>
          Hvor mye trafikkstøy må du regne med - og fra hvilken retning?
        </h2>
        <p className={styles.tabExplainer}>
          Vi henter trafikkmengde og fartsgrense fra Nasjonal vegdatabank og
          krysser det mot Statens vegvesens offisielle støysonekart, brutt
          ned på de åtte himmelretningene.
        </p>
        <div className={styles.statRow}>
          <div className={styles.stat}>
            <span className={styles.statValue}>64 dB</span>
            <span className={styles.statLabel}>eksempel fra nord</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>8</span>
            <span className={styles.statLabel}>himmelretninger</span>
          </div>
        </div>
      </div>
      <div className={styles.diagramPlaceholder}>støykompass</div>
    </div>
  );
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
  { id: "sun", label: "Solkalkulator", bounded: true, Component: SolkalkulatorTab, Preview: SunPreview },
  { id: "map", label: "Kart", bounded: true, Component: KartLoader, Preview: MapPreview },
  { id: "loan", label: "Lånekalkulator", bounded: false, Component: LanekalkulatorApp, Preview: LoanPreview },
  { id: "ownership", label: "Eierbrøk", bounded: false, Component: EierbrokApp, Preview: OwnershipPreview },
  {
    id: "commute",
    label: "Reisetid",
    bounded: true,
    fullscreenButtonOffset: true,
    Component: ReisetidTab,
    Preview: CommutePreview,
  },
  { id: "noise", label: "Støynivå", bounded: false, Component: StoynivaaTab, Preview: NoisePreview },
];
