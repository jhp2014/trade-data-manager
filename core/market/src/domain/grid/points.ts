// core/market/domain/grid/points — 격자 → Point 판정(읽기 층, 순수). 규칙: .claude/decisions.md "자동 타점 격자" 절.
//
// 격자(PointGrid)만 보고 계산한다 — 분봉을 다시 보지 않는 것이 격자 스키마 충분성의 증명이다.
// 여기 파라미터(게이트·제외 창·병합)는 전부 읽기 시점 조절이고, 격자의 floor(20억) **위에서만** 움직인다.
// 서버(recon)·클라(깔때기/시트)가 같은 함수를 쓴다 — rankSectionOf 와 같은 공유 방식.
//
// Point = 레벨(기준선 또는 유효 마디)을 넘는 **첫 자격 캔들**(신고가·게이트·제외 창 밖·bullOnly 시 양봉).
// 게이트를 올리면 그 레벨의 Point 가 **같은 레벨의** 뒤 캔들로 이동한다 — 격자에 floor 이상 신고가 캔들이
// 전부 실려 있어 가능한 의미론. ⚠ "사라지지 않는다"는 이제 **참이 아니다**: 뒤 캔들이 그 사이 확정된
// 마디를 넘어 버리면 귀속이 위 레벨로 올라가므로(아래 규칙) 그 레벨은 Point 없이 끝날 수 있다.
//
// **레벨 귀속 = 그 캔들이 넘은 가장 높은 레벨, 갈리는 자리에선 언제나 재돌파**(2026-09-01, 옛 "가장 낮은
// 레벨 몫"을 뒤집음). 뜻: 기준선을 저대금으로 건드려 **고가를 만들고** 밀렸다면 그다음 크로싱은 기준선
// 돌파가 아니라 전고점 재돌파다(그 고가가 곧 마디 = 더 높은 레벨). 고가를 못 만든 채 그대로 올라가
// 위에서 대금이 터지면 그건 여전히 돌파 — "고가를 만들었나"의 해상도는 격자의 zigzag 2%다.
// 게이트는 **귀속된 레벨의 것**을 쓰고, 실패하면 낮은 레벨로 내려가지 않는다(= 그 캔들은 Point 아님).
//
// `kind` 가 `levelIdx === 0` 의 파생으로 남는 이유(우연이 아니다): 신고가 목록은 러닝 최고가라 값이 단조
// 증가하고, 마디 가격은 확정 시점의 러닝 최고가다 → 한 캔들이 넘는 레벨 집합은 **그 캔들 이전에 확정된
// 레벨 전부**이고 최고 레벨은 그중 마지막이다. 따라서 레벨 0 귀속 ⟺ 그 시점까지 기준선 위 **유효** 마디가
// 하나도 없었다 ⟺ 훼손되지 않은 첫 돌파. 같은 단조성이 "레벨당 Point 최대 1개"도 보장한다(귀속이 비감소).
// "유효"가 단서다 — mergeRisePct 로 병합된 마디는 구조적으로는 고가를 만들었어도 레벨이 아니라 그 위 캔들이
// breakout 으로 선다(기본 0 이라 지금은 무사건). zigzag 2% 미만 눌림도 같은 이유로 훼손이 아니다.
import type { GridNewHigh, PointGrid } from "./grid.js";
import { levelViewOf } from "./levelView.js";

/** Point 판정 정의 — 전부 읽기 시점 조절(격자 불변). SavedSet payload 에 실릴 물건. */
export interface PointDefinition {
    /** 기준선 돌파 게이트(억원). 기본 50. */
    baselineGateEok: number;
    /** 재돌파(마디 갱신) 게이트(억원). 기본 30. */
    renewalGateEok: number;
    /** 이 분(자정기준) **이하**의 캔들은 Point 자격 없음(구조에는 참여). 기본 0 = 제외 없음 —
     *  프리마켓·시초도 정규장과 동일 취급(2026-08-31 사용자 확정: 손 타점 85건 중 12건이 실제로 그 시간대,
     *  재현율 67→80% 차이의 원인이 이 기본값이었다). 노브는 유지 — 필요하면 읽기 시점에 올린다. */
    excludeUptoMin: number;
    /** 유효 마디 하한(%) — 직전 저점 대비 상승폭이 이보다 작은 마디는 레벨에서 병합(잔 갱신 무시). 기본 0 = 병합 없음.
     *  ⚠ "직전 저점" = 인접 확정 고점 사이 구간의 **봉 최저**(재정식화 격자), 첫 마디는 선행 저점이
     *  없어 병합이 안 걸린다 — 잔 눌림 기준보다 병합이 덜 걸리는 쪽으로 편향된다(수용, 2026-08-31). */
    mergeRisePct: number;
    /** 양봉(종가 > 시가) 캔들만 Point 자격. 기본 true. 양봉 여부는 격자 OHLC 의 읽기 파생이라 끄는 데 재굽기 불필요. */
    bullOnly: boolean;
    /**
     * 기준 밴드 마진 m'(%, 도메인 [0, 0.5] — 상한 = 굽는 하한 `GridDetectOptions.approachPct`, §10.3).
     * 기준 가격 P(러닝 최고가·마디·기준선)를 선이 아니라 밴드 [P×(1−m'), P] 로 본다 — 전고점에 딱 닿기
     * 전의 접근 봉부터 갱신 영역(보수적 측정). 0 = 옛 strict 갱신(v8 동치 — recon 회귀 증명 모드).
     * 사건 재구성 `high > maxBefore×(1−m')` 하나로 하단 없이 정확하다(grid.ts maxBefore 주석).
     * ⚠ 검출 옵션의 `approachPct`(굽는 하한)와 **동명이지만 다른 물건** — 이쪽은 읽기 조절이다.
     */
    approachPct: number;
    /**
     * 결과 걷기의 허용 폭 T 쌍(%, 도메인 [2,30] — 하한 2 는 zigzag 해상도, decisions.md "시그널 결과").
     * ⚠ **판정 노브가 아니다** — `pointsOf`/`levelsOf` 는 `PointJudgeDef` 로 좁혀 받아 원리적으로 못 본다.
     * 결과 값(연장 고점·낙폭)·차트 다리 표식(T2 연동)을 바꾸는 정의 상태이고, 한 타입에 두는 이유는
     * 영속(wb.pointDef)·SavedSet payload·parsePointDef 가 전부 이 타입 하나를 지나기 때문(렌즈 노브의 후임).
     */
    toleranceT1Pct: number;
    toleranceT2Pct: number;
}

/** Point 판정이 실제로 보는 노브 6개 — T 를 구독에서 배제하는 계약이 시그니처다(usePointGrids 헛재파생 방지). */
export type PointJudgeDef = Pick<
    PointDefinition,
    "baselineGateEok" | "renewalGateEok" | "excludeUptoMin" | "mergeRisePct" | "bullOnly" | "approachPct"
>;

/** 허용 폭 T 의 도메인(%) — 하한 = zigzag 해상도(이보다 얕은 눌림은 격자에 없다). */
export const TOLERANCE_MIN_PCT = 2;
export const TOLERANCE_MAX_PCT = 30;

/** 기준 밴드 마진 m' 의 도메인(%) — 상한 = 굽는 하한(0.5, 이 위는 재굽기 없인 정확 재구성 불가). */
export const APPROACH_MIN_PCT = 0;
export const APPROACH_MAX_PCT = 0.5;

export const DEFAULT_POINT_DEFINITION: PointDefinition = {
    baselineGateEok: 50,
    renewalGateEok: 30,
    excludeUptoMin: 0,
    mergeRisePct: 0,
    bullOnly: true,
    approachPct: 0.5, // 기본 = 밴드 폭 전부(사용자 확정 — "전고점 −0.5% 안이면 갱신 영역")
    toleranceT1Pct: 2,
    toleranceT2Pct: 5,
};

/** 판정된 Point. 파생 특징(기준선 대비 %·저점 깊이 등)은 특징 층이 격자+이 목록에서 계산한다. */
export interface DerivedPoint {
    /** breakout = 훼손 없는 기준선 돌파(레벨 0), renewal = 마디 재돌파. 머리 주석의 단조성 논증 참조. */
    kind: "breakout" | "renewal";
    /** 시간순 순번(0부터). */
    ordinal: number;
    /** Point 캔들 시각(자정기준 분). */
    min: number;
    /** Point 캔들 고가(원주가). 상단 돌파 Point 는 그 시점 러닝 최고가, 밴드 Point(m'>0)는 밴드 안 고가. */
    high: number;
    /** Point 캔들 종가(원주가) — 값 축("기준선 대비 %"·"당일 %")의 분자다. 서버 축이 쓰던
     *  "타점 시각 이하 마지막 UN 종가"와 같은 값이다(그 봉이 곧 타점 봉이므로). */
    close: number;
    /** Point 캔들 자신의 거래대금(원, string) — 게이트 판정에 쓴 값. */
    tv: string;
    /** 넘은 레벨 가격 — breakout 은 기준선 값, renewal 은 (병합 후) 마디 가격. */
    levelPrice: number;
    /** 넘은 레벨의 서수 — 0 = 기준선, n = (병합 후) n번째 유효 마디. "직전 마디 수" 특징의 원자재. */
    levelIdx: number;
    /** 넘은 마디의 발생 시각(분). breakout(기준선)은 null — 저점 깊이·간격 특징이 창의 왼쪽 끝으로 쓴다. */
    levelMin: number | null;
}

const KRW_PER_EOK = 100_000_000n;

/** 유효 레벨 하나 — 기준선(renewal=false, min=null) 또는 (병합 후) 마디. 가격은 강한 단조 증가. */
export interface PointLevel {
    price: number;
    renewal: boolean;
    min: number | null;
    /** 마디의 확정 봉 시각(기준선은 null = 항상 유효). 귀속은 **캔들 이전에 확정된 레벨**만 본다 —
     *  m'=0 에선 단조성 정리가 미래 레벨 교차를 원천 차단해 불필요했지만, 밴드 마진(m'>0)은 캔들
     *  고가보다 0.5% 안까지 높은 **미래** 마디를 관통시킨다(2026-09-05 recon 실측 42차트 — 미래 누출). */
    confirmedMin: number | null;
}

/**
 * 레벨 산정: 기준선 + 마디 뷰(`levelViewOf`)의 레벨 고점 — 경로 뷰(pivots)를 직접 순회하지 않는다(v9).
 * 기준선 아래 레벨은 건너뛴다(maxKept 가 base 에서 시작 — Point 문법은 기준선 위에서만).
 * 미확정 마지막 마디는 levelViewOf 가 이미 배제한다(아직 넘을 대상이 아님, 보수).
 * mergeRisePct > 0 이면 직전 레벨 쌍의 저점(lastLow — v8 의 "직전 저점 피벗"과 같은 값) 대비 상승폭
 * 미달 마디를 병합한다 — 병합된 마디는 maxKept 를 올리지 않으므로, 그 위 캔들의 Point 는 다음 유효
 * 레벨 몫으로 넘어간다(축약의 최소 형태 — 시간 조건 T 는 후속).
 *
 * `pointsOf` 밖으로 뺀 이유는 recon(point-diff)이 **같은 레벨 정의** 위에서 옛/새 규칙을 대조해야 해서다 —
 * 사본을 두면 레벨 규칙이 바뀔 때 양쪽이 함께 틀어져 diff 가 조용히 무의미해진다. 기준선 없으면 빈 배열.
 */
export function levelsOf(grid: PointGrid, def: PointJudgeDef = DEFAULT_POINT_DEFINITION): PointLevel[] {
    if (grid.base === null) return [];
    const levels: PointLevel[] = [{ price: grid.base, renewal: false, min: null, confirmedMin: null }];
    let maxKept = grid.base;
    let lastLow: number | null = null;
    for (const pair of levelViewOf(grid)) {
        const p = pair.high;
        if (
            p.price > maxKept &&
            !(def.mergeRisePct > 0 && lastLow !== null && ((p.price - lastLow) / lastLow) * 100 < def.mergeRisePct)
        ) {
            levels.push({ price: p.price, renewal: true, min: p.min, confirmedMin: p.confirmedMin });
            maxKept = p.price;
        }
        lastLow = pair.low.price; // 다음 레벨의 병합 분모 = 직전 레벨 쌍의 저점
    }
    return levels;
}

/**
 * 격자 → Point 목록(시간 오름차순). 기준선이 없거나 그날 한 번도 안 닿았으면 빈 배열 —
 * Point 문법은 기준선 돌파에서 시작한다(마디도 기준선 위에서만 레벨이 된다).
 *
 * ⚠ **전제: `grid.newHighs` 는 시간 오름차순, `maxBefore` 비감소, `high > maxBefore` 로 걸러낸
 * 부분열의 `high` 가 강한 단조 증가**(detectGrid 의 불변식 — v9 밴드 목록은 통째로는 톱니다).
 * 산출물의 시간 오름차순도, 머리 주석의 단조성 논증도 전부 이 전제 위에 선다 — 격자를 손으로 만들거나
 * 구버전 파일을 읽히면(버전 가드가 유일한 방어선) 여기서 조용히 틀어진다.
 * 후보 = `high > maxBefore×(1−m')` 인 사건 봉(m' = approachPct). m'=0 이면 상단 돌파만(v8 동치),
 * 기본 0.5 면 전고점 −0.5% 밴드 접근 봉까지 — 밴드 Point 가 먼저 서면 뒤의 실제 크로싱 봉은 그 레벨의
 * Point 가 아니다(의도 — 접근이 곧 갱신 영역).
 */
export function pointsOf(grid: PointGrid, def: PointJudgeDef = DEFAULT_POINT_DEFINITION): DerivedPoint[] {
    if (grid.base === null || grid.touch === null) return [];
    const levels = levelsOf(grid, def);

    // 캔들 중심 판정 — 자격 캔들마다 **최고 레벨**에 귀속시키고 그 레벨의 게이트로 거른다.
    // 게이트 비대칭(기준선 50 > 재돌파 30) 탓에 breakout Point 없이 renewal 만 서는 날이 있을 수 있다 —
    // 의도된 동작: 돌파 사건 자체는 touch 가 증언하고, "유효 breakout 있는 날만 보기"는 읽기 층 필터의
    // 몫이다(격자·판정이 미리 좁히지 않는다).
    const gateBase = BigInt(def.baselineGateEok) * KRW_PER_EOK;
    const gateRenewal = BigInt(def.renewalGateEok) * KRW_PER_EOK;
    // 밴드 마진 m'(§10.3) — 0 이면 (1−m)=1 이라 아래 비교가 옛 strict 판정과 비트 동일(v8 동치 모드).
    const bandK = 1 - def.approachPct / 100;
    const chosen: { levelIdx: number; e: GridNewHigh }[] = [];
    // 이미 Point 를 낸 최고 레벨 커서. 귀속은 m' > 0 에서도 시간 비감소다(진입 봉도 자기 시점까지의 전
    // 레벨을 (1−m') 마진으로 넘는다 — 사건 조건이 그걸 보장). 커서가 "위 레벨을 지난 뒤 아래 레벨 재접근"
    // 을 삼키는 것은 **의도**다: 저대금으로 이미 넘은 자리의 재접근은 새 시그널이 아니다(§10.3 원문).
    let usedLevel = -1;
    for (const e of grid.newHighs) {
        // 사건 재구성 — m'=0: 상단 돌파만(v8 동치) / m'>0: 그 마진의 밴드 사건까지(§10.3 증명).
        if (!(e.high > e.maxBefore * bandK)) continue;
        if (e.min <= def.excludeUptoMin) continue;
        if (def.bullOnly && !(e.close > e.open)) continue; // 양봉 여부는 격자 OHLC 에서 파생(사실만 굽는 원칙)
        // 기준선은 스침(≥)이 돌파, 마디는 초과(>)가 갱신 — 터치 의미론과 러닝 최고가 갱신 의미론의 차이.
        // 마진은 레벨 가격에도 건다(기준 선 → 기준 밴드): m'=0 에서 오늘의 ≥/> 와 일치.
        // **캔들 이전에 확정된 레벨만**(strict — 확정 봉과 같은 분도 배제: 봉 내부 순서 증명 불가) —
        // m'=0 에선 정리가 보장하던 것을 마진 아래에선 명시로 지킨다(미래 마디 관통 = 미래 누출).
        let li = -1;
        for (let i = levels.length - 1; i >= 0; i--) {
            const lv = levels[i];
            if (lv.confirmedMin !== null && lv.confirmedMin >= e.min) continue;
            if (lv.renewal ? e.high > lv.price * bandK : e.high >= lv.price * bandK) {
                li = i;
                break;
            }
        }
        if (li < 0 || li <= usedLevel) continue; // 넘은 레벨 없음 · 이미 Point 를 낸 레벨(그 레벨의 첫 자격 캔들만)
        // 귀속 레벨의 게이트로만 판정한다 — 미달이면 낮은 레벨로 **내려가지 않는다**(그 캔들은 Point 아님).
        // 대신 같은 레벨의 다음 자격 캔들이 계속 후보다(게이트 상향 = Point 이동 의미론 보존).
        if (BigInt(e.tv) < (levels[li].renewal ? gateRenewal : gateBase)) continue;
        usedLevel = li;
        chosen.push({ levelIdx: li, e });
    }

    return chosen.map((c, i) => ({
        kind: c.levelIdx === 0 ? ("breakout" as const) : ("renewal" as const),
        ordinal: i,
        min: c.e.min,
        high: c.e.high,
        close: c.e.close,
        tv: c.e.tv,
        levelPrice: levels[c.levelIdx].price,
        levelIdx: c.levelIdx,
        levelMin: levels[c.levelIdx].min,
    }));
}
