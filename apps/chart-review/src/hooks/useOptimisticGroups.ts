import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ReviewStockGroup } from "@/types/review";
import {
  upsertPointInGroups,
  removePointFromGroups,
  purgeManualKeyInGroups,
  renameManualKeyInGroups,
  type UpsertPointInput,
} from "@/lib/optimisticPoint";

type Params = {
  setGroups: Dispatch<SetStateAction<ReviewStockGroup[]>>;
  cacheRef: MutableRefObject<Map<string, ReviewStockGroup[]>>;
  readSource: "sheet" | "db";
  readTab: string;
};

/**
 * 서버 재조회 없이 현재 groups 와 (시트 모드일 때) 현재 탭 캐시를 함께 갱신하는
 * 낙관적 변이 묶음. 캐시까지 갱신해야 다른 탭에 다녀와도 변경이 유지된다.
 */
export function useOptimisticGroups({ setGroups, cacheRef, readSource, readTab }: Params) {
  const applyLocal = useCallback(
    (mutate: (prev: ReviewStockGroup[]) => ReviewStockGroup[]) => {
      setGroups((prev) => {
        const next = mutate(prev);
        if (next === prev) return prev;
        if (readSource === "sheet") cacheRef.current.set(readTab, next);
        return next;
      });
    },
    [setGroups, cacheRef, readSource, readTab],
  );

  const upsertPointLocal = useCallback(
    (input: UpsertPointInput) => applyLocal((prev) => upsertPointInGroups(prev, input)),
    [applyLocal],
  );

  const removePointLocal = useCallback(
    (reviewId: string) => applyLocal((prev) => removePointFromGroups(prev, reviewId)),
    [applyLocal],
  );

  const purgeManualKeyLocal = useCallback(
    (key: string) => applyLocal((prev) => purgeManualKeyInGroups(prev, key)),
    [applyLocal],
  );

  const renameManualKeyLocal = useCallback(
    (from: string, to: string) => applyLocal((prev) => renameManualKeyInGroups(prev, from, to)),
    [applyLocal],
  );

  return { upsertPointLocal, removePointLocal, purgeManualKeyLocal, renameManualKeyLocal };
}
