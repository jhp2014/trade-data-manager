import Link from "next/link";
import styles from "./Header.module.css";
import { ModeTabs } from "./ModeTabs";

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Link href="/stock-chart" className={styles.logo}>
          Data View
        </Link>
        <ModeTabs />
      </div>
      <div className={styles.right} />
    </header>
  );
}
