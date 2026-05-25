"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    usePeerListModalStore,
    buildEntriesFromSnapshot,
} from "@/stores/usePeerListModalStore";
import { useChartModalStore } from "@/stores/useChartModalStore";
import { useShortcut } from "@/hooks/useShortcut";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useHoverAnchor } from "@/hooks/useHoverAnchor";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePeerListSnapshot } from "@/hooks/usePeerListSnapshot";
import { COLUMNS } from "./columns/definitions";
import { buildMetricsGridTemplate } from "@/lib/columns/gridTemplate";
import { RowHoverPanel } from "./RowHoverPanel";
import { PeerRowAmountCounts } from "./PeerRowAmountCounts";
import {
    TimeSlider,
    timeStringToMinutes,
    minutesToTimeString,
    clampMinutes,
} from "./TimeSlider";
import type { PeerListEntry } from "@/stores/usePeerListModalStore";
import styles from "./PeerListModal.module.css";

const FETCH_DEBOUNCE_MS = 300;

/**
 * 펼침 영역(테마 peer / Active 풀)을 모달로 표시한다.
 *
 *  - 본인 행 포함, 순위 순서대로 표시
 *  - 본인 행은 accent 배경으로 강조
 *  - row 클릭 → 이 모달을 닫고 ChartModal 만 띄운다 (모달 1개 정책).
 *  - ESC: 단순히 PeerListModal 을 닫는다.
 *
 * 데이터 소스:
 *  - target.entries 가 있고 슬라이더 시간이 초기값과 같으면 그대로 표시
 *  - 그 외(슬라이더로 시간 변경했거나 chip 진입) 에는 useQuery 결과 사용
 *
 * 시간 슬라이더 (Theme 모드 전용):
 *  - 08:00 ~ 20:00, 1분 step, 마우스 휠 지원
 *  - 디바운스 300ms 후 fetchPeerListAction 호출 (React Query 캐시)
 *  - row 클릭 시 ChartModal 에 현재 슬라이더 시간을 전달
 */
export function PeerListModal() {
    const target = usePeerListModalStore((s) => s.target);
    const close = usePeerListModalStore((s) => s.close);

    const isOpen = !!target;

    useBodyScrollLock(isOpen);

    const handleEsc = useCallback(() => {
        close();
    }, [close]);

    useShortcut("Escape", handleEsc, { enabled: isOpen });

    // 슬라이더 로컬 상태 (theme 모드에서만 의미가 있지만, hooks 일관성을 위해
    // active 모드에서도 동일하게 둔다. active 모드는 슬라이더 UI 자체를 숨김.)
    const initialMinutes = target ? timeStringToMinutes(target.tradeTime) : null;
    const [minutes, setMinutes] = useState<number | null>(initialMinutes);

    // target 이 바뀔 때마다(=새로 열릴 때마다) 슬라이더 초기화
    useEffect(() => {
        setMinutes(target ? timeStringToMinutes(target.tradeTime) : null);
    }, [target]);

    // Shift+휠 → 시간 ±1분 (모달 전체 영역). 일반 휠은 list 스크롤 유지.
    // closure 캡처 회피용 ref + native passive=false listener.
    const modalRef = useRef<HTMLDivElement>(null);
    const minutesRef = useRef<number | null>(minutes);
    useEffect(() => {
        minutesRef.current = minutes;
    }, [minutes]);
    const isSliderActive = target?.kind === "theme";
    useEffect(() => {
        const el = modalRef.current;
        if (!el || !isSliderActive) return;
        const handler = (e: WheelEvent) => {
            if (!e.shiftKey) return;
            e.preventDefault();
            const cur = minutesRef.current;
            if (cur === null) return;
            const delta = e.deltaY > 0 ? -1 : 1; // 위로 굴리면 시간 증가
            const next = clampMinutes(cur + delta);
            if (next !== cur) setMinutes(next);
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, [isSliderActive]);

    const debouncedMinutes = useDebouncedValue(minutes, FETCH_DEBOUNCE_MS);

    const currentTime =
        minutes !== null ? minutesToTimeString(minutes) : target?.tradeTime ?? "";
    const queryTime =
        debouncedMinutes !== null
            ? minutesToTimeString(debouncedMinutes)
            : target?.tradeTime ?? "";

    const initialTime = target?.tradeTime ?? "";

    // entries 가 미리 채워져 있고 현재 시간이 초기값과 같으면 fetch 생략
    const useStatic =
        !!target?.entries && (!isSliderActive || currentTime === initialTime);

    const shouldFetch = !!target && !useStatic;
    const fetchParams = shouldFetch
        ? {
            stockCode: target!.sourceRow.stockCode,
            tradeDate: target!.tradeDate,
            tradeTime: queryTime,
            themeId: target!.themeId,
        }
        : null;
    const { data: fetched, isLoading: isFetching } = usePeerListSnapshot(fetchParams);

    const fetchedEntries = useMemo<PeerListEntry[] | null>(() => {
        if (!fetched) return null;
        return buildEntriesFromSnapshot(fetched.members, fetched.selfStockCode);
    }, [fetched]);

    if (!target) return null;

    // 표시 entries 결정:
    //  - static 모드: target.entries
    //  - fetch 모드: fetched 가 있으면 그것, 없으면 (디바운스 대기 중) target.entries 가 있으면 그걸로 가교
    const entries: PeerListEntry[] = useStatic
        ? target.entries!
        : fetchedEntries ?? target.entries ?? [];

    const count: number = useStatic
        ? target.count ?? target.entries!.length
        : fetched?.members.length ?? target.entries?.length ?? 0;

    const metricsGrid = buildMetricsGridTemplate(target.hasOptions);
    const selfStockCode = target.sourceRow.stockCode;
    const sourcePriceLines = target.sourceRow.priceLines;

    // entries 가 아예 없는 초기 fetch 만 "불러오는 중" 표시
    const isInitialFetching =
        shouldFetch && isFetching && !fetched && (!target.entries || !useStatic && !fetchedEntries);

    return (
        <div className={styles.backdrop} onClick={close}>
            <div
                className={styles.modal}
                onClick={(e) => e.stopPropagation()}
                ref={modalRef}
            >
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <span
                            className={`${styles.headerChip} ${target.kind === "active" ? styles.headerChipActive : ""}`}
                        >
                            {target.headerChip}
                        </span>
                        {target.headerSubtitle && (
                            <span className={styles.headerSubtitle}>
                                {target.headerSubtitle}
                            </span>
                        )}
                        <span className={styles.headerCount}>
                            {count} 종목
                        </span>
                    </div>
                    <div className={styles.headerRight}>
                        {/* 시간 슬라이더 — theme 모드 전용. Shift+휠로도 조작 가능 (모달 전체). */}
                        {isSliderActive && minutes !== null && (
                            <TimeSlider minutes={minutes} onMinutesChange={setMinutes} />
                        )}
                        <button
                            type="button"
                            className={styles.closeBtn}
                            onClick={close}
                            aria-label="닫기"
                        >
                            ✕
                        </button>
                    </div>
                </header>

                <div className={styles.listHeader}>
                    <div className={styles.listHeaderIdentity}>
                        <span className={styles.listHeaderLabel}>종목</span>
                    </div>
                    <div
                        className={styles.listHeaderMetrics}
                        style={{ gridTemplateColumns: metricsGrid }}
                    >
                        {COLUMNS.map((col) => (
                            <span key={col.id} className={styles.listHeaderLabel}>
                                {col.label}
                            </span>
                        ))}
                        {target.hasOptions && <span />}
                    </div>
                </div>

                <div className={styles.body}>
                    {isInitialFetching ? (
                        <div className={styles.emptyRow}>불러오는 중…</div>
                    ) : entries.length === 0 ? (
                        <div className={styles.emptyRow}>
                            {target.kind === "active"
                                ? "조건 통과 종목 없음"
                                : "데이터 없음"}
                        </div>
                    ) : (
                        entries.map((e) => (
                            <PeerListRow
                                key={`${e.member.stockCode}|${e.rank}`}
                                entry={e}
                                tradeDate={target.tradeDate}
                                tradeTime={currentTime}
                                themeId={target.themeId}
                                hasOptions={target.hasOptions}
                                metricsGrid={metricsGrid}
                                selfStockCode={selfStockCode}
                                sourcePriceLines={sourcePriceLines}
                                closeModal={close}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function PeerListRow({
    entry,
    tradeDate,
    tradeTime,
    themeId,
    hasOptions,
    metricsGrid,
    selfStockCode,
    sourcePriceLines,
    closeModal,
}: {
    entry: PeerListEntry;
    tradeDate: string;
    tradeTime: string;
    themeId: string;
    hasOptions: boolean;
    metricsGrid: string;
    selfStockCode: string;
    sourcePriceLines: Record<string, number[]> | undefined;
    closeModal: () => void;
}) {
    const open = useChartModalStore((s) => s.open);
    const { anchor, bind } = useHoverAnchor();
    const ctx = { tradeTime };

    const { member, rank, isSelf } = entry;

    return (
        <div
            className={`${styles.row} ${isSelf ? styles.rowSelf : ""}`}
            {...bind}
        >
            <div className={styles.identityCol}>
                <span className={`${styles.rank} ${isSelf ? styles.rankSelf : ""}`}>
                    {rank}
                </span>
                <div className={styles.stockInfo}>
                    <div className={styles.stockInfoTop}>
                        <button
                            type="button"
                            className={styles.stockBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                // 모달 1개 정책: PeerListModal 닫고 ChartModal 만 띄움
                                closeModal();
                                const isClickedSelf = member.stockCode === selfStockCode;
                                open({
                                    stockCode: member.stockCode,
                                    stockName: member.stockName,
                                    tradeDate,
                                    tradeTime,
                                    themeId,
                                    // self row 인 경우에만 sourceRow.priceLines 를 전달
                                    priceLines: isClickedSelf ? sourcePriceLines : undefined,
                                });
                            }}
                        >
                            <span className={styles.stockName}>{member.stockName}</span>
                            <span className={styles.stockCode}>{member.stockCode}</span>
                        </button>
                        {isSelf && <span className={styles.selfTag}>Main</span>}
                    </div>
                    <PeerRowAmountCounts distribution={member.amountDistribution} />
                </div>
            </div>
            <div
                className={styles.metricsCol}
                style={{ gridTemplateColumns: metricsGrid }}
            >
                {COLUMNS.map((col) => (
                    <div key={col.id}>{col.render(member, ctx)}</div>
                ))}
                {hasOptions && <div />}
            </div>

            <RowHoverPanel
                anchor={anchor}
                sourceFile=""
                distribution={member.amountDistributionBucket}
            />
        </div>
    );
}
