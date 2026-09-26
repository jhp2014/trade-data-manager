// 타점 정보 패널의 **줄 목록 조립**(순수) — 한 타점을 세로로 읽을 때 무엇이 몇 줄로 서나.
//
// 2026-09-26 종단 폐기: 축·결과 줄이 은퇴하고 **테마 줄만** 남았다(통계는 나중에 "그룹 → 서버 리포트").
// 줄 하나 = **값 하나**(존 순위 단독)이고 나머지(존 인원·전체 순위·통과)는 툴팁이 진다.
//
// 훅을 안 문다(입력은 전부 이미 뽑힌 값) — 이 파일이 규칙을 테스트로 붙잡는 층이다.
import type { ThemeZoneVerdict as ThemeVerdict } from "@trade-data-manager/market/domain";

/** 값 한 칸의 표기. */
export interface PointInfoValue {
    text: string;
    color: string;
    /** tabular 글꼴 대상인가. */
    numeric: boolean;
}

export interface PointInfoRow {
    /** 순서·숨김 저장물의 주소 — `th:<테마이름>`. */
    key: string;
    name: string;
    /** null = **결손**(기계가 못 준 것) → "값 없음" 서랍. 무사건("존 밖")은 결손이 아니라 본문에 선다. */
    value: PointInfoValue | null;
    title: string;
}

const MUTED = "var(--text-tertiary)";

export interface PointInfoSources {
    /** 시선 종목의 테마별 진단 — null = 재료 없음(단면·멤버십 미도착) → 테마 줄 자체가 없다. */
    verdicts: readonly ThemeVerdict[] | null;
}

/** 기본 순서의 줄 목록. 사용자 순서는 호출부가 `orderByPref` 로 위에 입힌다. */
export function pointInfoRows(src: PointInfoSources): PointInfoRow[] {
    const out: PointInfoRow[] = [];
    for (const v of src.verdicts ?? []) {
        // 존 밖은 결손이 아니라 **사실**이라 본문에 선다(서랍 = 기계가 못 준 것).
        out.push({
            key: `th:${v.theme}`,
            name: v.theme,
            value: v.zoneRank === null
                ? { text: "존 밖", color: MUTED, numeric: false }
                : { text: `${v.zoneRank}위`, color: "var(--text-primary)", numeric: true },
            title: [
                `${v.theme} — 존 순위 ${v.zoneRank === null ? "존 밖" : `${v.zoneRank}위`}`,
                `존 인원 ${v.zoneCount}`,
                `전체 순위 ${v.baseRank === null ? "—" : `${v.baseRank}위`}`,
                v.pass ? "이 테마 단독 통과" : "이 테마 단독 불통과",
            ].join(" · "),
        });
    }
    return out;
}

/** 줄이 어느 칸에 서나 — 본문 / "값 없음" 서랍 / "숨김" 서랍. 숨김이 결손보다 세다(내가 치운 것이 먼저). */
export type RowSlot = "body" | "missing" | "hidden";
export const slotOf = (row: PointInfoRow, hidden: ReadonlySet<string>): RowSlot =>
    hidden.has(row.key) ? "hidden" : row.value === null ? "missing" : "body";
