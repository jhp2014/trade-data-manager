"use client";

import { currentMonth, useWorkbench } from "@/stores/workbench";
import styles from "./WorkbenchSettingsModal.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export function WorkbenchSettingsModal() {
    const open = useWorkbench((s) => s.settingsOpen);
    const close = useWorkbench((s) => s.closeSettings);
    const mode = useWorkbench((s) => s.mode);
    const setMode = useWorkbench((s) => s.setMode);

    if (!open) return null;

    const month = mode.kind === "review-month" ? mode.month : currentMonth();

    return (
        <div className={styles.overlay} onClick={close}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <header className={styles.head}>
                    <h2>작업대 설정</h2>
                    <button className={styles.x} onClick={close} aria-label="닫기">
                        ×
                    </button>
                </header>

                <section className={styles.section}>
                    <h3>작업셋</h3>
                    <div className={styles.options}>
                        <label className={cx(styles.opt, mode.kind === "review-month" && styles.on)}>
                            <input
                                type="radio"
                                name="workingset"
                                checked={mode.kind === "review-month"}
                                onChange={() => setMode({ kind: "review-month", month })}
                            />
                            <span>월별</span>
                            <input
                                type="month"
                                className={styles.month}
                                value={month}
                                disabled={mode.kind !== "review-month"}
                                onChange={(e) => setMode({ kind: "review-month", month: e.target.value })}
                            />
                        </label>
                        <label className={cx(styles.opt, mode.kind === "sheet" && styles.on)}>
                            <input
                                type="radio"
                                name="workingset"
                                checked={mode.kind === "sheet"}
                                onChange={() => setMode({ kind: "sheet" })}
                            />
                            <span>시트</span>
                        </label>
                        <label className={cx(styles.opt, mode.kind === "snapshot" && styles.on)}>
                            <input
                                type="radio"
                                name="workingset"
                                checked={mode.kind === "snapshot"}
                                onChange={() => setMode({ kind: "snapshot" })}
                            />
                            <span>연결된 것만</span>
                        </label>
                    </div>
                </section>

                <section className={styles.section}>
                    <h3>시트 설정</h3>
                    <p className={styles.muted}>
                        읽을 시트 ID · 탭 · 범위 · 동기화 옵션은 추후 추가됩니다. 현재는 환경설정(.env)의
                        시트를 사용합니다.
                    </p>
                </section>
            </div>
        </div>
    );
}
