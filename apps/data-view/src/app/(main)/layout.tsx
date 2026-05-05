import { Header } from "@/components/layout/Header";
import { SideRail } from "@/components/layout/SideRail";
import { SidePanel } from "@/components/layout/SidePanel";
import styles from "./layout.module.css";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>
      <SideRail />
      <SidePanel />
    </div>
  );
}
