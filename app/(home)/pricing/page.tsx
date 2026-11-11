import { Fraunces, Inter } from "next/font/google";
import { auth } from "@/auth";
import HomeHeader from "../HomeHeader";
import { grantDevAccess } from "./actions";
import homeStyles from "../page.module.css";
import styles from "./pricing.module.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-fraunces",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

export default async function PricingPage() {
  const session = await auth();
  const expiresAt = session?.user?.accessExpiresAt
    ? new Date(session.user.accessExpiresAt)
    : null;
  const hasAccess = !!expiresAt && expiresAt > new Date();
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className={`${homeStyles.page} ${fraunces.variable} ${inter.variable}`}>
      <HomeHeader />

      <section className={homeStyles.hero}>
        <p className={homeStyles.eyebrow}>Ett abonnement, alle verktøy</p>
        <h1 className={homeStyles.headline}>Priser</h1>
        <p className={homeStyles.subhead}>
          Ett abonnement gir tilgang til alle verktøy hos Bolove.
        </p>

        <div className={styles.card}>
          <div className={styles.price}>
            99 kr <span>/ måned</span>
          </div>
          <ul className={styles.features}>
            <li>Solkalkulator</li>
            <li>Kart og eiendomsdata</li>
            <li>Lånekalkulator</li>
            <li>Eierbrøk</li>
            <li>Reisetid</li>
            <li>Støynivå</li>
            <li>Nye verktøy etter hvert som de lanseres</li>
          </ul>

          {!session?.user ? (
            <a href="/logg-inn" className={styles.button}>
              Logg inn for å starte
            </a>
          ) : (
            <button className={styles.button} disabled>
              Betaling kommer snart
            </button>
          )}

          {session?.user && (
            <p className={`${styles.status} ${hasAccess ? styles.statusActive : styles.statusInactive}`}>
              {hasAccess
                ? `Du har tilgang til ${expiresAt!.toLocaleDateString("nb-NO")}.`
                : "Du har ikke aktiv tilgang."}
            </p>
          )}
        </div>

        {isDev && session?.user && (
          <div className={styles.devBox}>
            <h2>Kun i utvikling</h2>
            <form action={grantDevAccess}>
              <button type="submit" className={styles.button}>
                Gi 30 dagers tilgang
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
