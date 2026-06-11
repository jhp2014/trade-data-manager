import { useCallback } from "react";
import { useUiStore } from "@/stores/useUiStore";
import { postJson, patchJson, deleteJson } from "@/lib/apiClient";

const KEY_PATTERN = /^[A-Za-z0-9_]+$/;

type Params = {
  /** 현재 드로어 행들(중복 키 검사용). */
  rows: { key: string }[];
  /** 드로어 로컬 행 추가/제거/이름변경. */
  addRow: (key: string) => void;
  removeRow: (key: string) => void;
  renameRow: (from: string, to: string) => void;
  /** 부모(ReviewWorkspace) 레지스트리·작업셋 낙관적 갱신 콜백. */
  onKeyAdded: (key: string) => void;
  onKeyDeleted: (key: string) => void;
  onKeyRenamed: (from: string, to: string) => void;
};

/**
 * 수동 입력 키(m_) 레지스트리의 추가/이름변경/삭제를 담당한다.
 * - prompt/confirm + 키 형식 검증 + manual-keys API 호출을 캡슐화.
 * - 성공 시 드로어 로컬 행 + 부모 콜백 + 영속 설정(useUiStore) 을 함께 갱신한다.
 * - 실패는 alert 로 보고하고 로컬 상태를 건드리지 않는다.
 */
export function useManualKeyEditing({
  rows,
  addRow,
  removeRow,
  renameRow,
  onKeyAdded,
  onKeyDeleted,
  onKeyRenamed,
}: Params) {
  const purgeManualKey = useUiStore((state) => state.purgeManualKey);
  const renameManualKeySettings = useUiStore((state) => state.renameManualKeySettings);

  const handleAddKey = useCallback(async () => {
    const raw = window.prompt("새 입력 항목(영문/숫자/밑줄)");
    const key = raw?.trim();
    if (!key) return;
    if (!KEY_PATTERN.test(key)) {
      window.alert("영문/숫자/밑줄만 사용할 수 있습니다.");
      return;
    }
    if (rows.some((r) => r.key === key)) {
      window.alert("이미 있는 항목입니다.");
      return;
    }
    try {
      await postJson("/api/review/manual-keys", { key }, "추가 실패");
      addRow(key);
      // 부모 manualKeys 에도 즉시 반영 → 재오픈 시에도 레지스트리 키로 인식(✕ 노출).
      onKeyAdded(key);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }, [rows, addRow, onKeyAdded]);

  const handleRenameKey = useCallback(
    async (key: string) => {
      const raw = window.prompt(`'${key}' 의 새 이름(영문/숫자/밑줄)`, key);
      const next = raw?.trim();
      if (!next || next === key) return;
      if (!KEY_PATTERN.test(next)) {
        window.alert("영문/숫자/밑줄만 사용할 수 있습니다.");
        return;
      }
      if (rows.some((r) => r.key === next)) {
        window.alert("이미 있는 항목입니다.");
        return;
      }
      try {
        await patchJson("/api/review/manual-keys", { from: key, to: next }, "이름 변경 실패");
        renameRow(key, next);
        // 부모 manualKeys + 영속 설정(내보내기/프리셋/헤더/필터 등)의 키 참조도 즉시 from→to 로 이동.
        onKeyRenamed(key, next);
        renameManualKeySettings(key, next);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err));
      }
    },
    [rows, renameRow, onKeyRenamed, renameManualKeySettings],
  );

  const handleDeleteKey = useCallback(
    async (key: string) => {
      if (
        !window.confirm(
          `'${key}' 항목을 완전히 삭제할까요?\n레지스트리와 모든 타점의 저장된 값까지 함께 제거됩니다. (되돌릴 수 없음)`,
        )
      )
        return;
      try {
        await deleteJson("/api/review/manual-keys", { key }, "삭제 실패");
        removeRow(key);
        // 부모 manualKeys 에서 제거(재오픈 시 되살아나지 않게) + 영속 설정의 죽은 키 잔재 제거.
        onKeyDeleted(key);
        purgeManualKey(key);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err));
      }
    },
    [removeRow, onKeyDeleted, purgeManualKey],
  );

  return { handleAddKey, handleRenameKey, handleDeleteKey };
}
