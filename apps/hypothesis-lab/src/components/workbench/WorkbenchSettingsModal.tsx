"use client";

import { useEffect, useState } from "react";
import { listSheetTabsAction } from "@/actions/workbench";
import { OUTCOME_COLORS, type OutcomeColor } from "@/domain/outcome";
import { useOutcomeTypes } from "@/stores/outcomeTypes";
import { useWorkbench } from "@/stores/workbench";
import styles from "./WorkbenchSettingsModal.module.css";

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export function WorkbenchSettingsModal() {
    const open = useWorkbench((s) => s.settingsOpen);
    const close = useWorkbench((s) => s.closeSettings);
    const month = useWorkbench((s) => s.month);
    const setMonth = useWorkbench((s) => s.setMonth);
    const sheetTab = useWorkbench((s) => s.sheetTab);
    const setSheetTab = useWorkbench((s) => s.setSheetTab);
    const historyMax = useWorkbench((s) => s.historyMax);
    const setHistoryMax = useWorkbench((s) => s.setHistoryMax);
    const openHistoryModal = useWorkbench((s) => s.openHistoryModal);

    const outcomeOptions = useOutcomeTypes((s) => s.options);
    const addOutcome = useOutcomeTypes((s) => s.addOption);
    const removeOutcome = useOutcomeTypes((s) => s.removeOption);
    const [ocLabel, setOcLabel] = useState("");
    const [ocColor, setOcColor] = useState<OutcomeColor>("green");

    const [tabs, setTabs] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(false);

    function submitOutcome() {
        if (addOutcome(ocLabel, ocColor)) setOcLabel("");
    }

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
                    <h3>월별 작업셋</h3>
                    <label className={styles.opt}>
                        <span>월 선택</span>
                        <input
                            type="month"
                            className={styles.month}
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                        />
                    </label>
                    <p className={styles.muted}>상단 레일의 월 탭이 이 달의 review point 를 표시합니다.</p>
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
                                <button
                                    type="button"
                                    className={cx(styles.tab, sheetTab === undefined && styles.tabOn)}
                                    onClick={() => setSheetTab(undefined)}
                                >
                                    기본(.env)
                                </button>
                                {tabs.map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        className={cx(styles.tab, sheetTab === t && styles.tabOn)}
                                        onClick={() => setSheetTab(t)}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                            <p className={styles.muted}>
                                상단 레일의 시트 탭이 읽을 탭입니다. 미선택 시 기본 탭(.env)을 사용합니다.
                            </p>
                        </>
                    )}
                </section>

                <section className={styles.section}>
                    <h3>결과(outcome) 종류</h3>
                    <div className={styles.ocList}>
                        {outcomeOptions.map((o) => (
                            <div key={o.value} className={styles.ocRow}>
                                <span className={styles.ocSwatch} data-color={o.color} />
                                <span className={styles.ocLabel}>{o.label}</span>
                                <button
                                    className={styles.ocRemove}
                                    onClick={() => removeOutcome(o.value)}
                                    aria-label={`${o.label} 삭제`}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className={styles.ocAdd}>
                        <input
                            className={styles.ocInput}
                            value={ocLabel}
                            placeholder="새 결과 이름"
                            maxLength={12}
                            onChange={(e) => setOcLabel(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submitOutcome();
                            }}
                        />
                        <div className={styles.ocColors}>
                            {OUTCOME_COLORS.map((col) => (
                                <button
                                    key={col}
                                    type="button"
                                    className={cx(styles.ocColor, ocColor === col && styles.ocColorOn)}
                                    data-color={col}
                                    onClick={() => setOcColor(col)}
                                    aria-label={`색 ${col}`}
                                />
                            ))}
                        </div>
                        <button
                            className={styles.ocAddBtn}
                            onClick={submitOutcome}
                            disabled={ocLabel.trim() === ""}
                        >
                            추가
                        </button>
                    </div>
                    <p className={styles.muted}>
                        카드를 더블클릭해 결과를 지정합니다. 종류를 지워도 기존 케이스 값은 보존됩니다.
                    </p>
                </section>

                <section className={styles.section}>
                    <h3>History 설정</h3>
                    <label className={styles.opt}>
                        <span>최대 보관 개수</span>
                        <input
                            type="number"
                            min={1}
                            className={styles.num}
                            value={historyMax}
                            onChange={(e) => setHistoryMax(Number(e.target.value))}
                        />
                    </label>
                    <button className={styles.manageBtn} onClick={openHistoryModal}>
                        History 목록 관리
                    </button>
                </section>
            </div>
        </div>
    );
}
