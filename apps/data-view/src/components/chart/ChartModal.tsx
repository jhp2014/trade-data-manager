"use client";

import { useEffect, useState } from "react";
import { useChartModalStore } from "@/stores/useChartModalStore";
import { useChartPreview } from "@/hooks/useChartPreview";
import { RealDailyChart } from "./RealDailyChart";
import { RealMinuteChart } from "./RealMinuteChart";
import { RealThemeOverlayChart } from "./RealThemeOverlayChart";
import styles from "./ChartModal.module.css";

type Tab = "minute" | "daily" | "overlay";

export function ChartModal() {
    const target = useChartModalStore((s) => s.target);
    const close = useChartModalStore((s) => s.close);
    const [tab, setTab] = useState<Tab>("minute");

    const { data, isLoading } = useChartPreview(target);

    // ESC로 닫기
    useEffect(() => {
        if (!target) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [target, close]);

    // body scroll lock
    useEffect(() => {
        if (!target) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [target]);

    // 모달 열릴 때 default tab = minute
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
                    </div>
                    <div className={styles.tabs}>
                        <TabBtn active={tab === "minute"} onClick={() => setTab("minute")}>
                            분봉
                        </TabBtn>
                        <TabBtn active={tab === "daily"} onClick={() => setTab("daily")}>
                            일봉
                        </TabBtn>
                        <TabBtn active={tab === "overlay"} onClick={() => setTab("overlay")}>
                            테마 오버레이
                        </TabBtn>
                        <button type="button" className={styles.closeBtn} onClick={close}>
                            ✕
                        </button>
                    </div>
                </header>

                <div className={styles.body}>
                    {isLoading ? (
                        <div className={styles.loading}>차트 로딩 중...</div>
                    ) : data ? (
                        <>
                            {tab === "minute" && (
                                <RealMinuteChart
                                    candles={data.minute}
                                    height={680}
                                    markerTime={data.markerTime}
                                />
                            )}
                            {tab === "daily" && (
                                <RealDailyChart candles={data.daily} height={680} />
                            )}
                            {tab === "overlay" && (
                                <RealThemeOverlayChart
                                    data={data.themeOverlay}
                                    height={680}
                                    markerTime={data.markerTime}
                                />
                            )}
                        </>
                    ) : (
                        <div className={styles.loading}>데이터 없음</div>
                    )}
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
