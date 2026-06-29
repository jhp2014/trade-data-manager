// core/market/domain/marketCap — 날짜별 시가총액 백필(일회성). 순수함수(외부 import 0).
//
// 시총(D) = shares(D-1) × 원주가 KRX_close(D-1)  — "전날 종가 시총을 그날 칸에 기록".
//   · shares·종가 둘 다 직전 거래일(D-1) 기준 → 한 행 = 순수 전일 종가 시총(장중 확인값과 일치).
//   · 원주가 = 미수정(권리락·액분 무관 실제 시총). 저장 일봉(수정주가)과 분리해 transient 로만 쓴다.
// shares(t) = tot_current − Σ(delta where list_dt > t)  — 현재총수에서 역산(상장일 무의존).
//   · 역산이라 발행주식수 이벤트 조회창이 [백필기간, 오늘]만 덮으면 됨(기간 내 증감만 빼면 복원).
import type { DateRange } from "./dateRange.js";

/** 예탁원 상장정보일정 1건 — 발행주식수 변동 이벤트. 가격/수량은 무손실 string. */
export interface ListInfoEvent {
    /** 변동(상장)일 YYYY-MM-DD. */
    listDate: string;
    /** 이 이벤트의 증감 주식수(delta; 감자 등은 음수 가능). Σdelta = 현재총수(recon ④). */
    issueQty: string;
    /** 이벤트 후 누적 총발행주식수 = 현재총수 스냅샷(행마다 동일). */
    totalShares: string;
    /** 발행가(신규상장이면 공모가). */
    issuePrice: string;
    /** 사유(신규상장/유상증자/무상증자/감자/액면분할/…). */
    issueType: string;
}

/** 원주가(미수정) KRX 일별 종가 — 시총 계산용 transient. */
export interface RawDailyClose {
    date: string; // YYYY-MM-DD
    close: string; // 원(₩)
}

/** 날짜별 시총 1행. */
export interface DailyMarketCap {
    stockCode: string;
    date: string; // YYYY-MM-DD (시총을 기록할 거래일 D)
    marketCap: string; // 원(₩) 무손실
}

/**
 * 이벤트들에서 현재 총발행주식수 스냅샷을 뽑는다(가장 최신 이벤트의 totalShares).
 * 이벤트가 0건이면 null — 역산 불가(호출자가 조회창을 넓혀 재시도).
 */
export function currentTotalShares(events: ListInfoEvent[]): string | null {
    if (events.length === 0) return null;
    const latest = events.reduce((a, b) => (b.listDate >= a.listDate ? b : a));
    return latest.totalShares;
}

/** shares(t) = tot_current − Σ(delta where list_dt > t). t 시점의 상장주식수(BigInt). */
export function sharesAt(events: ListInfoEvent[], totalCurrent: string, date: string): bigint {
    let shares = BigInt(totalCurrent);
    for (const e of events) {
        if (e.listDate > date) shares -= BigInt(e.issueQty);
    }
    return shares;
}

/**
 * 백필 행 생성(순수). 각 거래일 D 에 직전 거래일 prevTD 의 (shares × 원주가종가)를 기록.
 * - rawCloses: KRX 원주가 종가. 기간 첫날의 prevTD 를 위해 from 이전 거래일을 1개 이상 포함해야 한다.
 * - 출력은 range[from,to] 안의 거래일만(직전 거래일 prevTD 가 존재하는 것만).
 */
export function computeMarketCapBackfill(params: {
    stockCode: string;
    rawCloses: RawDailyClose[];
    events: ListInfoEvent[];
    totalCurrent: string;
    range: DateRange;
}): DailyMarketCap[] {
    const { stockCode, rawCloses, events, totalCurrent, range } = params;
    const asc = [...rawCloses].sort((a, b) => a.date.localeCompare(b.date));
    const out: DailyMarketCap[] = [];
    for (let i = 1; i < asc.length; i++) {
        const cur = asc[i]; // 기록 대상 거래일 D
        const prev = asc[i - 1]; // 직전 거래일 D-1
        if (cur.date < range.from || cur.date > range.to) continue;
        const shares = sharesAt(events, totalCurrent, prev.date);
        const marketCap = shares * BigInt(prev.close);
        out.push({ stockCode, date: cur.date, marketCap: marketCap.toString() });
    }
    return out;
}
