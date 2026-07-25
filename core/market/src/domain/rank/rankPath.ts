// core/market/domain/rank — 진입가 앵커 인트라데이 경로(순위 필터 "구름"의 도메인 규칙, 단일 출처).
//  · 서버는 (종목,날)별 raw UN 분봉만 내려주고, 이 순수함수로 클라가 타점별 경로를 만든다(서버 파생 폐기).
//  · 앵커 = 진입 바(진입 time 이상 첫 분봉)의 UN 종가. 그 날 모든 분봉을 진입가 대비 %로 환산.
//    경로가 전부 같은 하루 안이라 스케일 동일 → 권리락·전일종가 보정과 무관(인트라데이 자족).
//  · t = 진입 대비 경과분(진입 전 = 음수, 맥락용). 앵커 0/부재면 [](표본에서 제외).

/** 정규화 입력 = 한 분봉의 UN OHLC 중 필요한 값(무손실 string). */
export interface AnchorBar {
    time: string; // HH:MM:SS
    close: string;
    high: string;
    low: string;
}

/** 정규화 결과 한 바 — 전부 진입가 대비 %. */
export interface EntryPathBar {
    t: number; // 진입 후 경과분(진입 바 = 0)
    close: number;
    high: number;
    low: number;
}

const toMin = (hms: string): number => {
    const [h, m] = hms.split(":");
    return Number(h) * 60 + Number(m);
};

/** 한 타점(진입 시각)의 진입가 앵커 경로. bars 는 그 (종목,날)의 시간 오름차순 분봉. */
export function entryAnchoredBars(bars: AnchorBar[], entryTime: string): EntryPathBar[] {
    const t0 = toMin(entryTime);
    const entry = bars.find((b) => toMin(b.time) >= t0); // 진입 바 = 앵커
    const anchor = entry ? Number(entry.close) : 0;
    if (!(anchor > 0)) return [];
    const pct = (v: string): number => ((Number(v) - anchor) / anchor) * 100;
    return bars.map((b) => ({ t: toMin(b.time) - t0, close: pct(b.close), high: pct(b.high), low: pct(b.low) }));
}
