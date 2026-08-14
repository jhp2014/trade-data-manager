import { describe, it, expect } from "vitest";
import type { MinuteCandle } from "@trade-data-manager/market";
import { LiveTape, type TapeMinuteSource } from "../tape.js";
import type { Quote } from "../../engine/types.js";

// 테이프의 계약을 값으로 잠근다 — 틱 접기(last-wins)·비트맵·백필 병합(현재 분 보존)·
// (code,날짜)당 1회·롤오버·델타(since 포함 재전송)·rev(백필 세대).

const quote = (code: string, price: number, tradeValue = 100): Quote => ({
    code,
    name: `${code}명`,
    price,
    changeRate: 0,
    volume: 0,
    base: 100,
    open: 100,
    high: price,
    low: 100,
    marketCap: 1_000,
    tradeValue, // 백만원 — 테이프는 ×1e6 으로 원 환산
    ts: 0,
});

/** KST 벽시계 분 → epoch ms (2026-08-14 KST). 테이프는 minuteOfDayOf(now/1000) 로 분을 뽑는다. */
const TODAY = "2026-08-14";
const kstMs = (minute: number, sec = 0): number => Date.UTC(2026, 7, 13, 15, 0, 0) + (minute * 60 + sec) * 1_000; // KST 00:00 = UTC-1일 15:00

/** UN 분봉 스텁 — close 만 의미 있게, OHLC 동일가·volume 로 거래대금 근사(공식 = 평균가×량). */
const bar = (time: string, close: number, volume = 10): MinuteCandle => ({
    stockCode: "005930",
    date: TODAY,
    time,
    krx: null,
    un: { open: String(close), high: String(close), low: String(close), close: String(close), volume: String(volume) },
});

const sourceOf = (bars: MinuteCandle[] | (() => MinuteCandle[])): TapeMinuteSource & { calls: string[] } => {
    const calls: string[] = [];
    return {
        calls,
        getMinuteCandles: async (code) => {
            calls.push(code);
            return typeof bars === "function" ? bars() : bars;
        },
    };
};

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("LiveTape — 틱 접기", () => {
    it("같은 분의 여러 틱은 last-wins(그 분의 마지막 샘플이 종가 노릇), 분이 넘어가면 새 슬롯", async () => {
        const tape = new LiveTape(sourceOf([]));
        tape.onTick([quote("005930", 100, 50)], kstMs(565, 3), TODAY); // 09:25:03
        tape.onTick([quote("005930", 102, 60)], kstMs(565, 58), TODAY); // 09:25:58 — 같은 분 덮어씀
        tape.onTick([quote("005930", 101, 70)], kstMs(566, 1), TODAY); // 09:26:01 — 새 분
        await flush();
        const { stocks, ticks } = tape.view(() => true, null);
        expect(stocks).toHaveLength(1);
        expect(stocks[0].minutes).toEqual([565, 566]);
        expect(stocks[0].price).toEqual([102, 101]);
        expect(stocks[0].cumAmount).toEqual([60_000_000, 70_000_000]); // 백만원 → 원
        expect(ticks).toEqual([565, 566]);
    });

    it("기록 창(08:00~16:00) 밖 틱은 버린다 — 장외 스냅샷은 관찰이 아니다(밤새 평평한 가짜 샘플 방지)", async () => {
        const tape = new LiveTape(sourceOf([]));
        tape.onTick([quote("005930", 100)], kstMs(17), TODAY); // 00:17 — 새벽(실측 사례)
        tape.onTick([quote("005930", 100)], kstMs(970), TODAY); // 16:10 — 장 마감 후
        await flush();
        const { stocks, ticks } = tape.view(() => true, null);
        expect(stocks).toHaveLength(0);
        expect(ticks).toEqual([]);
        // 창 밖에서도 날짜 롤오버는 돈다 — 자정 지난 첫 틱이 어제 테이프를 비운다
        expect(tape.tapeDate).toBe(TODAY);
    });

    it("폴링에 안 실린 분은 자리 자체가 없다(구멍 = 조건 이탈의 기록) — 틱 비트맵엔 남는다", async () => {
        const tape = new LiveTape(sourceOf([]));
        tape.onTick([quote("005930", 100)], kstMs(565), TODAY);
        tape.onTick([], kstMs(566), TODAY); // 엔진은 돌았지만 이 종목은 유니버스 밖
        tape.onTick([quote("005930", 103)], kstMs(567), TODAY);
        await flush();
        const { stocks, ticks } = tape.view(() => true, null);
        expect(stocks[0].minutes).toEqual([565, 567]); // 566 은 결손 그대로
        expect(ticks).toEqual([565, 566, 567]); // 틱 있음 + 샘플 없음 = 이탈로 판정 가능
    });
});

describe("LiveTape — 백필(머리 채움)", () => {
    it("지난 분은 공식 분봉이 덮고, 형성 중인 현재 분은 틱이 이긴다(비어 있을 때만 채움)", async () => {
        const source = sourceOf([bar("09:00:00", 100, 10), bar("09:01:00", 110, 10), bar("09:02:00", 120, 10)]);
        const tape = new LiveTape(source);
        // 09:02 에 편입 — 틱이 09:02 슬롯을 먼저 쓴다(가격 999 = 백필보다 신선).
        tape.onTick([quote("005930", 999, 77)], kstMs(542, 30), TODAY);
        await flush();
        const { stocks } = tape.view(() => true, null);
        expect(stocks[0].minutes).toEqual([540, 541, 542]);
        expect(stocks[0].price).toEqual([100, 110, 999]); // 과거 두 분은 백필, 현재 분은 틱 보존
        // 누적대금: 백필은 평균가×량 누적, 현재 분은 틱(백만원→원)이 보존된다
        expect(stocks[0].cumAmount).toEqual([1_000, 2_100, 77_000_000]);
        expect(tape.rev).toBe(1); // 백필 완료 = rev 증가(클라 풀 재요청 신호)
    });

    it("(code,날짜)당 1회 — 이탈 후 재진입에 재백필하지 않는다(구멍 보존, 사용자 확정)", async () => {
        const source = sourceOf([bar("09:00:00", 100)]);
        const tape = new LiveTape(source);
        tape.onTick([quote("005930", 100)], kstMs(565), TODAY);
        await flush();
        tape.onTick([], kstMs(566), TODAY); // 이탈
        tape.onTick([quote("005930", 105)], kstMs(570), TODAY); // 재진입
        await flush();
        expect(source.calls).toEqual(["005930"]); // 백필은 한 번뿐
        const { stocks } = tape.view(() => true, null);
        expect(stocks[0].minutes).toEqual([540, 565, 570]); // 566~569 구멍 그대로
    });

    it("수동 메우기(force)는 완료된 코드도 다시 백필한다", async () => {
        let bars = [bar("09:00:00", 100)];
        const source = sourceOf(() => bars);
        const tape = new LiveTape(source);
        tape.onTick([quote("005930", 100)], kstMs(565), TODAY);
        await flush();
        bars = [bar("09:00:00", 100), bar("09:30:00", 130)]; // 그 사이 분봉이 자람
        tape.requestBackfill("005930", TODAY, kstMs(600), true);
        await flush();
        expect(source.calls).toEqual(["005930", "005930"]);
        const { stocks } = tape.view(() => true, null);
        expect(stocks[0].minutes).toContain(570); // 09:30 이 채워짐
        expect(tape.rev).toBe(2);
    });

    it("백필 실패는 삼키고(onError 로그) 백오프 후 재예약된다 — 큐는 살아 있다", async () => {
        const source: TapeMinuteSource & { calls: string[] } = {
            calls: [],
            getMinuteCandles: async (code) => {
                source.calls.push(code);
                throw new Error("kiwoom down");
            },
        };
        const errors: string[] = [];
        const tape = new LiveTape(source, (m) => errors.push(m));
        tape.onTick([quote("005930", 100)], kstMs(565), TODAY);
        await flush();
        expect(source.calls).toHaveLength(1);
        expect(errors).toHaveLength(1);
        // 백오프 창 안(30초 뒤) — 재예약 안 됨
        tape.onTick([quote("005930", 101)], kstMs(565, 30), TODAY);
        await flush();
        expect(source.calls).toHaveLength(1);
        // 백오프(60s) 지나면(70초 뒤) 재시도
        tape.onTick([quote("005930", 102)], kstMs(566, 40), TODAY);
        await flush();
        expect(source.calls).toHaveLength(2);
    });
});

describe("LiveTape — 롤오버·델타", () => {
    it("날짜가 바뀌면 테이프 전체 리셋(샘플·비트맵·백필 기록·rev)", async () => {
        const source = sourceOf([bar("09:00:00", 100)]);
        const tape = new LiveTape(source);
        tape.onTick([quote("005930", 100)], kstMs(565), TODAY);
        await flush();
        expect(tape.rev).toBe(1);
        tape.onTick([quote("005930", 100)], kstMs(565) + 86_400_000, "2026-08-17");
        await flush();
        expect(tape.tapeDate).toBe("2026-08-17");
        const { stocks } = tape.view(() => true, null);
        expect(stocks[0].minutes).toEqual([540, 565]); // 어제 샘플은 없음 — 540 은 새 날짜 백필분
        expect(source.calls).toEqual(["005930", "005930"]); // 새 날짜라 백필 다시 1회 → rev=1
        expect(tape.rev).toBe(1);
    });

    it("since 델타는 그 분 **포함** 이후만(형성 중이던 분 재전송) — 틱 비트맵도 같은 필터", async () => {
        const tape = new LiveTape(sourceOf([]));
        tape.onTick([quote("005930", 100)], kstMs(565), TODAY);
        tape.onTick([quote("005930", 101)], kstMs(566), TODAY);
        tape.onTick([quote("005930", 102)], kstMs(567), TODAY);
        await flush();
        const { stocks, ticks } = tape.view(() => true, 566);
        expect(stocks[0].minutes).toEqual([566, 567]);
        expect(stocks[0].price).toEqual([101, 102]);
        expect(ticks).toEqual([566, 567]);
    });

    it("델타 창에 샘플이 없는 종목은 아예 안 실린다(와이어 절약)", async () => {
        const tape = new LiveTape(sourceOf([]));
        tape.onTick([quote("005930", 100), quote("000660", 50)], kstMs(565), TODAY);
        tape.onTick([quote("005930", 101)], kstMs(566), TODAY); // 000660 이탈
        await flush();
        const { stocks } = tape.view(() => true, 566);
        expect(stocks.map((s) => s.code)).toEqual(["005930"]);
    });

    it("view 의 코드 필터(테마 멤버십)가 적용된다", async () => {
        const tape = new LiveTape(sourceOf([]));
        tape.onTick([quote("005930", 100), quote("000660", 50)], kstMs(565), TODAY);
        await flush();
        const { stocks } = tape.view((c) => c === "000660", null);
        expect(stocks.map((s) => s.code)).toEqual(["000660"]);
    });
});
