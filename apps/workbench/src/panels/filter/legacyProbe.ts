// 옛 "탐색 후보" 패널의 조건 **1회 이주** — 이 파일은 언젠가 통째로 지울 물건이다.
//
// 그 패널(2026-09-17~18)은 자기 조건을 `panelUi` 가방에 들고 있었다: 스칼라 노브 9개(gridOn…
// minCumAmountEok) 위에 나중에 붙은 조건 묶음(`cellConditions`) 한 벌. 단계 ③ 에서 패널이
// 작업 대상으로 흡수되며 그 UI 는 사라졌지만, **사용자가 조정해 둔 값**(예: 누적 200억)까지
// 같이 사라지면 제일 나쁜 종류의 회귀다 — 조용히 기본값으로 되돌아가는 것.
//
// 그래서 하루 우주를 **처음 보는 순간** 한 번만, 그 가방을 읽어 조건 칸으로 세운다 — 입구는 둘이다:
// 우주 전환(setFilterUniverse)과 **앱 시작**(이미 하루 우주로 저장된 사용자는 전환이 영영 안 온다).
//  · 한 번뿐인 이유: 우주 전환은 "조건 비우기 동반"이 규칙이다(filterFunnelSlice). 매번 심으면
//    사용자가 지운 칸이 전환할 때마다 되살아나 규칙이 거짓말이 된다.
//  · 옛 키는 **안 지운다** — 되돌릴 자리를 남기고, 지우는 쓰기 한 벌을 아낀다.
import {
    parseCellConditions,
    seedConditionsOf,
    DEFAULT_SEED_KNOBS,
    type CellConditions,
    type SeedKnobs,
} from "@trade-data-manager/market/domain";
import { loadJson, saveJson } from "../../store/persist.js";
import { PANEL_UI_KEY, type PanelUiBag } from "../../store/panelUiSlice.js";
import type { FilterStage } from "./stage.js";

/** 저장된 panelUi 가방 — 슬라이스가 아직 없는 자리(슬라이스 초기화)에서도 읽어야 해서 직접 연다. */
const storedPanelUi = (): PanelUiBag | undefined =>
    loadJson<PanelUiBag>(PANEL_UI_KEY, (o) => (o && typeof o === "object" ? (o as PanelUiBag) : null)) ?? undefined;

/** 옛 패널의 panelUi 안 조건 묶음 키 — 스칼라 노브들과 한 가방에 공존했다. */
const CELL_CONDITIONS_KEY = "cellConditions";

/** 옛 노브 키 목록 — 번역의 입력이자 "옛 저장물이 있나" 판정의 기준. */
const LEGACY_KNOB_KEYS: readonly (keyof SeedKnobs)[] = [
    "gridOn",
    "surgeOn",
    "surgeRatePct",
    "surgeAmountEok",
    "priorHighOn",
    "priorHighDays",
    "zoneOn",
    "zoneMaxRank",
    "minCumAmountEok",
];

/** 이주 완료 도장 — 값은 뜻이 없고 **있다는 사실**만 읽는다. */
const MIGRATED_KEY = "wb.filterStages.daily.fromProbe";

/** 옛 스칼라 가방 → 노브(모양이 다른 값은 기본값으로). 없는 키는 기본값이다. */
export function knobsFromLegacy(bag: Record<string, unknown> | undefined): SeedKnobs {
    const k: SeedKnobs = { ...DEFAULT_SEED_KNOBS };
    if (!bag) return k;
    for (const key of LEGACY_KNOB_KEYS) {
        const v = bag[key];
        if (typeof DEFAULT_SEED_KNOBS[key] === "boolean") {
            if (typeof v === "boolean") (k[key] as boolean) = v;
        } else if (typeof v === "number" && Number.isFinite(v)) {
            (k[key] as number) = v;
        }
    }
    return k;
}

/**
 * 가방 한 벌 → 조건. 묶음이 성하면 그대로, 아니면 **옛 노브로 만든 시드**로 폴백한다.
 * (panelUi 는 무검증 JSON 이라 깨진 blob 이 그대로 평가기까지 갈 수 있다 — `parseCellConditions` 가 문지기다.
 *  빈 배열은 유효한 상태다: "조건 없음 = 안 보여줌" — 시드로 되돌리지 않는다.)
 */
export function conditionsFromLegacyBag(bag: Record<string, unknown> | undefined): CellConditions {
    const parsed = parseCellConditions(bag?.[CELL_CONDITIONS_KEY]);
    return parsed ?? seedConditionsOf(knobsFromLegacy(bag));
}

/** 옛 패널의 가방인가 — id 가 `probe`·`probe-2`… 였다(슬롯 인스턴스). 여럿이면 **첫 벌만** 쓴다. */
const legacyBagOf = (panelUi: Record<string, Record<string, unknown>> | undefined): Record<string, unknown> | undefined => {
    if (!panelUi) return undefined;
    for (const id of Object.keys(panelUi).sort()) {
        if (id !== "probe" && !id.startsWith("probe-")) continue;
        const bag = panelUi[id];
        if (!bag || typeof bag !== "object") continue;
        if (CELL_CONDITIONS_KEY in bag || LEGACY_KNOB_KEYS.some((k) => k in bag)) return bag;
    }
    return undefined;
};

/**
 * 하루 우주로 갈아탈 때 심을 칸들 — 이주할 게 없거나 **이미 한 번 했으면** null(그러면 빈 벌).
 * 부수효과(도장 찍기)를 안에서 하는 이유: "한 번"의 판정과 기록이 갈리면 두 번 심는 창이 열린다.
 */
export function migrateProbeStages(panelUi?: Record<string, Record<string, unknown>>): FilterStage[] | null {
    if (loadJson<true>(MIGRATED_KEY, () => true) !== null) return null;
    // 가방을 안 주면 저장물에서 읽는다 — **이미 하루 우주인 사용자**는 전환 이벤트가 영영 안 와서
    // 슬라이스 초기화가 유일한 기회다(단계 ② 를 쓰던 사람이 거기 해당한다).
    const bag = legacyBagOf(panelUi ?? storedPanelUi());
    if (!bag) return null;
    saveJson(MIGRATED_KEY, Date.now());
    const conds = conditionsFromLegacyBag(bag);
    if (conds.length === 0) return null;
    // CellCondition ≅ FilterStage — 술어 어휘가 ② 에서 물리적으로 합류해 필드가 그대로 맞는다.
    return conds.map((c) => ({
        id: c.id,
        ...(c.name !== undefined ? { name: c.name } : {}),
        enabled: c.enabled,
        predicates: [...c.predicates],
        ...(c.transition !== undefined ? { transition: c.transition } : {}),
    }));
}
