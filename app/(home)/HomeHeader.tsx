import Link from "next/link";
import styles from "./page.module.css";

export default function HomeHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.wordmark}>
        Bolove
      </Link>
      <nav className={styles.nav}>
        <a href="https://jonoba.no" className={styles.navCta}>
          ← jonoba.no
        </a>
      </nav>
    </header>
  );
}
