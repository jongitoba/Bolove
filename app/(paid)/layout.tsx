import { SiteHeader } from "@/components/site-header";
import styles from "./layout.module.css";

// Access control for everything in this group lives in middleware.ts, which
// matches /solkalkulator/:path* and /kart/:path*. Any new paid tool just
// needs its folder added under (paid)/ and to middleware's matcher.
//
// The shell is its own bounded 100dvh flex column (independent of the
// global body sizing in app/globals.css, which marketing pages rely on for
// normal scrolling) so a full-height tool like /kart can fill exactly the
// space below the header via `height: 100%`, with no hardcoded header
// height. Plain-content pages like /solkalkulator are unaffected - they
// just render at their natural height inside the flex column.
export default function PaidLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={styles.shell}>
      <SiteHeader />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
