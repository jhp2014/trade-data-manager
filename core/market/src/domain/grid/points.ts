// core/market/domain/grid/points — 격자 → Point 판정(읽기 층, 순수). 규칙: .claude/decisions.md "자동 타점 격자" 절.
//
// 격자(PointGrid)만 보고 계산한다 — 분봉을 다시 보지 않는 것이 격자 스키마 충분성의 증명이다.
// 여기 파라미터(게이트·제외 창·병합)는 전부 읽기 시점 조절이고, 격자의 floor(20억) **위에서만** 움직인다.
// 서버(recon 재현율)·클라(깔때기/시트)가 같은 함수를 쓴다 — rankSectionOf 와 같은 공유 방식.
//
// Point = 레벨(기준선 또는 유효 마디)을 넘는 **첫 자격 캔들**(신고가·게이트·제외 창 밖·bullOnly 시 양봉).
// 게이트를 올리면 Point 가 목록 안의 뒤 캔들로 **이동**한다(사라지는 게 아니라) — 격자에 floor 이상
// 신고가 캔들이 전부 실려 있어 가능한 의미론. 한 캔들이 여러 레벨을 한 번에 넘으면 Point 는 하나다
// (가장 낮은 레벨 몫 — "몇 개 갱신했나"는 후속 특징 층의 파생).
import type { GridNewHigh, PointGrid } from "./grid.js";

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
}

export const DEFAULT_POINT_DEFINITION: PointDefinition = {
    baselineGateEok: 50,
    renewalGateEok: 30,
    excludeUptoMin: 0,
    mergeRisePct: 0,
    bullOnly: true,
};

/** 판정된 Point. 파생 특징(기준선 대비 %·저점 깊이 등)은 특징 층이 격자+이 목록에서 계산한다. */
export interface DerivedPoint {
    /** breakout = 기준선 돌파(레벨 0), renewal = 마디 갱신. */
    kind: "breakout" | "renewal";
    /** 시간순 순번(0부터). */
    ordinal: number;
    /** Point 캔들 시각(자정기준 분). */
    min: number;
    /** Point 캔들 고가(그 시점 러닝 최고가, 원주가). */
    high: number;
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

/**
 * 격자 → Point 목록(시간 오름차순). 기준선이 없거나 그날 한 번도 안 닿았으면 빈 배열 —
 * Point 문법은 기준선 돌파에서 시작한다(마디도 기준선 위에서만 레벨이 된다).
 *
 * 레벨 산정: 기준선 + "자기 시점 러닝 최고가였던 확정 고점"만(단조 증가 — 하락 중 낮은 고점은 넘어도
 * 러닝 최고가 갱신이 아니라 레벨이 아니다). 미확정 마지막 마디는 아직 넘을 대상이 아니다(보수).
 * mergeRisePct > 0 이면 직전 저점 대비 상승폭 미달 마디를 병합한다 — 병합된 마디는 maxKept 를 올리지
 * 않으므로, 그 위 캔들의 Point 는 다음 유효 레벨 몫으로 넘어간다(축약의 최소 형태 — 시간 조건 T 는 후속).
 */
export function pointsOf(grid: PointGrid, def: PointDefinition = DEFAULT_POINT_DEFINITION): DerivedPoint[] {
    if (grid.base === null || grid.touchMin === null) return [];

    const levels: { price: number; renewal: boolean; min: number | null }[] = [{ price: grid.base, renewal: false, min: null }];
    let maxKept = grid.base;
    let lastLow: number | null = null;
    for (const p of grid.pivots) {
        if (p.kind === "low") {
            lastLow = p.price;
            continue;
        }
        // 재정식화 격자에선 미확정 고점·비단조 고점이 애초에 안 실려 아래 두 가드는 도달 불가 — 방어로만 유지.
        if (p.confirmedMin === null) continue;
        if (p.price <= maxKept) continue;
        if (def.mergeRisePct > 0 && lastLow !== null && ((p.price - lastLow) / lastLow) * 100 < def.mergeRisePct) continue;
        levels.push({ price: p.price, renewal: true, min: p.min });
        maxKept = p.price;
    }

    // 레벨별 독립 판정이라 게이트 비대칭(기준선 50 > 재돌파 30) 탓에 breakout Point 없이 renewal 만
    // 서는 날이 있을 수 있다 — 의도된 동작: 돌파 사건 자체는 touchMin 이 증언하고, "유효 breakout 있는
    // 날만 보기"는 읽기 층 필터의 몫이다(격자·판정이 미리 좁히지 않는다).
    const gateBase = BigInt(def.baselineGateEok) * KRW_PER_EOK;
    const gateRenewal = BigInt(def.renewalGateEok) * KRW_PER_EOK;
    const chosen = new Map<number, { levelIdx: number; e: GridNewHigh }>();
    for (let li = 0; li < levels.length; li++) {
        const level = levels[li];
        const gate = level.renewal ? gateRenewal : gateBase;
        for (const e of grid.newHighs) {
            if (e.min <= def.excludeUptoMin) continue;
            if (def.bullOnly && !(e.close > e.open)) continue; // 양봉 여부는 격자 OHLC 에서 파생(사실만 굽는 원칙)
            // 기준선은 스침(≥)이 돌파, 마디는 초과(>)가 갱신 — 터치 의미론과 러닝 최고가 갱신 의미론의 차이.
            if (level.renewal ? e.high <= level.price : e.high < level.price) continue;
            if (BigInt(e.tv) < gate) continue;
            if (!chosen.has(e.min)) chosen.set(e.min, { levelIdx: li, e });
            break; // 이 레벨의 첫 자격 캔들 — 못 찾으면 그 레벨은 Point 없음
        }
    }

    return [...chosen.values()]
        .sort((a, b) => a.e.min - b.e.min)
        .map((c, i) => ({
            kind: c.levelIdx === 0 ? ("breakout" as const) : ("renewal" as const),
            ordinal: i,
            min: c.e.min,
            high: c.e.high,
            tv: c.e.tv,
            levelPrice: levels[c.levelIdx].price,
            levelIdx: c.levelIdx,
            levelMin: levels[c.levelIdx].min,
        }));
}
