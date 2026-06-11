import { useCallback, useEffect, useState } from "react";
import type { ManualKeyDef } from "@/lib/loadManualKeys";

/**
 * 수동 입력 키(m_) 레지스트리를 클라이언트 상태로 들고, 추가/삭제/이름변경을
 * 낙관적으로 반영한다.
 *
 * 서버 prop 은 force-dynamic 페이지가 재렌더(브라우저 새로고침)될 때만 갱신되므로,
 * 그 사이 드로어를 다시 열었을 때 ✕ 삭제 버튼 노출·삭제 반영이 stale 해지는 것을 막는다.
 * 서버에서 새 레지스트리가 내려오면(새로고침/router.refresh) 권위 값으로 재동기화한다.
 */
export function useManualKeyRegistry(manualKeysProp: ManualKeyDef[]) {
  const [manualKeys, setManualKeys] = useState<ManualKeyDef[]>(manualKeysProp);
  const manualKeysPropSig = manualKeysProp.map((k) => k.key).join("|");

  useEffect(() => {
    setManualKeys(manualKeysProp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualKeysPropSig]);

  const addManualKeyLocal = useCallback((key: string) => {
    setManualKeys((prev) =>
      prev.some((k) => k.key === key) ? prev : [...prev, { key, label: null }],
    );
  }, []);

  const removeManualKeyLocal = useCallback((key: string) => {
    setManualKeys((prev) => prev.filter((k) => k.key !== key));
  }, []);

  const renameManualKeyLocal = useCallback((from: string, to: string) => {
    setManualKeys((prev) => prev.map((k) => (k.key === from ? { ...k, key: to } : k)));
  }, []);

  return { manualKeys, addManualKeyLocal, removeManualKeyLocal, renameManualKeyLocal };
}
