// 기본 분봉 차트의 **사슬 층 재료** — 보는 집합의 「돌파」 줄 하나를 골라, 격자판과 **같은 계산**
// (breakoutOfStock + chainVerdicts)으로 이 종목·날짜의 사슬·후보를 세우고 차트 층 입력으로 옮긴다.
// 규칙: .claude/decisions.md 「Daily 타점 생성 = 돌파 사슬」(기본 차트 사슬 층 = A안).
//
// ## 출처 — 보는 집합의 「돌파」 줄
// 차트 ◇ 가 그리는 **같은 식**(깔때기의 늦은 한 벌 `slowExpr` — 박자가 갈리면 ▼ 가 ◇ 보다 먼저 바뀐다)의 잎에서
// 고른다. 줄이 여럿이면: 패널에 저장한 선택 → 첫 줄. **켜지고 격자판에 (살아서) 연동된 줄만** 후보다 — 미연동 줄은
// 집합 평가에서도 미완성이라(gridLink) 차트만 그 줄로 그리면 "보이는 것 ≠ 도는 것"이 된다. 목록 이름 = 판 이름.
// ⚠ 세로 줄은 **그 「돌파」 줄 단독**의 후보다(격자판의 "그날 후보"와 같은 수) — 같은 줄의 다른 AND 조건·전이·
// 목록 상한은 모른다. 그건 ◇(집합 평가)가 말하고, 세로 줄은 ◇ 로 남았는지(`keptTimes`)를 진하기로 가른다.
// ◇ 가 아직 계산 중이면 전부 "통과"(연한 쪽)로 칠한다 — 먼저 진하게 칠하면 결과가 오며 거꾸로 옅어진다.
//
// ## 재료 가드(◇ 와 같은 규칙)
// · 하루 스냅샷은 **집합의 날짜**에서만 당긴다 — 다른 날짜 차트가 15MB 재료를 또 부르지 않게(useCellSet 과 같은
//   캐시를 나눠 쓴다). 드리프트한 차트는 이유를 말하고 안 그린다.
// · 기준선 재료(/point-grids)가 오기 전엔 모른다 — 먼저 그리면 이름표가 뒤집힌다.
//
// ## KRX/UN
// 분봉 캔들은 **늘 UN 봉**이고 시장 토글은 % 분모만 바꾼다(deriveMinuteView). 그래서 띠·세로 줄(시각)은 두 시장에서
// 같다. 밴드 면만 값이 % 라 UN 분모(스냅샷 basePrice.un) → 가격 → 차트 분모로 옮긴다(정확 환산).
import { useMemo } from "react";
import type { Time } from "lightweight-charts";
import { breakoutOfStock, chainVerdicts, type BreakoutChainResult, type CellPredicate, type ChainVerdict } from "@trade-data-manager/market/domain";
import type { ChainFillSpec, ChainOverlayInput } from "../../chart/chainLayer.js";
import { usePointGrids } from "../../lib/PointGridsContext.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";
import { useWorkbench } from "../../store/workbench.js";
import { useDock } from "../../store/dock.js";
import { BREAKOUT_BASE, BREAKOUT_HIGH } from "../../styles/palette.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { leavesOf } from "../filter/expr.js";
import type { FilterStage } from "../filter/stage.js";
import { breakoutText } from "./chainChecks.js";
import { gridShortName, liveGridPanelOf } from "../dailyGen/gridLink.js";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

export interface ChainSourceRow {
    stageId: string;
    pred: BreakoutPred;
    /** 판 이름(「격자 2」) — 상세는 `full`(hover). */
    text: string;
    full: string;
    /** 이 줄에 연동된 격자판 — 연동된 줄만 목록에 선다. */
    gridPanel: string;
}

export interface ChainOverlay {
    rows: ChainSourceRow[];
    source: ChainSourceRow | null;
    input: ChainOverlayInput | null;
    /** 안 그리는 이유(켜져 있는데 못 그릴 때) — 칩 설명·메뉴 머리가 말한다. null = 그리는 중이거나 꺼짐. */
    why: string | null;
}

/** 출처 목록 — **켜지고 격자판에 (살아서) 연동된** 돌파 줄만, 이름 = 판 이름(순수부 — 테스트 표면). */
export function chainSourceRowsOf(
    stages: readonly FilterStage[],
    bindings: Readonly<Record<string, string>>,
    slots: readonly string[],
): ChainSourceRow[] {
    const out: ChainSourceRow[] = [];
    for (const st of stages) {
        if (!st.enabled) continue;
        const p = st.predicates.find((x): x is BreakoutPred => x.kind === "breakout");
        const panel = p ? liveGridPanelOf(bindings, slots, st.id) : undefined;
        if (!p || panel === undefined) continue;
        out.push({ stageId: st.id, pred: p, text: gridShortName(panel), full: breakoutText(p), gridPanel: panel });
    }
    return out;
}

export function useChainOverlay(args: {
    on: boolean;
    showBands: boolean;
    sourceId: string;
    code: string;
    /** 집합의 날짜(= 전역 focus.date). */
    date: string;
    /** 차트가 집합의 날짜를 보고 있나(드리프트·핀 아님). */
    onSetDate: boolean;
    /** 차트 봉이 이 종목의 것인가(전환 과도기 가드 — ownBundle). */
    ownBars: boolean;
    /** 차트 % 분모(minuteView.base) — 밴드 면 환산. */
    chartBase: number | null;
    /** ◇ 로 남은 봉 시각(unix초) — null = 아직 모름(집합 평가 중). */
    keptTimes: ReadonlySet<number> | null;
}): ChainOverlay {
    const { on, showBands, sourceId, code, date, onSetDate, ownBars, chartBase, keptTimes } = args;
    const stages = leavesOf(useFunnel().slowExpr);
    const bindings = useWorkbench((s) => s.themeBindings);
    const slots = useDock((s) => s.slots);
    const mode = useWorkbench((s) => s.filterMode);

    const rows = useMemo(() => chainSourceRowsOf(stages, bindings, slots), [stages, bindings, slots]);
    const source = rows.find((r) => r.stageId === sourceId) ?? rows[0] ?? null;

    const active = on && mode === "daily" && source !== null && onSetDate;
    const snapQ = useDaySnapshot(active ? date : null);
    const pointGrids = usePointGrids();
    const stocks = snapQ.data?.date === date ? snapQ.data.stocks : null;

    const computed = useMemo(() => {
        if (!active || !source || !stocks || pointGrids.byDate === null) return null;
        const stock = stocks.find((s) => s.code === code);
        if (!stock) return { stock: null } as const;
        const p = source.pred;
        const res = breakoutOfStock(stock, pointGrids.gridOf(code, date)?.base ?? null, { zigzagPct: p.zigzagPct, bandPct: p.bandPct }, { trace: showBands });
        const verdicts = chainVerdicts(res.bars, stock, p.chain);
        return { stock, res, verdicts } as const;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, source, stocks, pointGrids.byDate, code, date, showBands]);

    const input = useMemo<ChainOverlayInput | null>(() => {
        if (!ownBars || computed === null || computed.stock === null) return null;
        const { stock, res, verdicts } = computed;
        return chainOverlayInputOf(stock.times, res, verdicts, keptTimes, showBands ? { unBase: stock.basePrice.un, chartBase } : null);
    }, [ownBars, computed, showBands, chartBase, keptTimes]);

    let why: string | null = null;
    if (on) {
        if (mode !== "daily") why = "하루 모드에서만 그린다";
        else if (source === null) why = "보는 집합에 켜진 「돌파」 줄이 없다 — 조건판에서 만든다";
        else if (!onSetDate) why = `집합 날짜(${date})의 차트에서만 그린다`;
        else if (snapQ.error) why = `분봉 재료 조회 실패: ${(snapQ.error as Error).message}`;
        else if (pointGrids.error) why = `기준선 재료 조회 실패: ${pointGrids.error.message}`;
        else if (computed?.stock === null) why = "그날 유니버스 밖 종목";
    }
    return { rows, source, input: on ? input : null, why };
}

/**
 * 사슬·판정 → 차트 층 입력(순수). 시각은 `/day-replay` 봉 시각(unix초).
 * · 사슬 끝 = 그 사슬의 **마지막 거래 봉** — 차트엔 채움봉이 없어 인덱스 끝(끝 봉 − 1)으로는 못 잡는다.
 * · 후보 = 최종 통과 봉, kept = ◇ 로 남았나(`kept` null = 모름 → 전부 통과로).
 * · 밴드 면(`bands` 가 있을 때만): 러닝 밴드 = 하단~상단, 기준선 밴드 = 기준선 하단~기준선. UN % → 가격 → 차트 %.
 */
export function chainOverlayInputOf(
    times: readonly number[],
    res: BreakoutChainResult & { baselinePct?: number | null },
    verdicts: readonly ChainVerdict[],
    kept: ReadonlySet<number> | null,
    bands: { unBase: number | null; chartBase: number | null } | null,
): ChainOverlayInput {
    const lastBar = new Map<number, number>();
    for (const b of res.bars) lastBar.set(b.chain, b.i);
    const chains = res.chains.map((c, k) => ({
        from: times[c.start],
        to: times[lastBar.get(k) ?? c.start],
        baselineFrom: c.baselineFrom === null ? null : times[c.baselineFrom],
    }));
    const candidates = verdicts.filter((v) => v.picked).map((v) => ({
        time: times[v.bar.i], label: v.bar.label, kept: kept !== null && kept.has(times[v.bar.i]),
    }));
    const fills: ChainFillSpec[] = [];
    const unBase = bands?.unBase ?? null;
    const chartBase = bands?.chartBase ?? null;
    if (bands !== null && res.trace && unBase !== null && chartBase !== null && chartBase > 0) {
        const toChart = (v: number | null): number | null => (v === null ? null : ((unBase * (1 + v / 100) - chartBase) / chartBase) * 100);
        const tr = res.trace;
        const B = res.baselinePct ?? null;
        fills.push({
            color: BREAKOUT_HIGH,
            pts: times.map((t, i) => ({ time: t as Time, lo: toChart(tr.bottom[i] ?? null), hi: toChart(tr.top[i] ?? null) })),
        });
        if (B !== null) {
            fills.push({
                color: BREAKOUT_BASE,
                pts: times.map((t, i) => {
                    const lo = tr.baseBottom[i] ?? null;
                    return { time: t as Time, lo: toChart(lo), hi: lo === null ? null : toChart(B) };
                }),
            });
        }
    }
    return { chains, candidates, fills };
}
