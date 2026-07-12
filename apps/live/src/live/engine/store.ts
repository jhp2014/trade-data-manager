// 엔진 단일 인메모리 상태(런타임, 영속 안 함). 정본: market-eye store 에서 theme/이벤트 제거·슬림화.
// 코드별 최근 N틱 링버퍼 → 후속 signals(델타) 계산 근거.
import type { Quote, ScanHit } from "./types.js";

const WINDOW_MS = 70_000; // 보관 윈도우: 과거 70초. 60초 델타(signals)가 60초-과거 틱을 안정적으로 찾도록 여유.
const RING = 16; // 개수 상한(폴링 5초 가정 시 ~75초 커버) — 70초 창 + 지터 여유.

export class EngineStore {
    /** 코드 → 최신 시세 */
    readonly quotes = new Map<string, Quote>();
    /** 현재 스캔에 잡힌 종목(hot) */
    hot: ReadonlySet<string> = new Set();
    /** 코드 → 현재 hot 연속구간 진입시각(ms). 이탈 시 제거 → 신규편입 판정. */
    readonly hotSince = new Map<string, number>();

    private readonly history = new Map<string, Quote[]>();

    updateQuotes(qs: Quote[]): void {
        for (const q of qs) {
            this.quotes.set(q.code, q);
            const h = this.history.get(q.code) ?? [];
            h.push(q);
            const cutoff = q.ts - WINDOW_MS;
            while (h.length && h[0].ts < cutoff) h.shift(); // 윈도우 밖 오래된 틱 제거
            while (h.length > RING) h.shift(); // 개수 상한 가드
            this.history.set(q.code, h);
        }
    }

    setHot(hits: ScanHit[], now: number): void {
        const next = new Set(hits.map((h) => h.code));
        for (const c of next) if (!this.hotSince.has(c)) this.hotSince.set(c, now); // 신규 진입
        for (const c of [...this.hotSince.keys()]) if (!next.has(c)) this.hotSince.delete(c); // 이탈
        this.hot = next;
    }

    /** 코드의 링버퍼(오래된→최신) — 후속 signals 계산 입력. */
    historyOf(code: string): readonly Quote[] {
        return this.history.get(code) ?? [];
    }
}
