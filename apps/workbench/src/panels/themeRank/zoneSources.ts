// 시장 단면 「존 ▾」의 재료(순수) — 보는 집합의 테마 조건 목록 + 판에 복사해 두는 존 값.
// 규칙: decisions.md 「테마 순위는 판 하나다」 — **존 겹침은 참조가 아니라 복사다**(2026-09-30).
//
// 목록 범위 = 보는 집합(경로의 뿌리)의 잎 **묶음 속까지**(`deepLeavesOf` — 차트 사슬 층·◇ 평가와 같은 범위).
// 편집 집합은 늘 뿌리의 후손이라 이 범위가 편집 집합을 포함한다. 꺼진 줄도 싣는다(흐리게) — 복사라
// 활성 여부와 무관하다. 조건이 사는 자리마다 한 줄: 조건판의 테마 줄 + (사슬 필터 속 테마 칩 — 합류 자리는
// `zoneSourcesOfPredicate` 한 곳).
import { DEFAULT_THEME_ZONE, parseThemeZoneParams, type ThemeZoneParams } from "@trade-data-manager/market/domain";
import { deepLeavesOf, type SetExpr } from "../filter/expr.js";
import { themeZoneLabel } from "../filter/themeLabel.js";
import type { FilterPredicate } from "../filter/stage.js";
import type { SavedSet } from "../../store/savedSetsSlice.js";

/**
 * 판이 들고 있는 존 — 존 정의 세 값의 **사본**(원본을 고쳐도 안 따라간다) + 어디서 왔는지.
 * `key` = 출처 주소(목록의 ● 판정 — 이름·값으로 재면 원본의 컷만 고쳐도 ● 가 꺼지고, 같은 값 두 줄이 둘 다 켜진다).
 */
export type ScopeZone = Pick<ThemeZoneParams, "window" | "zoneAmountN" | "rate"> & { from: string; key: string };

export interface ZoneSource {
    key: string;
    /** 목록 본문 — 묶음 경로 + 줄 이름 + 요약 라벨. */
    label: string;
    zone: ScopeZone;
    /** 꺼진 줄 — 흐리게(고를 수는 있다). */
    enabled: boolean;
}

const zoneOf = (p: ThemeZoneParams, from: string, key: string): ScopeZone =>
    ({ window: p.window, zoneAmountN: p.zoneAmountN, rate: p.rate, from, key });

/** 조건 하나가 내놓는 존 출처들 — 조건 종류가 늘면 여기 한 자리. `sub` = 조건 안 주소(칩 id — 순서가 바뀌어도 ● 가 안 옮는다). */
function zoneSourcesOfPredicate(p: FilterPredicate): { sub: string; text: string; params: ThemeZoneParams }[] {
    switch (p.kind) {
        case "theme": return [{ sub: "", text: themeZoneLabel(p), params: p }];
        // 사슬 필터 속 테마 칩 — 칩마다 한 줄(조건판 테마와 같은 payload).
        case "breakout": return p.chain.expr.of.flatMap((t) =>
            t.cond.kind === "theme" ? [{ sub: t.id, text: `돌파 사슬 › ${themeZoneLabel(t.cond)}`, params: t.cond }] : []);
        default: return [];
    }
}

export function themeZoneSourcesOf(expr: SetExpr, sets: readonly SavedSet[]): ZoneSource[] {
    const setOf = (id: string): SavedSet | undefined => sets.find((f) => f.id === id);
    const nameOf = (id: string): string => setOf(id)?.name ?? "묶음"; // 손 이름만(자동 이름은 속 조건을 흉내 낸다)
    const out: ZoneSource[] = [];
    for (const { stage, via } of deepLeavesOf(expr, (id) => setOf(id)?.expr)) {
        const path = via.map((id) => `${nameOf(id)} › `).join("") + (stage.name ? `${stage.name} › ` : "");
        stage.predicates.forEach((p, pi) => {
            zoneSourcesOfPredicate(p).forEach((src) => {
                const label = `${path}${src.text}`;
                const key = `${stage.id}:${pi}:${src.sub}`;
                out.push({ key, label, zone: zoneOf(src.params, label, key), enabled: stage.enabled });
            });
        });
    }
    return out;
}

export const DEFAULT_ZONE_KEY = "default";
/** 기본값 복사 — 「기본값으로」. */
export const defaultScopeZone = (): ScopeZone => zoneOf(DEFAULT_THEME_ZONE, "기본값", DEFAULT_ZONE_KEY);

/** 저장물 파서 — 객체가 아니면 null(= 존 없음). 세 값은 테마 파서 한 벌로 읽는다. */
export function parseScopeZone(raw: unknown): ScopeZone | null {
    if (!raw || typeof raw !== "object") return null;
    const p = parseThemeZoneParams(raw);
    if (!p) return null;
    const { from, key } = raw as Record<string, unknown>;
    return zoneOf(p, typeof from === "string" ? from : "", typeof key === "string" ? key : "");
}
