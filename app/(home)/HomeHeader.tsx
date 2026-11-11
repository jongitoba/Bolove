import Link from "next/link";
import { auth, signOut } from "@/auth";
import styles from "./page.module.css";

// Shared across every page in the (home) design system (the "confident &
// premium" landing page identity) - currently "/" and "/pricing". Anything
// still in (marketing) (logg-inn) keeps the plain shared SiteHeader instead.
export default async function HomeHeader() {
  const session = await auth();

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.wordmark}>
        Bolove
      </Link>
      <nav className={styles.nav}>
        <Link href="/pricing">Priser</Link>
        {session?.user ? (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className={styles.navCta}>
              Logg ut
            </button>
          </form>
        ) : (
          <Link href="/logg-inn" className={styles.navCta}>
            Logg inn
          </Link>
        )}
      </nav>
    </header>
  );
}
