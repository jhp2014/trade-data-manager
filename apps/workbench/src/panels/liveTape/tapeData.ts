// 테이프 누적 병합과 선분화 — 순수 계산(React·DOM 모름).
//
// ## 병합(mergeTape)
// 서버 델타 프로토콜의 클라 반쪽: rev(백필 세대)·date·theme 가 보유분과 일치할 때만 델타를 잇고,
// 하나라도 다르면 풀 교체다(과거가 채워졌거나 날이 바뀌었거나 딴 테마다). 델타의 첫 분(since)은
// 형성 중이던 분의 재전송이라 **겹치는 분은 새 값이 이긴다**. 델타에 모르는 코드가 오면 그대로
// 추가한다(신규 편입 — 과거는 백필 완료 시 rev 증가로 풀 응답에 실려 온다).
//
// ## 선분화(segmentsOf) — 복기 memberPath 와 **반대로**, 빈 분은 잇지 않는다
// 복기의 빈 분은 "거래 없음"이라 직전 종가로 채우는 게 참이지만, 테이프의 빈 분은 "그 분에 폴링에
// 안 실렸다"(조건 이탈 또는 기계 결손)다 — 채우면 없던 관찰을 지어내는 것이라 선을 끊는다(사용자 확정).
// 끊긴 자리의 **뜻**은 전역 틱 비트맵이 가른다: 틱 있음 = 이탈(참인 정보), 틱 없음 = 모름(회색띠).
import type { LiveTapeStock, LiveTapeView } from "@trade-data-manager/wire";

/** 클라가 들고 있는 누적 테이프 — 종목별 평행 배열(분 오름차순). */
export interface TapeData {
    date: string;
    rev: number;
    theme: string;
    ticks: number[];
    stocks: Map<string, LiveTapeStock>;
    pending: string[];
}

const emptyOf = (view: LiveTapeView): TapeData => ({
    date: view.date,
    rev: view.rev,
    theme: view.theme,
    ticks: view.ticks,
    stocks: new Map(view.stocks.map((s) => [s.code, s])),
    pending: view.pending,
});

/** 정렬 배열에서 v 이상이 시작되는 인덱스(잘라낼 자리). */
const cutAt = (arr: readonly number[], v: number): number => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < v) lo = mid + 1;
        else hi = mid;
    }
    return lo;
};

/** 서버 응답을 보유분에 병합. prev 가 없거나(첫 폴) 풀 응답이면 교체, 델타면 겹침(>= since)을 새 값으로 잇는다. */
export function mergeTape(prev: TapeData | null, view: LiveTapeView): TapeData {
    if (prev === null || view.since === null || view.date !== prev.date || view.rev !== prev.rev || view.theme !== prev.theme)
        return emptyOf(view);
    const since = view.since;
    const ticks = [...prev.ticks.slice(0, cutAt(prev.ticks, since)), ...view.ticks];
    const stocks = new Map(prev.stocks);
    for (const s of view.stocks) {
        const old = stocks.get(s.code);
        if (!old) {
            stocks.set(s.code, s); // 신규 편입 — 지금부터의 조각(과거는 백필→rev 증가→풀에서)
            continue;
        }
        const cut = cutAt(old.minutes, since);
        stocks.set(s.code, {
            ...s, // name·themes·watched 는 최신이 정본
            minutes: [...old.minutes.slice(0, cut), ...s.minutes],
            rate: [...old.rate.slice(0, cut), ...s.rate],
            cumAmount: [...old.cumAmount.slice(0, cut), ...s.cumAmount],
        });
    }
    return { date: view.date, rev: view.rev, theme: view.theme, ticks, stocks, pending: view.pending };
}

export interface TapePoint {
    x: number; // 벽시계 분
    y: number; // 등락률 %
}

/**
 * 연속 선분들 — 분이 1씩 이어지는 구간마다 한 조각. 끊긴 자리는 그리지 않는 게 곧 정보다.
 * 한 점짜리 조각도 남긴다(점으로 그린다) — 1분만 떴다 사라진 종목도 "떴다"는 사실이 보여야 한다.
 */
export function segmentsOf(minutes: readonly number[], rate: readonly number[]): TapePoint[][] {
    const out: TapePoint[][] = [];
    let seg: TapePoint[] = [];
    for (let i = 0; i < minutes.length; i++) {
        if (seg.length > 0 && minutes[i] !== minutes[i - 1] + 1) {
            out.push(seg);
            seg = [];
        }
        seg.push({ x: minutes[i], y: rate[i] });
    }
    if (seg.length > 0) out.push(seg);
    return out;
}

/**
 * 기계 결손 구간(회색띠) — `[from, to]` 안에서 엔진 틱이 없는 연속 분들. 서버 재시작·WS 끊김이면
 * 모든 선이 동시에 끊기고 그 자리가 이 띠로 덮인다 — "이탈"과 눈으로 갈리는 근거.
 * to 는 마지막 틱 분까지만 의미가 있다(그 뒤는 미래지 결손이 아니다) — 자르는 건 호출자 몫.
 */
export function machineGaps(ticks: readonly number[], from: number, to: number): Array<{ from: number; to: number }> {
    if (to < from) return [];
    const have = new Set(ticks);
    const out: Array<{ from: number; to: number }> = [];
    let start: number | null = null;
    for (let m = from; m <= to; m++) {
        if (have.has(m)) {
            if (start !== null) {
                out.push({ from: start, to: m - 1 });
                start = null;
            }
        } else if (start === null) start = m;
    }
    if (start !== null) out.push({ from: start, to });
    return out;
}
