"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChartModalStore } from "@/stores/useChartModalStore";
import { usePeerListModalStore } from "@/stores/usePeerListModalStore";
import { useChartPreview } from "@/hooks/useChartPreview";
import { useShortcut } from "@/hooks/useShortcut";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useFilterState } from "@/hooks/useFilterState";
import { useUiStore } from "@/stores/useUiStore";
import { composeUnix } from "@/lib/serialization";
import { RealDailyChart } from "./RealDailyChart";
import { RealMinuteChart } from "./RealMinuteChart";
import { RealThemeOverlayChart } from "./RealThemeOverlayChart";
import type { ActivePredicateInstance } from "./RealThemeOverlayChart";
import type { MemberPredicate } from "@/lib/member/predicate";
import styles from "./ChartModal.module.css";

const TAB_ORDER = ["minute", "daily", "overlay"] as const;
type Tab = typeof TAB_ORDER[number];

const TAB_LABEL: Record<Tab, string> = {
    minute: "분봉",
    daily: "일봉",
    overlay: "테마 오버레이",
};

export function ChartModal() {
    const target = useChartModalStore((s) => s.target);
    const close = useChartModalStore((s) => s.close);
    const openPeerList = usePeerListModalStore((s) => s.open);
    const [tab, setTab] = useState<Tab>("minute");

    const mode = useUiStore((s) => s.chartPriceMode);
    const setMode = useUiStore((s) => s.setChartPriceMode);

    // 데이터 조회: (stockCode, tradeDate) 만 사용 (tradeTime 은 마커용으로만 사용)
    const queryParams = target
        ? { stockCode: target.stockCode, tradeDate: target.tradeDate }
        : null;
    const { data, isLoading } = useChartPreview(queryParams);

    // 마커 시각은 클라이언트에서 계산
    const markerTime = useMemo(
        () => (target ? composeUnix(target.tradeDate, target.tradeTime) : null),
        [target],
    );

    // 현재 row 의 테마에 해당하는 오버레이만 선택
    const activeTheme = useMemo(() => {
        if (!data || !target) return null;
        return data.themes.find((t) => t.themeId === target.themeId) ?? null;
    }, [data, target]);

    const { instances } = useFilterState();

    const activePredicateInstances = useMemo<ActivePredicateInstance[]>(
        () =>
            instances
                .filter((i) => i.kind === "activeMembersInTheme")
                .map((inst, idx) => {
                    const value = inst.value as { predicate: MemberPredicate; countMin: number };
                    return { id: inst.id, label: `Act#${idx + 1}`, predicate: value.predicate };
                }),
        [instances],
    );

    const activePoolsForChart = useMemo(
        () => target?.activePools ?? [],
        [target],
    );

    const isOpen = !!target;

    const nextTab = useCallback((e: KeyboardEvent) => {
        e.preventDefault();
        setTab((prev) => {
            const idx = TAB_ORDER.indexOf(prev);
            return TAB_ORDER[(idx + 1) % TAB_ORDER.length];
        });
    }, []);

    const jumpToTab = useCallback((e: KeyboardEvent) => {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < TAB_ORDER.length) {
            setTab(TAB_ORDER[idx]);
        }
    }, []);

    const toggleMode = useCallback((e: KeyboardEvent) => {
        e.preventDefault();
        setMode(mode === "krx" ? "nxt" : "krx");
    }, [mode, setMode]);

    /**
     * 헤더 테마 chip 클릭과 동일 동작.
     *  - ChartModal 을 닫고
     *  - 그 themeId 로 PeerListModal 을 fetch 모드로 연다 (entries undefined).
     *  - sourceRow 에는 현재 ChartModal 의 종목/날짜/시각/priceLines 를 그대로 전달.
     *    PeerListModal 의 self row 를 다시 누르면 같은 차트를 같은 priceLines 로 다시 열 수 있음.
     */
    const openPeerListForTheme = useCallback(
        (themeId: string, themeName: string) => {
            if (!target) return;
            openPeerList({
                kind: "theme",
                headerChip: `#${themeName}`,
                entries: undefined,
                count: undefined,
                tradeDate: target.tradeDate,
                tradeTime: target.tradeTime,
                themeId,
                hasOptions: false,
                sourceRow: {
                    stockCode: target.stockCode,
                    themeId,
                    tradeDate: target.tradeDate,
                    tradeTime: target.tradeTime,
                    priceLines: target.priceLines,
                },
            });
            close();
        },
        [target, openPeerList, close],
    );

    // 백틱(`) — 현재 테마 chip 클릭과 동일하게 PeerListModal 진입
    const openCurrentThemePeerList = useCallback(
        (e: KeyboardEvent) => {
            e.preventDefault();
            if (!activeTheme) return;
            openPeerListForTheme(activeTheme.themeId, activeTheme.themeName);
        },
        [activeTheme, openPeerListForTheme],
    );

    useShortcut("Escape", close, { enabled: isOpen });
    useShortcut(" ", nextTab, { enabled: isOpen });
    useShortcut(["1", "2", "3"], jumpToTab, { enabled: isOpen });
    useShortcut("Tab", toggleMode, { enabled: isOpen });
    useShortcut("`", openCurrentThemePeerList, { enabled: isOpen });

    // body scroll lock: 스택 방식으로 PeerListModal 과 안전하게 공존
    useBodyScrollLock(isOpen);

    useEffect(() => {
        if (target) setTab("minute");
    }, [target]);

    if (!target) return null;

    return (
        <div className={styles.backdrop} onClick={close}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <span className={styles.stockName}>{target.stockName}</span>
                        <span className={styles.stockCode}>{target.stockCode}</span>
                        <span className={styles.meta}>
                            {target.tradeDate} {target.tradeTime}
                        </span>
                        {data && data.themes.length > 0 && (
                            <div className={styles.headerThemes}>
                                {data.themes.map((t) => {
                                    const isCurrent = t.themeId === target.themeId;
                                    return (
                                        <button
                                            key={t.themeId}
                                            type="button"
                                            className={`${styles.headerThemeChip} ${isCurrent ? styles.headerThemeChipCurrent : ""}`}
                                            onClick={() => openPeerListForTheme(t.themeId, t.themeName)}
                                            title={isCurrent ? "현재 테마 — 리스트 보기 (`)" : `#${t.themeName} 리스트 보기`}
                                        >
                                            #{t.themeName}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className={styles.tabs}>
                        <div className={styles.modeToggle}>
                            <button
                                type="button"
                                className={`${styles.modeBtn} ${mode === "krx" ? styles.modeBtnActive : ""}`}
                                onClick={() => setMode("krx")}
                            >
                                KRX
                            </button>
                            <button
                                type="button"
                                className={`${styles.modeBtn} ${mode === "nxt" ? styles.modeBtnActive : ""}`}
                                onClick={() => setMode("nxt")}
                            >
                                NXT
                            </button>
                        </div>
                        {TAB_ORDER.map((t) => (
                            <TabBtn key={t} active={tab === t} onClick={() => setTab(t)}>
                                {TAB_LABEL[t]}
                            </TabBtn>
                        ))}
                        <button type="button" className={styles.closeBtn} onClick={close}>
                            ✕
                        </button>
                    </div>
                </header>

                <div className={styles.body}>
                    <div className={styles.chartArea}>
                        {isLoading ? (
                            <div className={styles.loading}>차트 데이터 로딩중...</div>
                        ) : data ? (
                            <>
                                {tab === "minute" && (
                                    <RealMinuteChart
                                        candles={data.minute}
                                        markerTime={markerTime}
                                        themeOverlay={activeTheme?.overlaySeries ?? []}
                                        priceLines={target.priceLines}
                                        prevCloseKrx={data.prevCloseKrx}
                                        prevCloseNxt={data.prevCloseNxt}
                                    />
                                )}
                                {tab === "daily" && (
                                    <RealDailyChart
                                        candles={data.daily}
                                        priceLines={target.priceLines}
                                    />
                                )}
                                {tab === "overlay" && (
                                    <RealThemeOverlayChart
                                        data={activeTheme?.overlaySeries ?? []}
                                        markerTime={markerTime}
                                        activePredicateInstances={activePredicateInstances}
                                        activePools={activePoolsForChart}
                                    />
                                )}
                            </>
                        ) : (
                            <div className={styles.loading}>데이터 없음</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function TabBtn({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className={`${styles.tab} ${active ? styles.tabActive : ""}`}
            onClick={onClick}
        >
            {children}
        </button>
    );
}
