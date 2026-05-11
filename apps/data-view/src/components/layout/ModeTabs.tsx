"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./ModeTabs.module.css";

const tabs = [
  { href: "/filtered", label: "Filtered" },
  { href: "/stock-chart", label: "Stock Chart" },
];

export function ModeTabs() {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs}>
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`${styles.tab} ${active ? styles.active : ""}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
