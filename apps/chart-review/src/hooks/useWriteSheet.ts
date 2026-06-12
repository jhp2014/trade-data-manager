import { useCallback } from "react";
import { postJson } from "@/lib/apiClient";
import { resolveFieldValue } from "@/lib/reviewFields";
import type { ReviewPoint } from "@/types/review";
import type { HistoryEntry } from "@/stores/useReviewStore";

type EffectiveStock = { stockCode: string; tradeDate: string; stockName?: string | null };

type UseWriteSheetParams = {
  /** 현재 쓰기 탭(null 이면 동작 안 함). */
  writeTab: string | null;
  /** 내보낼 컬럼 키 순서(f-append/init 헤더 공용). */
  exportFieldKeys: string[];
  /** f-append 가 값을 뽑을 현재 활성 타점. */
  activePoint: ReviewPoint;
  /** 히스토리/라벨용 현재 탐색 종목. */
  effectiveStock: EffectiveStock;
  pushHistory: (entry: HistoryEntry) => void;
  /** 결과 토스트(컴포넌트의 useStatusToast 와 공유). */
  showStatus: (message: string) => void;
};

/**
 * Write Tab(Google Sheet) 쓰기 유스케이스: f 키 append 와 헤더 초기화.
 * 토스트(showStatus)는 프리셋 적용 등과 공유하므로 주입받는다.
 */
export function useWriteSheet({
  writeTab,
  exportFieldKeys,
  activePoint,
  effectiveStock,
  pushHistory,
  showStatus,
}: UseWriteSheetParams) {
  // f 키: Write Tab 마지막 행에 현재 탐색 종목 데이터를 추가한다.
  // 낙관적: 키 입력 즉시 피드백(토스트/히스토리)하고, 실제 Sheets append 는
  // 백그라운드로 보낸다. 실패하면 토스트를 에러로 교체한다.
  const handleWriteAppend = useCallback(() => {
    if (!writeTab) return;
    const headers = exportFieldKeys;
    const values = headers.map((key) => resolveFieldValue(key, activePoint));
    const label = effectiveStock.stockName ?? effectiveStock.stockCode;

    pushHistory({
      stockCode: effectiveStock.stockCode,
      tradeDate: effectiveStock.tradeDate,
      stockName: effectiveStock.stockName ?? undefined,
    });
    showStatus(`✓ ${label} 추가됨`);

    void postJson("/api/review/write-sheet/append", { writeTab, headers, values }, "append 실패").catch(
      (err) => {
        showStatus(`✗ ${err instanceof Error ? err.message : "오류"}`);
      },
    );
  }, [writeTab, exportFieldKeys, activePoint, effectiveStock, pushHistory, showStatus]);

  // 쓰기 탭 초기화: 탭을 비우고 첫 행에 헤더를 기록한다(시트를 수동으로 다 지운 뒤 재시작용).
  const handleInitWriteTab = useCallback(async () => {
    if (!writeTab) return;
    const headers = exportFieldKeys;
    if (headers.length === 0) {
      showStatus("✗ 내보낼 필드(헤더)가 없습니다");
      return;
    }
    if (
      !window.confirm(
        `쓰기 탭 '${writeTab}'을 초기화하고 첫 행에 헤더를 기록할까요?\n기존 내용은 모두 지워집니다.`,
      )
    ) {
      return;
    }
    try {
      await postJson("/api/review/write-sheet/init-header", { writeTab, headers }, "초기화 실패");
      showStatus(`✓ '${writeTab}' 초기화됨`);
    } catch (err) {
      showStatus(`✗ ${err instanceof Error ? err.message : "오류"}`);
    }
  }, [writeTab, exportFieldKeys, showStatus]);

  return { handleWriteAppend, handleInitWriteTab };
}
