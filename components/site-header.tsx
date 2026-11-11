import Link from "next/link";
import { auth, signOut } from "@/auth";
import styles from "./site-header.module.css";

export async function SiteHeader() {
  const session = await auth();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          Bolove
        </Link>
        <nav className={styles.nav}>
          <Link href="/pricing">Priser</Link>
          {session?.user ? (
            <>
              <Link href="/solkalkulator">Solkalkulator</Link>
              <Link href="/kart">Kart</Link>
              <Link href="/lanekalkulator">Lånekalkulator</Link>
              <Link href="/eierbrok">Eierbrøk</Link>
              <Link href="/reisetid">Reisetid</Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className={styles.linkButton}>
                  Logg ut
                </button>
              </form>
            </>
          ) : (
            <Link href="/logg-inn">Logg inn</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
