import type { PresetGroup } from "./quickPreset";

/**
 * 수동 입력(m_) 키와 관련된 클라이언트 영속 설정(useUiStore/localStorage) 슬라이스.
 * 키를 레지스트리에서 삭제·이름변경해도 이 설정들은 죽은 키 id 를 그대로 들고 있으므로
 * 별도로 화해(reconcile)해 줘야 잔재가 사라진다.
 */
export type ManualKeySettings = {
  headerFieldKeys: string[];   // "m_xxx" / feature 키 혼재
  pointFieldKeys: string[];    // "m_xxx" / feature 키 혼재
  exportFieldKeys: string[];   // "m_xxx" / base/feature 키 혼재
  inputKeyOrder: string[];     // "m_xxx"
  inputKeyDisabled: string[];  // "m_xxx"
  manualFilters: Record<string, string[]>; // 접두사 없는 원본 키 → 값
  quickPresetGroups: PresetGroup[];         // entries[].key 는 접두사 없는 원본 키
};

const MANUAL_PREFIX = "m_";
const isManualId = (id: string) => id.startsWith(MANUAL_PREFIX);
const rawOf = (id: string) => id.slice(MANUAL_PREFIX.length);

/**
 * `isDead(rawKey)` 가 true 인 m_ 키를 모든 영속 설정에서 제거한 새 슬라이스를 반환.
 * - "m_" 접두사가 붙은 id 만 대상으로 한다(feature/base 키는 건드리지 않는다).
 * - 변경이 전혀 없으면 `null` 을 반환해 호출 측이 무의미한 상태 갱신을 피할 수 있게 한다.
 */
export function pruneManualKeysFromSettings(
  s: ManualKeySettings,
  isDead: (rawKey: string) => boolean,
): ManualKeySettings | null {
  let changed = false;

  const filterIds = (arr: string[]) => {
    const next = arr.filter((id) => !(isManualId(id) && isDead(rawOf(id))));
    if (next.length !== arr.length) {
      changed = true;
      return next;
    }
    return arr;
  };

  const headerFieldKeys = filterIds(s.headerFieldKeys);
  const pointFieldKeys = filterIds(s.pointFieldKeys);
  const exportFieldKeys = filterIds(s.exportFieldKeys);
  const inputKeyOrder = filterIds(s.inputKeyOrder);
  const inputKeyDisabled = filterIds(s.inputKeyDisabled);

  let manualFilters = s.manualFilters;
  const deadFilterKeys = Object.keys(s.manualFilters).filter((k) => isDead(k));
  if (deadFilterKeys.length > 0) {
    changed = true;
    manualFilters = { ...s.manualFilters };
    for (const k of deadFilterKeys) delete manualFilters[k];
  }

  const quickPresetGroups = pruneOrMapPresets(s.quickPresetGroups, (entryKey) =>
    entryKey && isDead(entryKey) ? null : entryKey,
  );
  if (quickPresetGroups !== s.quickPresetGroups) changed = true;

  if (!changed) return null;
  return {
    headerFieldKeys,
    pointFieldKeys,
    exportFieldKeys,
    inputKeyOrder,
    inputKeyDisabled,
    manualFilters,
    quickPresetGroups,
  };
}

/**
 * m_ 키 이름 변경(fromRaw → toRaw)을 모든 영속 설정에 반영한 새 슬라이스를 반환.
 * 변경이 없으면 `null`. (서버 PATCH 가 충돌을 막으므로 to 중복은 고려하지 않는다.)
 */
export function renameManualKeyInSettings(
  s: ManualKeySettings,
  fromRaw: string,
  toRaw: string,
): ManualKeySettings | null {
  if (!fromRaw || !toRaw || fromRaw === toRaw) return null;
  const fromId = MANUAL_PREFIX + fromRaw;
  const toId = MANUAL_PREFIX + toRaw;
  let changed = false;

  const mapIds = (arr: string[]) => {
    let local = false;
    const next = arr.map((id) => {
      if (id === fromId) {
        local = true;
        return toId;
      }
      return id;
    });
    if (local) {
      changed = true;
      return next;
    }
    return arr;
  };

  const headerFieldKeys = mapIds(s.headerFieldKeys);
  const pointFieldKeys = mapIds(s.pointFieldKeys);
  const exportFieldKeys = mapIds(s.exportFieldKeys);
  const inputKeyOrder = mapIds(s.inputKeyOrder);
  const inputKeyDisabled = mapIds(s.inputKeyDisabled);

  let manualFilters = s.manualFilters;
  if (Object.prototype.hasOwnProperty.call(s.manualFilters, fromRaw)) {
    changed = true;
    manualFilters = { ...s.manualFilters };
    manualFilters[toRaw] = manualFilters[fromRaw];
    delete manualFilters[fromRaw];
  }

  const quickPresetGroups = pruneOrMapPresets(s.quickPresetGroups, (entryKey) =>
    entryKey === fromRaw ? toRaw : entryKey,
  );
  if (quickPresetGroups !== s.quickPresetGroups) changed = true;

  if (!changed) return null;
  return {
    headerFieldKeys,
    pointFieldKeys,
    exportFieldKeys,
    inputKeyOrder,
    inputKeyDisabled,
    manualFilters,
    quickPresetGroups,
  };
}

/**
 * 프리셋 entries 의 key 를 `mapKey` 로 변환한다.
 * - `mapKey` 가 `null` 을 반환하면 그 항목을 제거한다.
 * - 동일 키를 반환하면 항목 유지(이름 변경 시 사용).
 * 변경이 전혀 없으면 원본 배열을 그대로(참조 동일) 반환한다.
 */
function pruneOrMapPresets(
  groups: PresetGroup[],
  mapKey: (entryKey: string) => string | null,
): PresetGroup[] {
  let groupsChanged = false;
  const nextGroups = groups.map((g) => {
    let presetsChanged = false;
    const presets = g.presets.map((p) => {
      let entriesChanged = false;
      const entries: typeof p.entries = [];
      for (const e of p.entries) {
        const mapped = mapKey(e.key);
        if (mapped === null) {
          entriesChanged = true;
          continue; // 제거
        }
        if (mapped !== e.key) {
          entriesChanged = true;
          entries.push({ ...e, key: mapped });
        } else {
          entries.push(e);
        }
      }
      if (entriesChanged) {
        presetsChanged = true;
        return { ...p, entries };
      }
      return p;
    });
    if (presetsChanged) {
      groupsChanged = true;
      return { ...g, presets };
    }
    return g;
  });
  return groupsChanged ? nextGroups : groups;
}
