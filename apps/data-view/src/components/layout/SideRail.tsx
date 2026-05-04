"use client";

import styles from "./SideRail.module.css";
import { useUiStore, type SidePanelKey } from "@/stores/useUiStore";
import {
  StarIcon,
  NoteIcon,
  BellIcon,
  SettingsIcon,
} from "@/components/icons";

const items: Array<{ key: SidePanelKey; label: string; Icon: any }> = [
  { key: "favorite", label: "즐겨찾기", Icon: StarIcon },
  { key: "note", label: "메모", Icon: NoteIcon },
  { key: "alert", label: "알림", Icon: BellIcon },
  { key: "settings", label: "설정", Icon: SettingsIcon },
];

export function SideRail() {
  const { activeSidePanel, sidePanelOpen, toggleSidePanel } = useUiStore();

  return (
    <aside className={styles.rail}>
      {items.map(({ key, label, Icon }) => {
        const active = sidePanelOpen && activeSidePanel === key;
        return (
          <button
            key={key}
            type="button"
            title={label}
            className={`${styles.btn} ${active ? styles.active : ""}`}
            onClick={() => toggleSidePanel(key)}
          >
            <Icon />
          </button>
        );
      })}
    </aside>
  );
}
