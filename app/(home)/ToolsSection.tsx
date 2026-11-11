"use client";

import { useEffect, useRef, useState } from "react";
import { TOOL_TABS, type ToolTabId } from "./toolTabs";
import type { GeocodedAddress } from "@/lib/geocode";
import styles from "./page.module.css";

interface Props {
  hasAccess: boolean;
  /** The address "Sett" on the homepage, if any - passed through to
   *  whichever tool can use it (Solkalkulator, Reisetid's home address). */
  sharedAddress?: GeocodedAddress | null;
}

// The horizontal tool menu - shared between "/" and "/pricing" so both
// pages let a visitor try a tool (preview if unpaid, the real thing if
// they have access) without leaving the page.
export default function ToolsSection({ hasAccess, sharedAddress }: Props) {
  const [activeTabId, setActiveTabId] = useState<ToolTabId>(TOOL_TABS[0].id);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const embedRef = useRef<HTMLDivElement | null>(null);

  const activeTab = TOOL_TABS.find((tab) => tab.id === activeTabId)!;

  useEffect(() => {
    const handleChange = () => setIsFullscreen(document.fullscreenElement === embedRef.current);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement === embedRef.current) {
      document.exitFullscreen();
    } else {
      embedRef.current?.requestFullscreen();
    }
  }

  return (
    <section className={styles.toolsSection}>
      <div className={styles.tabBarWrap}>
        <div className={styles.tabBar} role="tablist">
          {TOOL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTabId === tab.id}
              className={`${styles.tab} ${activeTabId === tab.id ? styles.tabActive : ""}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {hasAccess ? (
        <div
          key={`${activeTab.id}-${sharedAddress?.label ?? ""}`}
          ref={embedRef}
          className={activeTab.bounded ? styles.toolEmbedBounded : styles.toolEmbed}
        >
          <button
            type="button"
            className={`${styles.fullscreenButton} ${activeTab.fullscreenButtonOffset ? styles.fullscreenButtonOffset : ""}`}
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Lukk fullskjerm" : "Vis i fullskjerm"}
            title={isFullscreen ? "Lukk fullskjerm" : "Vis i fullskjerm"}
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 3v4a2 2 0 0 1-2 2H3M21 9h-4a2 2 0 0 1-2-2V3M3 15h4a2 2 0 0 1 2 2v4M15 21v-4a2 2 0 0 1 2-2h4" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" />
              </svg>
            )}
          </button>
          <activeTab.Component sharedAddress={sharedAddress} />
        </div>
      ) : (
        <div key={activeTab.id} className={styles.tabPanelWrap}>
          <activeTab.Preview />
        </div>
      )}
    </section>
  );
}
