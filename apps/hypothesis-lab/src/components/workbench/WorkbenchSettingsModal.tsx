"use client";

import { useEffect, useState } from "react";
import { listSheetTabsAction } from "@/actions/workbench";
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

    const [tabs, setTabs] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(false);

    // 모달 열릴 때 1회 탭 목록 fetch(읽기 전용). 닫히면 다음 열림에 다시 불러오도록 리셋.
    useEffect(() => {
        if (!open) {
            setTabs(null);
            return;
        }
        let alive = true;
        setLoading(true);
        listSheetTabsAction()
            .then((t) => alive && setTabs(t))
            .catch(() => alive && setTabs([]))
            .finally(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, [open]);

    if (!open) return null;

    const month = mode.kind === "review-month" ? mode.month : currentMonth();
    const selectedTab = mode.kind === "sheet" ? mode.tab : undefined;

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
                                onChange={() => setMode({ kind: "sheet", tab: selectedTab })}
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
                    <h3>시트 탭</h3>
                    {loading ? (
                        <p className={styles.muted}>탭 목록 불러오는 중…</p>
                    ) : !tabs || tabs.length === 0 ? (
                        <p className={styles.muted}>
                            불러올 탭이 없습니다. 시트 ID·자격증명(.env) 설정을 확인하세요.
                        </p>
                    ) : (
                        <>
                            <div className={styles.tabList}>
                                {tabs.map((t) => {
                                    const active = mode.kind === "sheet" && selectedTab === t;
                                    return (
                                        <button
                                            key={t}
                                            type="button"
                                            className={cx(styles.tab, active && styles.tabOn)}
                                            onClick={() => setMode({ kind: "sheet", tab: t })}
                                        >
                                            {t}
                                            {active && <span className={styles.tabBadge}>읽는 중</span>}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className={styles.muted}>
                                탭을 고르면 작업셋이 “시트” 모드로 전환됩니다. 미선택 시 기본 탭(.env)을
                                사용합니다.
                            </p>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
