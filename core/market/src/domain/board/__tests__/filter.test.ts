import { describe, it, expect } from "vitest";
import {
    availablePredicates,
    boardPredicateDef,
    defaultParams,
    evalBoardFilter,
    evalPredicate,
    isBoardFilterActive,
    normalizeBoardFilter,
    predicateAvailable,
    predicateEvidence,
    EOD_FIELDS,
    LIVE_FIELDS,
    LIVE_ALARM_FIELDS,
    type BoardFilterExpr,
    type BoardFilterGroup,
    type BoardMetrics,
    type MetricField,
} from "../filter.js";
import { AMOUNT_BUCKETS_EOK } from "../amount.js";

const metrics = (over: Partial<BoardMetrics>): BoardMetrics => ({ highPct: 20, amount: 300e8, buckets: AMOUNT_BUCKETS_EOK.map(() => 1), trailingHighs: { krx: [20, 5, 3], un: [20, 5, 3] }, ...over });
const grp = (kind: string, params: Record<string, number>, mode: "dim" | "hide" = "dim") => ({ predicates: [{ kind, params }], mode });

describe("board filter (순수)", () => {
    it("defaultParams — 레지스트리 기본값", () => {
        expect(defaultParams("smallAmount")).toEqual({ ltEok: 100 });
        expect(defaultParams("minAmtFew")).toEqual({ eok: 50, op: 0, maxCount: 0 });
        expect(defaultParams("newHighFar")).toEqual({ market: 1, window: 20, tol: 2, side: 0 }); // market 기본 UN, side 기본 내부
    });

    it("weakHigh — 고가 등락률 < 기준이면 제외(dim)", () => {
        const expr: BoardFilterExpr = { groups: [grp("weakHigh", { ltPct: 10 })] };
        expect(evalBoardFilter(expr, metrics({ highPct: 8 })).effect).toBe("dim");
        expect(evalBoardFilter(expr, metrics({ highPct: 12 })).effect).toBe("show");
    });

    it("smallAmount — 총거래대금 < 100억 제외", () => {
        const expr: BoardFilterExpr = { groups: [grp("smallAmount", { ltEok: 100 })] };
        expect(evalBoardFilter(expr, metrics({ amount: 50e8 })).effect).toBe("dim");
        expect(evalBoardFilter(expr, metrics({ amount: 200e8 })).effect).toBe("show");
    });

    it("minAmtFew — ≥50억 분봉 횟수 ≤ 0 이면 제외", () => {
        const expr: BoardFilterExpr = { groups: [grp("minAmtFew", { eok: 50, maxCount: 0 })] };
        // buckets 를 **억 값으로** 짓는다 — 경계 배열이 늘거나 줄어도 이 테스트의 뜻이 안 변한다.
        // (필터는 인덱스가 아니라 하한 억 값으로 합산하므로 구간이 끼어들어도 저장식은 그대로 통한다.)
        const at = (...eoks: number[]): number[] => AMOUNT_BUCKETS_EOK.map((lo) => (eoks.includes(lo) ? 1 : 0));
        expect(evalBoardFilter(expr, metrics({ buckets: at(50) })).effect).toBe("show"); // ≥50억 1회 → 0회 아님
        expect(evalBoardFilter(expr, metrics({ buckets: at(20, 30, 40) })).effect).toBe("dim"); // ≥50억 0회 → 제외
    });

    it("newHighFar — 20일 최고가 밖이면 제외 (market 파라미터로 시장 선택, 미지정=UN)", () => {
        const expr: BoardFilterExpr = { groups: [grp("newHighFar", { window: 20, tol: 2 })] };
        // 당일 20 = 최고 20 → 근접 → show
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: [5, 30, 3], un: [20, 5, 3] } })).effect).toBe("show");
        // 당일 5, 최고 30 → 갭 25 > 2 → 밖 → 제외 (UN 기준 — market 미지정 폴백)
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: [20, 5, 3], un: [5, 30, 3] } })).effect).toBe("dim");
        // market=0(KRX) 명시 → KRX 배열로 판정
        const krxExpr: BoardFilterExpr = { groups: [grp("newHighFar", { market: 0, window: 20, tol: 2 })] };
        expect(evalBoardFilter(krxExpr, metrics({ trailingHighs: { krx: [5, 30, 3], un: [20, 5, 3] } })).effect).toBe("dim");
        expect(evalBoardFilter(krxExpr, metrics({ trailingHighs: { krx: [20, 5, 3], un: [5, 30, 3] } })).effect).toBe("show");
    });

    it("newHighFar KRX AND UN — 둘 다 매물대 내부여야 흐리게(한쪽 돌파 시 해제)", () => {
        const expr: BoardFilterExpr = {
            groups: [
                {
                    predicates: [
                        { kind: "newHighFar", params: { market: 0, window: 20, tol: 2 } },
                        { kind: "newHighFar", params: { market: 1, window: 20, tol: 2 } },
                    ],
                    mode: "dim",
                },
            ],
        };
        const inside = [5, 30, 3]; // 매물대 내부(당일 5 vs 최고 30)
        const breakout = [20, 5, 3]; // 돌파(당일=창최고)
        // 둘 다 내부 → 흐리게
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: inside, un: inside } })).effect).toBe("dim");
        // KRX 돌파 → AND 불충족 → 해제
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: breakout, un: inside } })).effect).toBe("show");
        // UN 돌파 → 해제
        expect(evalBoardFilter(expr, metrics({ trailingHighs: { krx: inside, un: breakout } })).effect).toBe("show");
    });

    it("그룹 AND, 그룹끼리 OR + 그룹별 mode(hide 우선)", () => {
        const expr: BoardFilterExpr = {
            groups: [
                { predicates: [{ kind: "smallAmount", params: { ltEok: 100 } }, { kind: "weakHigh", params: { ltPct: 10 } }], mode: "hide" }, // AND
                grp("weakHigh", { ltPct: 5 }, "dim"),
            ],
        };
        // 소액 AND 약세 둘 다 참(hide 그룹) → hide
        expect(evalBoardFilter(expr, metrics({ amount: 50e8, highPct: 8 })).effect).toBe("hide");
        // 소액만 참(AND 불충족) · 약세<5 아님 → show
        expect(evalBoardFilter(expr, metrics({ amount: 50e8, highPct: 20 })).effect).toBe("show");
        // 약세<5(dim 그룹만) → dim
        expect(evalBoardFilter(expr, metrics({ amount: 500e8, highPct: 3 })).effect).toBe("dim");
    });

    it("사유(reasons) — 매칭 술어 라벨", () => {
        const expr: BoardFilterExpr = { groups: [grp("weakHigh", { ltPct: 10 })] };
        expect(evalBoardFilter(expr, metrics({ highPct: 8 })).reasons).toEqual(["고가 등락률 < 10%"]);
    });

    it("isBoardFilterActive", () => {
        expect(isBoardFilterActive({ groups: [] })).toBe(false);
        expect(isBoardFilterActive({ groups: [{ predicates: [], mode: "dim" }] })).toBe(false);
        expect(isBoardFilterActive({ groups: [grp("weakHigh", { ltPct: 10 })] })).toBe(true);
    });

    it("minAmtFew — buckets 결손이면 매칭 안 함(라이브 전 종목 오검출 버그 방어)", () => {
        const expr: BoardFilterExpr = { groups: [grp("minAmtFew", { eok: 50, maxCount: 0 })] };
        // buckets 없음: 옛 버그는 count 0 ≤ 0 → dim(전 종목). 이제 false → show.
        expect(evalBoardFilter(expr, metrics({ buckets: undefined })).effect).toBe("show");
    });

    it("minAmtFew op — ≥ 방향(강조·AND 그룹에서 '많이 터진 종목'을 직접 쓴다)", () => {
        const at = (...eoks: number[]): number[] => AMOUNT_BUCKETS_EOK.map((lo) => (eoks.includes(lo) ? 1 : 0));
        const expr: BoardFilterExpr = { groups: [grp("minAmtFew", { eok: 50, op: 1, maxCount: 2 })] };
        expect(evalBoardFilter(expr, metrics({ buckets: at(50, 70) })).effect).toBe("dim"); // 2회 ≥ 2 → 매칭
        expect(evalBoardFilter(expr, metrics({ buckets: at(50) })).effect).toBe("show"); // 1회 → 아님
        // 라벨이 값을 말한다(옛 상수 "분봉 대금" 은 사유 툴팁에서 파라미터를 잃었다)
        expect(evalBoardFilter(expr, metrics({ buckets: at(50, 70) })).reasons).toEqual(["분봉 50억+ 대금 ≥ 2회"]);
    });

    it("normalizeBoardFilter — 옛 자유 입력 eok 를 구간 경계로 스냅(평가는 그대로, 라벨만 참이 된다)", () => {
        const at = (...eoks: number[]): number[] => AMOUNT_BUCKETS_EOK.map((lo) => (eoks.includes(lo) ? 1 : 0));
        const legacy: BoardFilterExpr = { groups: [grp("minAmtFew", { eok: 60, maxCount: 0 })] };
        const normalized = normalizeBoardFilter(legacy);
        expect(normalized.groups[0].predicates[0].params.eok).toBe(70);
        // 무손실: 60 은 이미 "70억+ 를 세는" 식이었다 — 스냅 전후 판정이 같다
        for (const buckets of [at(50), at(70), at(20, 30), []]) {
            expect(evalBoardFilter(normalized, metrics({ buckets })).effect).toBe(evalBoardFilter(legacy, metrics({ buckets })).effect);
        }
        expect(normalizeBoardFilter({ groups: [grp("minAmtFew", { eok: 50, maxCount: 0 })] }).groups[0].predicates[0].params.eok).toBe(50);
    });

    it("normalizeBoardFilter — 표현 자체가 없는 두 자리(최대 경계 초과·비숫자)", () => {
        const top = AMOUNT_BUCKETS_EOK[AMOUNT_BUCKETS_EOK.length - 1];
        // 최대 경계 초과: 옛 뜻("항상 0회")을 담을 칸이 없다 → 최대 칸으로 클램프(판정이 바뀐다, 주석에 명시)
        expect(normalizeBoardFilter({ groups: [grp("minAmtFew", { eok: 300, maxCount: 0 })] }).groups[0].predicates[0].params.eok).toBe(top);
        // 손상 저장물: 최대 칸으로 밀지 않고 기본값으로
        expect(normalizeBoardFilter({ groups: [grp("minAmtFew", { eok: Number.NaN, maxCount: 0 })] }).groups[0].predicates[0].params.eok).toBe(50);
    });

    it("newHighFar side — 내부(기본)=매물대 안 매칭 / 돌파=창최고 근접 매칭", () => {
        const inside = { krx: [5, 30, 3], un: [5, 30, 3] }; // 당일 5 vs 최고 30 = 내부
        const breakout = { krx: [20, 5, 3], un: [20, 5, 3] }; // 당일=창최고 = 돌파
        const insideExpr: BoardFilterExpr = { groups: [grp("newHighFar", { window: 20, tol: 2, side: 0 })] };
        expect(evalBoardFilter(insideExpr, metrics({ trailingHighs: inside })).effect).toBe("dim"); // 내부 매칭
        expect(evalBoardFilter(insideExpr, metrics({ trailingHighs: breakout })).effect).toBe("show");
        const breakoutExpr: BoardFilterExpr = { groups: [grp("newHighFar", { window: 20, tol: 2, side: 1 })] };
        expect(evalBoardFilter(breakoutExpr, metrics({ trailingHighs: breakout })).effect).toBe("dim"); // 돌파 매칭(알람이 쓰는 방향)
        expect(evalBoardFilter(breakoutExpr, metrics({ trailingHighs: inside })).effect).toBe("show");
    });
});

// ── 선택(화이트리스트) 방향 — 매칭이 아니라 **미매칭**에 처리를 건다 ──
describe("선택 방향(나머지 흐리게/숨김)", () => {
    const wl = (kind: string, params: Record<string, number>, mode: "dimRest" | "hideRest" = "hideRest"): BoardFilterGroup => ({ predicates: [{ kind, params }], mode });

    it("맞는 종목은 남고 나머지가 처리된다", () => {
        const expr: BoardFilterExpr = { groups: [wl("weakHigh", { op: 1, ltPct: 10 })] }; // 고가 등락률 ≥ 10%
        expect(evalBoardFilter(expr, metrics({ highPct: 20 })).effect).toBe("show");
        expect(evalBoardFilter(expr, metrics({ highPct: 5 })).effect).toBe("hide");
        expect(evalBoardFilter({ groups: [wl("weakHigh", { op: 1, ltPct: 10 }, "dimRest")] }, metrics({ highPct: 5 })).effect).toBe("dim");
    });

    it("결손(미결)은 통과 — 데이터 없는 종목이 조용히 사라지지 않는다", () => {
        // 배제 방향에선 미결→false 로 깎아도 안전하지만(안 지운다), 선택 방향에선 같은 깎기가 '나머지'로 몰아 지운다.
        const expr: BoardFilterExpr = { groups: [wl("minAmtFew", { eok: 50, op: 1, maxCount: 1 })] };
        expect(evalBoardFilter(expr, metrics({ buckets: undefined })).effect).toBe("show");
    });

    it("빈 그룹은 아무도 안 지운다(편집 중 빈 껍데기)", () => {
        expect(evalBoardFilter({ groups: [{ predicates: [], mode: "hideRest" }] }, metrics({})).effect).toBe("show");
    });

    it("선택 그룹이 여럿이면 교집합 — '그룹끼리 OR' 은 배제 방향의 읽기다", () => {
        const expr: BoardFilterExpr = { groups: [wl("weakHigh", { op: 1, ltPct: 10 }), wl("smallAmount", { ltEok: 100 })] };
        // 등락률 ≥10 ✓ · 대금 < 100억 ✓ → 둘 다 만족해야 남는다
        expect(evalBoardFilter(expr, metrics({ highPct: 20, amount: 50e8 })).effect).toBe("show");
        expect(evalBoardFilter(expr, metrics({ highPct: 20, amount: 500e8 })).effect).toBe("hide"); // 두 번째 탈락
        expect(evalBoardFilter(expr, metrics({ highPct: 5, amount: 50e8 })).effect).toBe("hide"); // 첫 번째 탈락
    });

    it("사유는 '… 아님' — 왜 나머지로 갔는지", () => {
        const expr: BoardFilterExpr = { groups: [wl("weakHigh", { op: 1, ltPct: 10 }, "dimRest")] };
        expect(evalBoardFilter(expr, metrics({ highPct: 5 })).reasons).toEqual(["고가 등락률 ≥ 10% 아님"]);
    });

    it("사유에 **실제로 어긋난 술어만** 담긴다 — 통과한 조건을 탈락 사유로 말하지 않는다", () => {
        const expr: BoardFilterExpr = {
            groups: [{ mode: "dimRest", predicates: [{ kind: "weakHigh", params: { op: 1, ltPct: 10 } }, { kind: "smallAmount", params: { ltEok: 100 } }] }],
        };
        // 등락률 ≥10 ✓ · 대금 500억(<100억 아님) ✗ → 둘째만 사유
        expect(evalBoardFilter(expr, metrics({ highPct: 20, amount: 500e8 })).reasons).toEqual(["일봉 대금 < 100억 아님"]);
    });

    it("배제와 섞이면 처리 우선순위 그대로(hide > dim > show)", () => {
        const expr: BoardFilterExpr = { groups: [wl("weakHigh", { op: 1, ltPct: 10 }, "dimRest"), grp("smallAmount", { ltEok: 100 }, "hide")] };
        expect(evalBoardFilter(expr, metrics({ highPct: 5, amount: 50e8 })).effect).toBe("hide");
        expect(evalBoardFilter(expr, metrics({ highPct: 5, amount: 500e8 })).effect).toBe("dim");
    });

    it("강조(mark)는 방향이 없다 — 매칭된 쪽만 🔥", () => {
        const expr: BoardFilterExpr = { groups: [{ predicates: [{ kind: "weakHigh", params: { op: 1, ltPct: 10 } }], mode: "mark" }] };
        expect(evalBoardFilter(expr, metrics({ highPct: 20 })).marked).toBe(true);
        expect(evalBoardFilter(expr, metrics({ highPct: 5 })).marked).toBe(false);
    });
});

describe("capability (requires ⊆ provides)", () => {
    it("소스가 제공하는 필드로 술어 팔레트가 갈린다", () => {
        // EOD: buckets 있음·deltas/marketCap/themeRanks 없음
        const eod = availablePredicates(EOD_FIELDS).map((d) => d.kind);
        expect(eod).toContain("minAmtFew"); // buckets ✓
        expect(eod).not.toContain("signal"); // deltas ✗
        expect(eod).not.toContain("rank"); // themeRanks ✗
        // 라이브(현재 배선): buckets 없음 → minAmtFew 자동 제외(옛 수동 필터 대체)
        const live = availablePredicates(LIVE_FIELDS).map((d) => d.kind);
        expect(live).not.toContain("minAmtFew");
        expect(live).toContain("newHighFar");
        // 알람용 full 라이브(deltas·marketCap·themeRanks 제공)면 실시간 술어 열림
        const full = availablePredicates(new Set<MetricField>(["highPct", "amount", "trailingHighs", "marketCap", "deltas", "themeRanks"])).map((d) => d.kind);
        expect(full).toEqual(expect.arrayContaining(["signal", "marketCap", "rank", "newHighFar"]));
    });

    it("predicateAvailable — 요구 필드 하나라도 없으면 불가", () => {
        const signal = boardPredicateDef("signal")!;
        expect(predicateAvailable(signal, new Set<MetricField>(["deltas"]))).toBe(true);
        expect(predicateAvailable(signal, new Set<MetricField>(["marketCap"]))).toBe(false);
    });
});

describe("실시간 술어(signal·marketCap·rank)", () => {
    const m = (over: Partial<BoardMetrics>): BoardMetrics => ({ highPct: 0, amount: 0, ...over });

    it("signal — 창별 델타가 임계 이상이면 매칭(rate ∧ tv 동시)", () => {
        const s = boardPredicateDef("signal")!;
        const metrics = m({ deltas: { d30s: { rate: 0.5, tvEok: 45 }, d1m: { rate: 0.3, tvEok: 30 } } });
        expect(s.test(metrics, { window: 0, rateMin: 0.4, tvMin: 40 })).toBe(true); // 30초: 0.5≥0.4 ∧ 45≥40
        expect(s.test(metrics, { window: 0, rateMin: 0.4, tvMin: 50 })).toBe(false); // tv 부족
        expect(s.test(metrics, { window: 1, rateMin: 0.4, tvMin: 40 })).toBe(false); // 1분: rate 0.3<0.4
        expect(s.test(m({ deltas: { d30s: undefined } }), { window: 0, rateMin: 0, tvMin: 0 })).toBe(false); // 창 데이터 없음
    });

    it("marketCap — 시총 이하 매칭", () => {
        const mc = boardPredicateDef("marketCap")!;
        expect(mc.test(m({ marketCap: 3_000 }), { lteEok: 5_000 })).toBe(true);
        expect(mc.test(m({ marketCap: 8_000 }), { lteEok: 5_000 })).toBe(false);
        expect(mc.test(m({ marketCap: undefined }), { lteEok: 5_000 })).toBe(false);
    });

    it("rank — any-theme reach(속한 테마 중 하나라도 K위 이내)", () => {
        const r = boardPredicateDef("rank")!;
        expect(r.test(m({ themeRanks: { krx: [10, 4], un: [7, 2] } }), { market: 1, threshold: 3 })).toBe(true); // UN min 2 ≤ 3
        expect(r.test(m({ themeRanks: { krx: [10, 4], un: [7, 5] } }), { market: 1, threshold: 3 })).toBe(false); // UN min 5 > 3
        expect(r.test(m({ themeRanks: { krx: [1], un: [] } }), { market: 1, threshold: 3 })).toBe(false); // UN 순위 없음
    });
});

describe("predicateEvidence — 술어가 자기 근거를 설명(label+실측값)", () => {
    const m = (over: Partial<BoardMetrics>): BoardMetrics => ({ highPct: 0, amount: 0, ...over });

    it("signal — 창·실측 델타", () => {
        const def = boardPredicateDef("signal")!;
        expect(predicateEvidence(def, m({ deltas: { d30s: { rate: 0.52, tvEok: 45.4 } } }), { kind: "signal", params: { window: 0, rateMin: 0.4, tvMin: 40 } })).toBe("30초 시그널 (+0.5%p · 45억)");
    });

    it("marketCap·rank — 실측값 + 임계", () => {
        expect(predicateEvidence(boardPredicateDef("marketCap")!, m({ marketCap: 3_000 }), { kind: "marketCap", params: { lteEok: 5_000 } })).toBe("시총 3,000억 (≤ 5,000억)");
        expect(predicateEvidence(boardPredicateDef("rank")!, m({ themeRanks: { krx: [], un: [7, 2] } }), { kind: "rank", params: { market: 1, threshold: 3 } })).toBe("테마 2위 (3위 이내·UN)");
    });

    it("evidence 미구현 술어는 label 폴백", () => {
        expect(predicateEvidence(boardPredicateDef("weakHigh")!, m({ highPct: 3 }), { kind: "weakHigh", params: { ltPct: 10 } })).toBe("고가 등락률 < 10%");
    });
});

describe("mark(강조) 모드 — 배제와 직교하는 🔥 축", () => {
    it("mark 그룹 매칭 → marked=true·markReasons, effect 는 불변(배제 아님)", () => {
        const expr: BoardFilterExpr = { groups: [{ predicates: [{ kind: "weakHigh", params: { ltPct: 10 } }], mode: "mark" }] };
        const v = evalBoardFilter(expr, metrics({ highPct: 8 }));
        expect(v.effect).toBe("show"); // 강조는 제외가 아니다
        expect(v.marked).toBe(true);
        expect(v.markReasons).toEqual(["고가 등락률 < 10%"]);
        expect(v.reasons).toEqual([]); // 배제 사유와 분리
        expect(evalBoardFilter(expr, metrics({ highPct: 12 })).marked).toBe(false);
    });

    it("🔥 이면서 다른 그룹으로 흐리게일 수 있다(직교)", () => {
        const expr: BoardFilterExpr = {
            groups: [
                { predicates: [{ kind: "weakHigh", params: { ltPct: 10 } }], mode: "mark" },
                { predicates: [{ kind: "smallAmount", params: { ltEok: 100 } }], mode: "dim" },
            ],
        };
        const v = evalBoardFilter(expr, metrics({ highPct: 8, amount: 50e8 }));
        expect(v.effect).toBe("dim");
        expect(v.marked).toBe(true);
    });
});

describe("watchlist 이관 술어(price·themeRank) + evalPredicate 3치", () => {
    const m = (over: Partial<BoardMetrics>): BoardMetrics => ({ highPct: 0, amount: 0, ...over });
    const pi = (kind: string, params: Record<string, number>, textParams?: Record<string, string>) => ({ kind, params, ...(textParams ? { textParams } : {}) });

    it("price — 방향(≥/≤)·임계, 시세 결손은 미결(requires 존재 검사)", () => {
        const def = boardPredicateDef("price")!;
        expect(evalPredicate(def, m({ price: 12_000 }), pi("price", { op: 0, value: 11_500 }))).toBe(true);
        expect(evalPredicate(def, m({ price: 11_000 }), pi("price", { op: 0, value: 11_500 }))).toBe(false);
        expect(evalPredicate(def, m({ price: 11_000 }), pi("price", { op: 1, value: 11_500 }))).toBe(true); // ≤
        expect(evalPredicate(def, m({}), pi("price", { op: 0, value: 11_500 }))).toBeUndefined(); // 시세 없음 = 미결
        expect(predicateEvidence(def, m({ price: 12_000 }), pi("price", { op: 0, value: 11_500 }))).toBe("12,000원 ≥ 11,500원");
    });

    it("themeRank — 지정 테마 reach/delta, 순위·이력 결손은 미결(test3)", () => {
        const def = boardPredicateDef("themeRank")!;
        const mm = m({ themeRankMap: { 반도체: { un: { rank: 3, past: 7 }, krx: { rank: 5 } } } });
        const reach = pi("themeRank", { market: 1, mode: 0, threshold: 3 }, { theme: "반도체" });
        expect(evalPredicate(def, mm, reach)).toBe(true);
        expect(evalPredicate(def, mm, pi("themeRank", { market: 0, mode: 0, threshold: 3 }, { theme: "반도체" }))).toBe(false); // KRX 5위 > 3
        expect(evalPredicate(def, mm, pi("themeRank", { market: 1, mode: 0, threshold: 3 }, { theme: "AI" }))).toBeUndefined(); // 그 테마 순위 미도착
        // delta — past 필수(없으면 미결)
        expect(evalPredicate(def, mm, pi("themeRank", { market: 1, mode: 1, threshold: 4 }, { theme: "반도체" }))).toBe(true); // 7→3 = 4계단
        expect(evalPredicate(def, mm, pi("themeRank", { market: 0, mode: 1, threshold: 1 }, { theme: "반도체" }))).toBeUndefined(); // KRX past 없음
        expect(evalPredicate(def, mm, pi("themeRank", { market: 1, mode: 0, threshold: 3 }))).toBe(false); // 테마 미지정 = 불성립(미결 아님)
        expect(predicateEvidence(def, mm, reach)).toBe("반도체 UN 7위→3위 (3위 이내)");
        expect(predicateEvidence(def, m({ themeRankMap: { 반도체: { un: { rank: 3 } } } }), reach)).toBe("반도체 UN 3위 (3위 이내)"); // past 없음 — undefined 인쇄 안 됨
    });

    it("LIVE_ALARM_FIELDS 에서 price·themeRank 가용(보드 소스에선 불가)", () => {
        const alarm = availablePredicates(LIVE_ALARM_FIELDS).map((d) => d.kind);
        expect(alarm).toEqual(expect.arrayContaining(["price", "themeRank"]));
        expect(availablePredicates(LIVE_FIELDS).map((d) => d.kind)).not.toContain("themeRank");
        expect(availablePredicates(EOD_FIELDS).map((d) => d.kind)).not.toContain("price");
    });
});
