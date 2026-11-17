import { Fraunces, Inter } from "next/font/google";
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

export default function HomePage() {
  return (
    <div className={`${styles.page} ${fraunces.variable} ${inter.variable}`}>
      <HomeHeader />
      <HomeContent />
    </div>
  );
}
