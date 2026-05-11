"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChartModalStore } from "@/stores/useChartModalStore";
import { useChartPreview } from "@/hooks/useChartPreview";
import { useShortcut } from "@/hooks/useShortcut";
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

    useShortcut("Escape", close, { enabled: isOpen });
    useShortcut(" ", nextTab, { enabled: isOpen });
    useShortcut(["1", "2", "3"], jumpToTab, { enabled: isOpen });

    useEffect(() => {
        if (!target) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [target]);

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
                        {activeTheme && (
                            <div className={styles.headerThemes}>
                                <span className={styles.headerThemeChip}>
                                    #{activeTheme.themeName}
                                </span>
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
