// 평가 예산(useCellSet `budgeted`) — 한 태스크에 캐시 미스 평가 한 벌. 탐색판 조건 그룹 10벌이 한 렌더에
// 몰려 수 초 굳던 자리를 막는 줄이다. 잠그는 것:
//  ① 예산 호출은 이번 태스크에 누가 이미 평가했으면 미룬다("모름") — 두 벌이 **같은 렌더에** 서지 않는다.
//  ② 미룬 평가는 다음 프레임에 스스로 다시 청해 결국 선다(교착 없음).
//  ③ 캐시 적중은 예산과 무관하게 즉시 선다(다시 가는 날짜가 깜빡이지 않는다).
import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { DayReplay, MinuteDerived } from "@trade-data-manager/wire";
import { kstToUnix } from "@trade-data-manager/market/domain";
import { Providers, seededClient } from "../../../test/renderPanel.js";
import { exprOfStages, type SetExpr } from "../expr.js";
import { useCellSet } from "../useCellSet.js";

const DATE = "2026-09-16";
const t0 = kstToUnix(DATE, "09:00:00");
const md = (code: string, rate: number[]): MinuteDerived => ({
    code, times: rate.map((_, i) => t0 + i * 60), rate, cumAmount: rate.map((_, i) => (i + 1) * 1e8),
    high: rate, low: rate, open: 0, minuteOpen: rate, minuteHigh: rate, minuteLow: rate,
    trailingHighs: { krx: [], un: [] }, basePrice: { krx: null, un: null },
});
/** 매 테스트 새 스냅샷 — 메모 캐시의 바깥 키가 stocks 참조라, 공유하면 앞 테스트의 평가가 캐시로 남는다. */
const snap = (): DayReplay => ({ date: DATE, stocks: [{ ...md("000100", [1, 2, 3, 4]), name: "가", market: "거래소", marketCap: null, themes: [] }] });
const rateFrom = (id: string, from: number): SetExpr =>
    exprOfStages([{ id, enabled: true, predicates: [{ kind: "candle", axes: { rate: { on: true, from } } }] }]);

type Log = { a: boolean; b: boolean; c: boolean }[];
function Probe({ log, exprs }: { log: Log; exprs: [SetExpr, SetExpr, SetExpr] }): null {
    const a = useCellSet(exprs[0], [], DATE);
    const b = useCellSet(exprs[1], [], DATE, undefined, true);
    const c = useCellSet(exprs[2], [], DATE, undefined, true);
    log.push({ a: a.ready, b: b.ready, c: c.ready });
    return null;
}
const mount = (log: Log, exprs: [SetExpr, SetExpr, SetExpr], data: DayReplay): ReturnType<typeof render> =>
    render(<Providers client={seededClient({ daySnapshot: { date: DATE, data } })}><Probe log={log} exprs={exprs} /></Providers>);

describe("useCellSet 평가 예산", () => {
    it("예산 호출은 한 렌더에 한 벌 이상 새로 서지 않고, 미룬 것은 결국 선다", async () => {
        const log: Log = [];
        mount(log, [rateFrom("a", 1), rateFrom("b", 2), rateFrom("c", 3)], snap());
        // 예산을 안 따르는 호출(보는 집합)은 첫 렌더에 서고, 그 평가가 이번 태스크 예산을 쓴다.
        expect(log[0]).toEqual({ a: true, b: false, c: false });
        await waitFor(() => expect(log.at(-1)).toEqual({ a: true, b: true, c: true }));
        // b·c 가 **같은 렌더에서 함께** 새로 선 적이 없다 — 한 태스크 한 벌.
        for (let i = 1; i < log.length; i++) {
            const newly = (["b", "c"] as const).filter((k) => log[i]![k] && !log[i - 1]![k]);
            expect(newly.length, `render ${i}`).toBeLessThanOrEqual(1);
        }
    });

    it("캐시에 있으면 예산과 무관하게 첫 렌더에 선다", async () => {
        const exprs: [SetExpr, SetExpr, SetExpr] = [rateFrom("a", 1), rateFrom("b", 2), rateFrom("c", 3)];
        // 같은 client — 캐시 키에 재료 세대(테마 투영 등)가 실려, client 가 갈리면 다른 선반이다(실앱은 하나).
        const client = seededClient({ daySnapshot: { date: DATE, data: snap() } });
        const first: Log = [];
        const r = render(<Providers client={client}><Probe key="1" log={first} exprs={exprs} /></Providers>);
        await waitFor(() => expect(first.at(-1)).toEqual({ a: true, b: true, c: true }));
        const again: Log = [];
        r.rerender(<Providers client={client}><Probe key="2" log={again} exprs={exprs} /></Providers>); // 새로 마운트
        expect(again[0]).toEqual({ a: true, b: true, c: true });
    });
});
