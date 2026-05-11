"use client";

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { parseChartTarget, type ParseChartTargetResult } from "@/lib/parser";
import styles from "./StockChart.module.css";

export function StockChartClient() {
    const [raw, setRaw] = useState("");

    // 미리보기는 디바운스 (타이핑 중 깜빡임 방지)
    const debouncedRaw = useDebouncedValue(raw, 300);
    const preview = useMemo(() => parseChartTarget(debouncedRaw), [debouncedRaw]);

    // 엔터/버튼 누른 순간만 차트 모달 트리거에 사용할 commit 상태.
    // 다음 단계(Step 8)에서 useStockThemes + 모달 오픈 로직과 연결한다.
    const [, setCommitted] = useState("");
    const [, setCommitNonce] = useState(0);

    const commit = useCallback(() => {
        // 현재 입력을 즉시 파싱해 확정. 동일 값이라도 nonce 를 올려서
        // "다시 누르면 다시 모달 OPEN" 시맨틱을 보장한다.
        setCommitted(raw);
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
                        placeholder="예: 2026.04.20_005930_엑스게이트_KRX  /  079550,비에이치아이,2026-04-20,..."
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
            </div>
        </div>
    );
}

function PreviewLine({ preview }: { preview: ParseChartTargetResult }) {
    if (preview.ok) {
        return (
            <div className={`${styles.preview} ${styles.previewOk}`}>
                ✓ {preview.target.stockCode} · {preview.target.tradeDate}
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
