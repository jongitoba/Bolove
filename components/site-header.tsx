import Link from "next/link";
import styles from "./site-header.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          Bolove
        </Link>
        <nav className={styles.nav}>
          <Link href="/solkalkulator">Solkalkulator</Link>
          <Link href="/kart">Kart</Link>
          <Link href="/lanekalkulator">Lånekalkulator</Link>
          <Link href="/eierbrok">Eierbrøk</Link>
          <Link href="/reisetid">Reisetid</Link>
          <Link href="/stoynivaa">Støynivå</Link>
        </nav>
      </div>
    </header>
  );
}
