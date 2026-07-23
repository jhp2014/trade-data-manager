// RankPaths — 순위 필터 타점 집합의 "진입 후 인트라데이 경로"(파생 읽기모델, app 소유 CQRS 읽기측).
// situation(review point 삼중키)마다 진입가 대비 % 경로를 당일 종가까지 만든다. horizon crop·분위·MFE/MAE 는 클라.
//  · 앵커 = 진입 바(진입 time 이상 첫 분봉)의 UN 종가. UN 은 항상 존재(UN ⊇ KRX)라 통합 스케일로 일관.
//  · MFE=고가%·MAE=저가% 를 위해 바별 close/high/low % 를 모두 싣는다(excursion 과소평가 방지).
//  · (code,date) 로 묶어 분봉을 하루 1회만 조회 — 같은 날 여러 타점(day 축 fanout 등)은 재사용한다.
import type { MinuteReader, MinuteCandle, RankPoint } from "@trade-data-manager/market";
import type { RankPointPath, RankPathBar } from "@trade-data-manager/wire";

export type { RankPointPath, RankPathBar };

export interface RankPathsDeps {
    minuteCandle: MinuteReader;
}

const dayKey = (code: string, date: string): string => `${code}|${date}`;
const toMin = (hms: string): number => {
    const [h, m] = hms.split(":");
    return Number(h) * 60 + Number(m);
};

export class RankPaths {
    constructor(private readonly deps: RankPathsDeps) {}

    async paths(points: RankPoint[]): Promise<RankPointPath[]> {
        // (code,date) 중복 제거 후 분봉 조회 1회씩 → 맵으로 공유.
        const days = [...new Map(points.map((p) => [dayKey(p.stockCode, p.date), p])).values()];
        const byDay = new Map<string, MinuteCandle[]>();
        await Promise.all(
            days.map(async (p) => {
                byDay.set(dayKey(p.stockCode, p.date), await this.deps.minuteCandle.getMinuteCandles(p.stockCode, p.date));
            }),
        );
        return points.map((p) => pathOf(p, byDay.get(dayKey(p.stockCode, p.date)) ?? []));
    }
}

/** 한 타점의 진입~당일 종가 경로. 분봉이 없거나 앵커가 0이면 bars=[]. */
function pathOf(p: RankPoint, candles: MinuteCandle[]): RankPointPath {
    const t0 = toMin(p.time);
    const fwd = candles.filter((c) => toMin(c.time) >= t0);
    const anchor = fwd.length ? Number(fwd[0].un.close) : 0;
    const bars: RankPathBar[] =
        anchor > 0
            ? fwd.map((c) => {
                  const pct = (v: string): number => ((Number(v) - anchor) / anchor) * 100;
                  return { t: toMin(c.time) - t0, close: pct(c.un.close), high: pct(c.un.high), low: pct(c.un.low) };
              })
            : [];
    return { stockCode: p.stockCode, date: p.date, time: p.time, bars };
}
