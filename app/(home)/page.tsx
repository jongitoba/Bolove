import { Fraunces, Inter } from "next/font/google";
import { auth } from "@/auth";
import HomeHeader from "./HomeHeader";
import HomeContent from "./HomeContent";
import styles from "./page.module.css";

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

export default async function HomePage() {
  const session = await auth();
  const expiresAt = session?.user?.accessExpiresAt
    ? new Date(session.user.accessExpiresAt)
    : null;
  const hasAccess = !!expiresAt && expiresAt > new Date();

  return (
    <div className={`${styles.page} ${fraunces.variable} ${inter.variable}`}>
      <HomeHeader />
      <HomeContent hasAccess={hasAccess} />
    </div>
  );
}
