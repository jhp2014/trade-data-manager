// 타점 정보 패널의 **줄 목록 조립**(순수) — 한 타점을 세로로 읽을 때 무엇이 몇 줄로 서나.
//
// 줄 하나 = **값 하나**다. 종류(축·결과·테마)는 구획으로 안 가르고 색점으로만 말한다 — 정렬이
// 사람 손이라(2026-09-13 확정, decisions.md 「타점 정보 패널」) 구획은 그 자유를 가두고, 좁은 셀에서
// 구획 머리가 세로를 먹는다. 대신 **짝인 값**(상태·회복 / 시뮬·요구)은 한 줄에 붙인다: 분류 글자는
// 짧아서 한 줄을 통째로 쓰면 낭비다.
//
// 훅을 안 문다(입력은 전부 이미 뽑힌 값) — 이 파일이 이 작업에서 규칙을 테스트로 붙잡는 층이다.
import type { AxisRef } from "../../lib/computedAxis.js";
import type { AxisPlacement } from "../../lib/rankIndex.js";
import type { OutcomeRecord } from "../../lib/useOutcomes.js";
import type { ThemeVerdict } from "../../lib/themeStrength.js";
import type { SimResult } from "@trade-data-manager/market/domain";
import { outcomeCellView, OUTCOME_COL_IDS, OUTCOME_COL_META, type OutcomeColId } from "../rank/outcomeColumns.js";
import { toneColor, toneOf } from "../rank/sheetCell.js";

/** 줄의 출처 — 색점 하나가 말하는 것. */
export type PointInfoKind = "axis" | "outcome" | "theme";

/** 값 한 칸의 표기 — 시트 결과 셀(outcomeCellView)과 같은 모양이라 축·테마도 이 그릇에 담는다. */
export interface PointInfoValue {
    text: string;
    color: string;
    /** tabular 글꼴 대상인가. */
    numeric: boolean;
    /** 테두리 배지로 그릴 색(상태 "이내" · 시뮬 분류). null = 맨 글자. */
    badge: string | null;
}

export interface PointInfoRow {
    /** 순서·숨김 저장물의 주소. `ax:<축키>` · `out:<결과열id>` · `th:<테마이름>`(시트 관례 차용). */
    key: string;
    kind: PointInfoKind;
    name: string;
    /** null = **결손**(기계가 못 준 것) → "값 없음" 서랍. 무사건(`—`)은 결손이 아니라 본문에 선다. */
    value: PointInfoValue | null;
    /** 붙는 짝 — 값 오른쪽에 이어 쓴다(회복 · 요구 타점). */
    extra?: PointInfoValue;
    title: string;
    /** 시트의 어느 열로 데려가나(줄 클릭). null = 무동작 — 테마엔 대응 열이 없다. */
    revealKey: string | null;
}

/** 결과 줄의 짝 — 대표 키 하나만 목록에 서고, 짝은 그 줄의 `extra` 로 흡수된다(키 공간에 안 나타난다). */
const OUTCOME_PAIR: Partial<Record<OutcomeColId, OutcomeColId>> = { status: "recovered", simStatus: "simRequired" };
/** 결과 줄의 기본 순서 — 흡수된 짝을 뺀 `OUTCOME_COL_IDS` **파생**(손으로 다시 적으면 새 결과 열이
 *  시트에만 서고 이 패널엔 조용히 안 생긴다). */
const PAIRED = new Set<OutcomeColId>(Object.values(OUTCOME_PAIR) as OutcomeColId[]);
const OUTCOME_ROW_IDS: readonly OutcomeColId[] = OUTCOME_COL_IDS.filter((id) => !PAIRED.has(id));

const MUTED = "var(--text-tertiary)";

export interface PointInfoSources {
    /** 축 목록(키 안정 순서) — **기본 순서의 출처**. 값 유무와 무관하게 전부 줄이 된다. */
    axes: readonly AxisRef[];
    /** 값이 있는 축의 자리 — 순위는 툴팁에만 쓴다(2026-09-13: 표기·트랙 폐지). */
    placed: readonly AxisPlacement[];
    /** 축 키 → 포맷된 값(시트 계산 축 셀과 같은 출처). 없으면 결손. */
    axisText: (axisKey: string) => string | undefined;
    rec: OutcomeRecord | undefined;
    sim: SimResult | undefined;
    /** 시선 종목의 테마별 진단 — null = 재료 없음(단면·멤버십 미도착) → 테마 줄 자체가 없다. */
    verdicts: readonly ThemeVerdict[] | null;
}

/** 기본 순서(축 → 결과 → 테마)의 줄 목록. 사용자 순서는 호출부가 `orderByPref` 로 위에 입힌다. */
export function pointInfoRows(src: PointInfoSources): PointInfoRow[] {
    const out: PointInfoRow[] = [];

    const cellOf = new Map(src.placed.map((p) => [p.axisKey, p.cell] as const));
    for (const a of src.axes) {
        const cell = cellOf.get(a.key);
        const text = cell ? src.axisText(a.key) : undefined;
        const rank = cell ? `${cell.rank}/${cell.total}` : null;
        out.push({
            key: `ax:${a.key}`,
            kind: "axis",
            name: a.name,
            // 순위는 **툴팁에만** 남는다 — 모수가 만 단위면 `3/9,869` 는 눈이 분모를 못 쥔다(시트 2026-09-04 판단 승계).
            // 부호 색은 **시트와 같은 어휘 한 벌**(toneOf + toneColor) — 포맷된 글자의 부호로 잰다
            // (`+` 는 signed 축에만 찍힌다는 formatAxisValue 계약이 그 전제다).
            value: text === undefined ? null : { text, color: toneColor(toneOf(text)), numeric: true, badge: null },
            title: text === undefined
                ? `${a.name} — 이 타점은 값 없음(결손·입력 전)`
                : `${a.name} — ${text}${rank ? ` · ${rank}` : ""}`,
            revealKey: `ax:${a.key}`,
        });
    }

    for (const id of OUTCOME_ROW_IDS) {
        const v = outcomeCellView(id, src.rec, src.sim);
        const pair = OUTCOME_PAIR[id];
        const p = pair ? outcomeCellView(pair, src.rec, src.sim) : undefined;
        const name = pair ? `${OUTCOME_COL_META[id].label}·${OUTCOME_COL_META[pair].label}` : OUTCOME_COL_META[id].label;
        out.push({
            key: `out:${id}`,
            kind: "outcome",
            name,
            // 결손(레코드 없음)만 서랍으로 — 무사건(무눌림의 낙폭·회복)은 값이 있는 사실이라 본문에 `—` 로 선다.
            value: v.missing ? null : { text: v.text, color: v.color, numeric: v.numeric, badge: v.badge },
            extra: p && !p.missing ? { text: p.text, color: p.color, numeric: p.numeric, badge: p.badge } : undefined,
            title: pair ? `${OUTCOME_COL_META[id].help}\n${OUTCOME_COL_META[pair].help}` : OUTCOME_COL_META[id].help,
            revealKey: `out:${id}`,
        });
    }

    for (const v of src.verdicts ?? []) {
        // 값 한 칸 = 수치 하나 — **존 순위 단독**이고 나머지 셋(존 인원·전체 순위·통과)은 툴팁이 진다.
        // 존 밖은 결손이 아니라 **사실**이라 본문에 선다(서랍 = 기계가 못 준 것).
        out.push({
            key: `th:${v.theme}`,
            kind: "theme",
            name: v.theme,
            value: v.zoneRank === null
                ? { text: "존 밖", color: MUTED, numeric: false, badge: null }
                : { text: `${v.zoneRank}위`, color: "var(--text-primary)", numeric: true, badge: null },
            title: [
                `${v.theme} — 존 순위 ${v.zoneRank === null ? "존 밖" : `${v.zoneRank}위`}`,
                `존 인원 ${v.zoneCount}`,
                `전체 순위 ${v.baseRank === null ? "—" : `${v.baseRank}위`}`,
                v.pass ? "이 테마 단독 통과" : "이 테마 단독 불통과",
            ].join(" · "),
            revealKey: null,
        });
    }

    return out;
}

/** 줄이 어느 칸에 서나 — 본문 / "값 없음" 서랍 / "숨김" 서랍. 숨김이 결손보다 세다(내가 치운 것이 먼저). */
export type RowSlot = "body" | "missing" | "hidden";
export const slotOf = (row: PointInfoRow, hidden: ReadonlySet<string>): RowSlot =>
    hidden.has(row.key) ? "hidden" : row.value === null ? "missing" : "body";
