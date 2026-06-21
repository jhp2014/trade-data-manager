"use client";

import { useEffect } from "react";
import styles from "./CopyToast.module.css";

/**
 * 짧게 떴다 사라지는 복사 알림. key 로 새 메시지마다 리마운트되어 타이머가 다시 돈다.
 */
export function CopyToast({ text, onDone }: { text: string; onDone: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDone, 1800);
        return () => clearTimeout(t);
    }, [onDone]);
    return (
        <div className={styles.toast} role="status">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12l5 5L20 6" />
            </svg>
            <span>{text}</span>
        </div>
    );
}
