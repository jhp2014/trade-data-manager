"use client";

import styles from "./SidePanel.module.css";
import { useUiStore, type SidePanelKey } from "@/stores/useUiStore";

const titles: Record<SidePanelKey, string> = {
  favorite: "즐겨찾기",
  note: "메모",
  alert: "알림",
  settings: "설정",
};

export function SidePanel() {
  const { sidePanelOpen, activeSidePanel, closeSidePanel } = useUiStore();

  const title = activeSidePanel ? titles[activeSidePanel] : "";

  return (
    <section
      className={`${styles.panel} ${sidePanelOpen ? styles.open : ""}`}
      aria-hidden={!sidePanelOpen}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={closeSidePanel}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.placeholder}>
          (mock) {title} 패널 — 추후 구현
        </div>
      </div>
    </section>
  );
}
