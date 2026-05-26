import { describe, it, expect } from "vitest";
import { parseChartTarget } from "../parser";

function ok(res: ReturnType<typeof parseChartTarget>) {
    if (!res.ok) throw new Error(`expected ok, got ${res.reason}`);
    return res.target;
}

describe("parseChartTarget", () => {
    it("빈 입력은 empty 사유로 실패", () => {
        const r1 = parseChartTarget("");
        expect(r1.ok).toBe(false);
        if (!r1.ok) expect(r1.reason).toBe("empty");

        const r2 = parseChartTarget("   ");
        expect(r2.ok).toBe(false);
        if (!r2.ok) expect(r2.reason).toBe("empty");
    });

    it("이미지 파일명 패턴 (YYYY.MM.DD_종목코드_종목명_KRX)", () => {
        const t = ok(parseChartTarget("2026.04.20_007660_삼화전자_KRX"));
        expect(t.stockCode).toBe("007660");
        expect(t.tradeDate).toBe("2026-04-20");
        expect(t.tradeTime).toBeUndefined();
    });

    it("CSV 한 줄 패턴 (쉼표 구분 + HH:MM:SS)", () => {
        const t = ok(parseChartTarget("079550,에이비프로바이오,2026-04-20,09:21:00"));
        expect(t.stockCode).toBe("079550");
        expect(t.tradeDate).toBe("2026-04-20");
        expect(t.tradeTime).toBe("09:21:00");
    });

    it("공백 구분 + YYYYMMDD 정규화", () => {
        const t = ok(parseChartTarget("009540 20260511"));
        expect(t.stockCode).toBe("009540");
        expect(t.tradeDate).toBe("2026-05-11");
    });

    it("작은 따옴표 prefix 제거 (TSV 패턴)", () => {
        const t = ok(parseChartTarget("2026-05-11\t'009540\tHD현대\t487500"));
        expect(t.stockCode).toBe("009540");
        expect(t.tradeDate).toBe("2026-05-11");
    });

    it("HH:MM 시간은 :00 으로 정규화", () => {
        const t = ok(parseChartTarget("009540 2026-05-11 09:21"));
        expect(t.tradeTime).toBe("09:21:00");
    });

    it("-pl 플래그로 가격 라인을 추출", () => {
        const t = ok(parseChartTarget("009540,2026-05-11 -pl 51000 | 41000"));
        expect(t.stockCode).toBe("009540");
        expect(t.tradeDate).toBe("2026-05-11");
        expect(t.priceLines).toEqual([51000, 41000]);
    });

    it("-pl 플래그가 없으면 priceLines는 undefined", () => {
        const t = ok(parseChartTarget("009540,2026-05-11"));
        expect(t.priceLines).toBeUndefined();
    });

    it("-pl 플래그의 0/음수/NaN은 필터링", () => {
        const t = ok(parseChartTarget("009540,2026-05-11 -pl 51000 | 0 | -100 | abc"));
        expect(t.priceLines).toEqual([51000]);
    });

    it("구분자가 없으면 no-match 사유로 실패", () => {
        const r = parseChartTarget("0095402026-05-11");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("no-match");
    });

    it("구분자는 있지만 종목코드/날짜가 없으면 no-stock-code", () => {
        const r = parseChartTarget("hello world");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("no-stock-code");
    });

    it("잘못된 시간 토큰은 무시", () => {
        const t = ok(parseChartTarget("009540 2026-05-11 25:99"));
        expect(t.tradeTime).toBeUndefined();
    });
});
