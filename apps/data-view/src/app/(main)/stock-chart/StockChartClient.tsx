"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useStockThemes } from "@/hooks/useStockThemes";
import { parseChartTarget, type ParseChartTargetResult } from "@/lib/parser";
import { useChartModalStore } from "@/stores/useChartModalStore";
import { ChartModal } from "@/components/chart/ChartModal";
import type { ChartThemeMeta, StockThemesDTO } from "@/actions/chartPreview";
import styles from "./StockChart.module.css";

const DEFAULT_TRADE_TIME = "15:30:00";

export function StockChartClient() {
    const [raw, setRaw] = useState("");

    // 미리보기는 디바운스 (타이핑 중 깜빡임 방지)
    const debouncedRaw = useDebouncedValue(raw, 300);
    const preview = useMemo(() => parseChartTarget(debouncedRaw), [debouncedRaw]);

    // 엔터/버튼으로 확정된 파싱 결과 — 테마 조회 및 모달 트리거에 사용.
    const [committedTarget, setCommittedTarget] = useState<{
        stockCode: string;
        tradeDate: string;
        priceLines?: number[];
    } | null>(null);
    // 동일 입력으로도 다시 트리거할 수 있도록 nonce 카운터를 둔다.
    const [commitNonce, setCommitNonce] = useState(0);

    const open = useChartModalStore((s) => s.open);

    const themesQuery = useStockThemes(committedTarget);
    const themesData: StockThemesDTO | undefined = themesQuery.data;

    const commit = useCallback(() => {
        const result = parseChartTarget(raw);
        if (!result.ok) return; // 파싱 실패 시 트리거 무시 (버튼은 미리보기 기준으로 disabled)
        setCommittedTarget({
            stockCode: result.target.stockCode,
            tradeDate: result.target.tradeDate,
            priceLines: result.target.priceLines,
        });
        setCommitNonce((n) => n + 1);
    }, [raw]);

    const onKeyDown = useCallback(
        (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                commit();
            }
        },
        [commit],
    );

    const openWithTheme = useCallback(
        (themeId: string) => {
            if (!committedTarget || !themesData) return;
            open({
                stockCode: committedTarget.stockCode,
                stockName: themesData.selfStockName,
                tradeDate: committedTarget.tradeDate,
                tradeTime: DEFAULT_TRADE_TIME,
                themeId,
                priceLines: committedTarget.priceLines?.length
                    ? { TARGET: committedTarget.priceLines }
                    : undefined,
            });
        },
        [committedTarget, themesData, open],
    );

    // 테마 1개일 때만, 엔터/버튼 commit nonce 변경 시점에 모달 자동 OPEN.
    // (테마 2개 이상이면 사용자 칩 선택을 기다린다.)
    const lastHandledNonceRef = useRef(0);
    useEffect(() => {
        if (commitNonce === 0) return;
        if (commitNonce === lastHandledNonceRef.current) return;
        if (!committedTarget || !themesData) return;
        if (themesQuery.isFetching) return; // 새 조회가 끝날 때까지 보류
        lastHandledNonceRef.current = commitNonce;
        if (themesData.themes.length === 1) {
            openWithTheme(themesData.themes[0].themeId);
        }
        // length >= 2: 칩 UI 가 표시된 상태 — 사용자 선택을 기다림.
    }, [commitNonce, committedTarget, themesData, themesQuery.isFetching, openWithTheme]);

    const canCommit = preview.ok;
    const hidePreview = debouncedRaw.trim() === "";

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <h2 className={styles.title}>Stock Chart</h2>

                <div className={styles.inputRow}>
                    <input
                        type="text"
                        className={styles.field}
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="예: 2026-05-11&#9;'009540&#9;HD한국조선해양  /  079550,비에이치아이,2026-04-20  /  ... -pl 51000|41000"
                        aria-label="종목·날짜 입력"
                        spellCheck={false}
                        autoComplete="off"
                    />
                    <button
                        type="button"
                        className={styles.enterBtn}
                        onClick={commit}
                        disabled={!canCommit}
                        title="Enter 또는 버튼 클릭으로 차트 열기"
                        aria-label="차트 열기"
                    >
                        ⏎
                    </button>
                </div>

                {!hidePreview && <PreviewLine preview={preview} />}

                <ThemeArea
                    committed={committedTarget}
                    isLoading={themesQuery.isLoading}
                    error={themesQuery.error}
                    themes={themesData?.themes ?? null}
                    onSelect={openWithTheme}
                />
            </div>

            <ChartModal />
        </div>
    );
}

/* ───────────────────────────── 보조 컴포넌트 ───────────────────────────── */

function PreviewLine({ preview }: { preview: ParseChartTargetResult }) {
    if (preview.ok) {
        const plText = preview.target.priceLines?.length
            ? ` · pl: ${preview.target.priceLines.join(", ")}`
            : "";
        return (
            <div className={`${styles.preview} ${styles.previewOk}`}>
                ✓ {preview.target.stockCode} · {preview.target.tradeDate}{plText}
                <span className={styles.previewParser}>({preview.usedParser.label})</span>
            </div>
        );
    }

    if (preview.reason === "empty") return null;

    const message =
        preview.reason === "no-match"
            ? "✗ 형식을 인식하지 못했습니다."
            : "✗ 종목코드(6자리 숫자) 또는 날짜를 찾을 수 없습니다.";

    return <div className={`${styles.preview} ${styles.previewErr}`}>{message}</div>;
}

function ThemeArea({
    committed,
    isLoading,
    error,
    themes,
    onSelect,
}: {
    committed: { stockCode: string; tradeDate: string } | null;
    isLoading: boolean;
    error: unknown;
    themes: ChartThemeMeta[] | null;
    onSelect: (themeId: string) => void;
}) {
    if (!committed) return null;

    if (isLoading) {
        return <div className={styles.hint}>테마 불러오는 중…</div>;
    }

    if (error) {
        const message =
            error instanceof Error ? error.message : "데이터를 불러올 수 없습니다.";
        return <div className={styles.errorBox}>✗ {message}</div>;
    }

    if (!themes || themes.length === 0) return null;

    if (themes.length === 1) {
        return (
            <div className={styles.hint}>
                테마 1개 — 엔터를 다시 누르면 차트를 엽니다.
            </div>
        );
    }

    return (
        <div className={styles.chips}>
            {themes.map((t) => (
                <button
                    key={t.themeId}
                    type="button"
                    className={styles.chip}
                    onClick={() => onSelect(t.themeId)}
                >
                    #{t.themeName}
                </button>
            ))}
        </div>
    );
}
