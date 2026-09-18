// 조건 저장물의 문지기 — panelUi(무검증 JSON 가방) ↔ core 조건 묶음.
//
// `usePanelUi` 는 raw 를 그대로 `as T` 로 캐스팅한다(검증 없음). 옛 노브는 전부 스칼라라 무해했지만
// 조건 묶음은 구조물이라, 낡거나 깨진 blob 이 평가기까지 그대로 들어오면 크래시한다. 그래서 읽는
// 자리마다 `parseCellConditions` 를 지나고, **배열조차 아니면 시드로 폴백**한다(하루 우주의 조건은
// 진실이 아니라 로컬 설정이라 지어내도 잃는 게 없다 — 종단 `parseStages` 의 "통째 폐기"와 반대).
//
// ## 옛 노브 1회 번역
// 이 패널은 스칼라 9개(gridOn…minCumAmountEok)를 이미 영속해 두었다. 갈아타며 번역하지 않으면
// 사용자가 조정해 둔 값(예: 누적 200억)이 **조용히 기본값으로 되돌아간다** — 제일 나쁜 종류의 회귀다.
// 그래서 조건 키가 비어 있고 옛 키가 하나라도 있으면 그것으로 시드를 만든다. 옛 키는 지우지 않는다
// (되돌릴 자리를 남기고, 지우는 쓰기 한 벌을 아낀다).
import {
    parseCellConditions,
    seedConditionsOf,
    DEFAULT_SEED_KNOBS,
    type CellConditions,
    type CellPredicate,
    type SeedKnobs,
} from "@trade-data-manager/market/domain";

/** panelUi 안의 조건 묶음 키 — 옛 스칼라 키들과 한 가방에 공존한다. */
export const CELL_CONDITIONS_KEY = "cellConditions";

/** 옛 노브 키 목록 — 번역의 입력이자 "옛 저장물이 있나" 판정의 기준. */
export const LEGACY_KNOB_KEYS: readonly (keyof SeedKnobs)[] = [
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
 * 읽기 — 조건 묶음이 성하면 그대로, 아니면 **옛 노브로 만든 시드**로 폴백한다.
 * 빈 배열은 유효한 상태다("조건 없음 = 안 보여줌") — 시드로 되돌리지 않는다.
 */
export function readCellConditions(bag: Record<string, unknown> | undefined): CellConditions {
    const parsed = parseCellConditions(bag?.[CELL_CONDITIONS_KEY]);
    return parsed ?? seedConditionsOf(knobsFromLegacy(bag));
}

/**
 * 하한 **일괄 손잡이** — 모든 칸의 하한 항을 한 번에 바꾼다(저장물은 칸마다 자기 항을 든다:
 * 우주는 조건이 아니므로 칸 밖에 전역 게이트 필드를 만들지 않는다).
 *
 * ⚠ 하한 항의 정체는 **값이 아니라 자리**다: 하한이 서 있는 동안(`prevEok > 0`) 꼬리 자리는
 * 손잡이의 소유고, 그 자리의 `누적대금 ≥ …` 항은 값이 얼마든 교체 대상이다.
 *  · 값으로 식별하면 칸 안에서 그 숫자를 손댄 순간 항이 손잡이에서 이탈해 **누적된다**
 *    (`[누적≥500, 누적≥400]` — 필드가 둘 뜨고 실효 게이트와 손잡이 표시가 갈린다).
 *  · 자리로만 식별하되 `prevEok === 0` 이면 아무것도 걷지 않는다 — 안 그러면 하한이 없는 상태에서
 *    급등대금 칸의 **자기 임계**(꼬리에 선 `누적대금 ≥ 100억`)를 지운다.
 */
export function withFloor(conditions: CellConditions, prevEok: number, nextEok: number): CellConditions {
    const isFloorSlot = (p: CellPredicate | undefined): boolean =>
        p?.kind === "cellValue" && p.field === "cumAmountEok" && p.ranges.length === 1 && p.ranges[0]?.from?.kind === "value" && p.transition === undefined;
    return conditions.map((c) => {
        const preds = [...c.predicates];
        if (prevEok > 0 && isFloorSlot(preds[preds.length - 1])) preds.pop();
        if (nextEok > 0) preds.push({ kind: "cellValue", field: "cumAmountEok", ranges: [{ from: { kind: "value", value: nextEok } }] });
        return { ...c, predicates: preds };
    });
}
