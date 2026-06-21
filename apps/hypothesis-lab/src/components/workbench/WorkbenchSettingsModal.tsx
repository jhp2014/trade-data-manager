"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listSheetTabsAction, loadSnapshotAction } from "@/actions/workbench";
import { deleteRelationsByTypeAction } from "@/actions/edit";
import { OUTCOME_COLORS, type OutcomeColor } from "@/domain/outcome";
import {
    RELATION_COLOR_HEX,
    dashArray,
    type RelationTypeDef,
} from "@/domain/relationType";
import { useOutcomeTypes } from "@/stores/outcomeTypes";
import { useRelationTypes } from "@/stores/relationTypes";
import { useWorkbench } from "@/stores/workbench";
import { RelationTypeEditorModal } from "./RelationTypeEditorModal";
import styles from "./WorkbenchSettingsModal.module.css";

/** 목록 행의 미니 선 미리보기. */
function RelationMini({ def }: { def: RelationTypeDef }) {
    const stroke = RELATION_COLOR_HEX[def.color];
    const dash = dashArray(def.lineStyle);
    const arrowEnd = def.direction === "forward";
    const arrowStart = def.direction === "backward";
    return (
        <svg width="46" height="14" viewBox="0 0 46 14" aria-hidden>
            <line
                x1={arrowStart ? 8 : 3}
                y1="7"
                x2={arrowEnd ? 38 : 43}
                y2="7"
                stroke={stroke}
                strokeWidth="2"
                strokeDasharray={dash}
                strokeLinecap={def.lineStyle === "dotted" ? "round" : undefined}
            />
            {arrowEnd && <path d="M38,3 L44,7 L38,11 Z" fill={stroke} />}
            {arrowStart && <path d="M8,3 L2,7 L8,11 Z" fill={stroke} />}
        </svg>
    );
}

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export function WorkbenchSettingsModal() {
    const open = useWorkbench((s) => s.settingsOpen);
    const close = useWorkbench((s) => s.closeSettings);
    const sheetTab = useWorkbench((s) => s.sheetTab);
    const setSheetTab = useWorkbench((s) => s.setSheetTab);
    const historyMax = useWorkbench((s) => s.historyMax);
    const setHistoryMax = useWorkbench((s) => s.setHistoryMax);
    const openHistoryModal = useWorkbench((s) => s.openHistoryModal);
    const openHelp = useWorkbench((s) => s.openHelp);

    const outcomeOptions = useOutcomeTypes((s) => s.options);
    const addOutcome = useOutcomeTypes((s) => s.addOption);
    const removeOutcome = useOutcomeTypes((s) => s.removeOption);
    const [ocLabel, setOcLabel] = useState("");
    const [ocColor, setOcColor] = useState<OutcomeColor>("green");

    const relationTypes = useRelationTypes((s) => s.options);
    const removeRelationType = useRelationTypes((s) => s.removeOption);
    const [editing, setEditing] = useState<RelationTypeDef | "new" | null>(null);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const queryClient = useQueryClient();
    const snapshot = useQuery({
        queryKey: ["snapshot"],
        queryFn: () => loadSnapshotAction(),
        enabled: open,
    });
    const relCounts = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of snapshot.data?.hypothesisRelations ?? []) {
            m.set(r.relationType, (m.get(r.relationType) ?? 0) + 1);
        }
        return m;
    }, [snapshot.data]);

    const [tabs, setTabs] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(false);

    function onDeleteRelationType(value: string) {
        if ((relCounts.get(value) ?? 0) === 0) {
            removeRelationType(value);
            return;
        }
        setPendingDelete(value);
    }

    async function confirmDeleteRelationType(value: string) {
        setDeleting(true);
        try {
            await deleteRelationsByTypeAction(value);
            removeRelationType(value);
            queryClient.invalidateQueries({ queryKey: ["snapshot"] });
            queryClient.invalidateQueries({ queryKey: ["workingSet"] });
        } finally {
            setDeleting(false);
            setPendingDelete(null);
        }
    }

    function submitOutcome() {
        if (addOutcome(ocLabel, ocColor)) setOcLabel("");
    }

    // 탭 목록 fetch(읽기 전용). 모달 열릴 때 + 새로고침 버튼에서 호출.
    const loadTabs = useCallback(() => {
        setLoading(true);
        return listSheetTabsAction()
            .then((t) => setTabs(t))
            .catch(() => setTabs([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!open) {
            setTabs(null);
            setEditing(null);
            setPendingDelete(null);
            return;
        }
        loadTabs();
    }, [open, loadTabs]);

    if (!open) return null;

    return (
        <>
        <div className={styles.overlay} onClick={close}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <header className={styles.head}>
                    <h2>작업대 설정</h2>
                    <div className={styles.headActions}>
                        <button
                            className={styles.helpBtn}
                            onClick={openHelp}
                            title="단축키·필터·검색 도움말"
                        >
                            도움말
                        </button>
                        <button className={styles.x} onClick={close} aria-label="닫기">
                            ×
                        </button>
                    </div>
                </header>

                <section className={styles.section}>
                    <div className={styles.sectionHead}>
                        <h3>시트 탭</h3>
                        <button
                            type="button"
                            className={styles.refreshTabs}
                            onClick={() => loadTabs()}
                            disabled={loading}
                            title="시트 탭 목록 새로고침"
                            aria-label="시트 탭 목록 새로고침"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                                <path d="M21 3v5h-5" />
                            </svg>
                        </button>
                    </div>
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
                    <div className={styles.sectionHead}>
                        <h3>관계 종류</h3>
                        <button
                            type="button"
                            className={styles.refreshTabs}
                            onClick={() => setEditing("new")}
                            title="관계 종류 추가"
                            aria-label="관계 종류 추가"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                        </button>
                    </div>
                    <div className={styles.rtList}>
                        {relationTypes.map((r) => {
                            const count = relCounts.get(r.value) ?? 0;
                            const confirming = pendingDelete === r.value;
                            return (
                                <div key={r.value} className={styles.rtRow}>
                                    <RelationMini def={r} />
                                    <span className={styles.rtLabel}>{r.label}</span>
                                    {count > 0 && <span className={styles.rtCount}>{count}</span>}
                                    {confirming ? (
                                        <span className={styles.rtConfirm}>
                                            <span className={styles.rtConfirmMsg}>
                                                {count}개 사용 중 — 함께 삭제?
                                            </span>
                                            <button
                                                className={styles.rtDanger}
                                                disabled={deleting}
                                                onClick={() => confirmDeleteRelationType(r.value)}
                                            >
                                                삭제
                                            </button>
                                            <button
                                                className={styles.rtCancel}
                                                disabled={deleting}
                                                onClick={() => setPendingDelete(null)}
                                            >
                                                취소
                                            </button>
                                        </span>
                                    ) : (
                                        <>
                                            <button
                                                className={styles.rtEdit}
                                                onClick={() => setEditing(r)}
                                                aria-label={`${r.label} 편집`}
                                            >
                                                편집
                                            </button>
                                            <button
                                                className={styles.rtRemove}
                                                onClick={() => onDeleteRelationType(r.value)}
                                                aria-label={`${r.label} 삭제`}
                                            >
                                                ×
                                            </button>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                        {relationTypes.length === 0 && (
                            <p className={styles.muted}>관계 종류가 없습니다. +로 추가하세요.</p>
                        )}
                    </div>
                    <p className={styles.muted}>
                        그래프 간선의 색·선·화살표·선 타입을 종류별로 정합니다. 사용 중인 종류는
                        삭제 시 해당 관계도 함께 지웁니다.
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
        <RelationTypeEditorModal target={editing} onClose={() => setEditing(null)} />
        </>
    );
}
