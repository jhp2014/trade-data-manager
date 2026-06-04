/**
 * 퀵 입력 프리셋 — 숫자키(1~4)로 미리 정의한 m_ 컬럼 값을 현재 종목/마커에 즉시 적용.
 *
 * - 그룹(hotkey 1~4) > 프리셋 > 항목(컬럼·액션·값) 3중첩 구조.
 * - 적용은 기존 manual 에 병합: 미설정 컬럼 유지 / 덮어쓰기 / 추가(중복 무시) / 삭제.
 * - 정의는 useUiStore + localStorage 에만 저장(DB 무관).
 */

/** 항목 액션: 덮어쓰기 / 추가(멀티값) / 삭제. */
export type PresetAction = "overwrite" | "append" | "delete";

/** 프리셋 한 항목: 어떤 m_ 컬럼에 어떤 값을 어떻게 반영할지. */
export type PresetEntry = {
  /** m_ 접두사 없는 원본 키(예: "day", "b"). */
  key: string;
  action: PresetAction;
  /** delete 액션이면 무시. */
  value: string;
};

/** 프리셋 하나(이름 + 항목들). */
export type QuickPreset = {
  id: string;
  name: string;
  entries: PresetEntry[];
};

/** 숫자키 하나에 묶인 프리셋 그룹. */
export type PresetGroup = {
  /** "1".."4". */
  hotkey: string;
  presets: QuickPreset[];
};

/** 사용할 숫자 단축키. */
export const PRESET_HOTKEYS = ["1", "2", "3", "4"] as const;

/** 빈 그룹 4개(hotkey 1~4) 기본값. */
export function defaultPresetGroups(): PresetGroup[] {
  return PRESET_HOTKEYS.map((hotkey) => ({ hotkey, presets: [] }));
}

/** 고유 id 생성(브라우저 crypto 우선, 폴백 포함). */
export function newPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 액션 한글 라벨. */
export function actionLabel(action: PresetAction): string {
  switch (action) {
    case "overwrite":
      return "덮어쓰기";
    case "append":
      return "추가";
    case "delete":
      return "삭제";
  }
}

/** 액션 기호(스위처/토스트 표시용). */
export function actionSymbol(action: PresetAction): string {
  switch (action) {
    case "overwrite":
      return "=";
    case "append":
      return "+";
    case "delete":
      return "✕";
  }
}

/** "a | b" → ["a","b"]. 빈 값/공백 제거. */
function splitValues(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);
}

export type PresetApplyResult = {
  /** POST /api/review/point 에 보낼 완성된 manual(전체 덮어쓰기용). */
  payload: Record<string, string | string[]>;
  /** 토스트용 변경 요약(예: "m_day=나쁨, m_b+돌파, m_x 삭제"). 변경 없으면 빈 문자열. */
  summary: string;
};

/**
 * 기존 manual 에 프리셋 항목들을 병합한 "완성된 manual" 과 변경 요약을 만든다.
 *
 * - POST 엔드포인트가 payload 로 manual 을 통째로 덮어쓰므로 전체 맵을 반환한다.
 * - overwrite: 해당 컬럼을 값 하나로 교체.
 * - append: 기존 값에 추가(이미 같은 값이 있으면 무시).
 * - delete: 해당 컬럼 제거.
 * - 프리셋에 없는 컬럼은 그대로 유지.
 *
 * @param existingManual 현재 타점의 manual(값은 "a | b" 멀티 가능). 신규면 {}.
 * @param entries 적용할 프리셋 항목들.
 */
export function mergePresetIntoManual(
  existingManual: Record<string, string>,
  entries: PresetEntry[],
): PresetApplyResult {
  // 작업 맵: key → 값 배열.
  const map = new Map<string, string[]>();
  for (const [k, v] of Object.entries(existingManual)) {
    map.set(k, splitValues(v));
  }

  const changes: string[] = [];

  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key) continue;
    const value = entry.value.trim();

    if (entry.action === "delete") {
      if (map.has(key)) {
        map.delete(key);
        changes.push(`m_${key} 삭제`);
      }
      continue;
    }

    if (!value) continue; // overwrite/append 인데 값이 비면 건너뜀

    if (entry.action === "overwrite") {
      map.set(key, [value]);
      changes.push(`m_${key}=${value}`);
    } else {
      // append: 중복 무시.
      const cur = map.get(key) ?? [];
      if (cur.includes(value)) {
        // 이미 있으면 변경 없음(요약에도 표시 안 함).
        continue;
      }
      map.set(key, [...cur, value]);
      changes.push(`m_${key}+${value}`);
    }
  }

  // payload 직렬화: 값 1개 → string, 여러 개 → string[].
  const payload: Record<string, string | string[]> = {};
  for (const [k, values] of map.entries()) {
    if (values.length === 0) continue;
    payload[k] = values.length === 1 ? values[0] : values;
  }

  return { payload, summary: changes.join(", ") };
}
