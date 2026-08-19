import { describe, it, expect } from "vitest";
import { extendsPrevBars, sameMarkers } from "../candleAmountSeries.js";

// 라이브 폴 증분 갱신의 판정층 — 판정이 틀리면 화면이 조용히 어긋나므로(꼬리만 update 하는데 몸통이 달랐다)
// 보수성이 요점이다: 애매하면 false(전체 setData 폴백)여야 한다.
interface Bar {
    time: number;
    close: number;
}
const bar = (time: number, close: number): Bar => ({ time, close });
const timeOf = (b: Bar): number => b.time;
const closeOf = (b: Bar): number => b.close;

describe("extendsPrevBars", () => {
    const prev = [bar(1, 10), bar(2, 20), bar(3, 30)];

    it("동일 배열(마지막 봉 값만 변화) — 연장이다", () => {
        const next = [bar(1, 10), bar(2, 20), bar(3, 35)];
        expect(extendsPrevBars(prev, next, timeOf, closeOf)).toBe(true);
    });

    it("봉 추가(라이브 새 분봉) — 연장이다", () => {
        const next = [bar(1, 10), bar(2, 20), bar(3, 30), bar(4, 40)];
        expect(extendsPrevBars(prev, next, timeOf, closeOf)).toBe(true);
    });

    it("참조가 같은 겹침 구간은 값 비교 생략(RQ 구조 공유)", () => {
        const next = [prev[0], prev[1], bar(3, 31), bar(4, 40)];
        expect(extendsPrevBars(prev, next, timeOf, closeOf)).toBe(true);
    });

    it("첫 봉 시각이 다르면(다른 데이터셋/프리마켓 유무) 아니다", () => {
        const next = [bar(0, 5), bar(1, 10), bar(2, 20), bar(3, 30)];
        expect(extendsPrevBars(prev, next, timeOf, closeOf)).toBe(false);
    });

    it("겹침 구간(마지막 old 봉 제외)의 종가가 바뀌면 아니다 — 몸통 수정은 전체 setData 몫", () => {
        const next = [bar(1, 10), bar(2, 21), bar(3, 30)];
        expect(extendsPrevBars(prev, next, timeOf, closeOf)).toBe(false);
    });

    it("마지막 old 봉 자리의 시각이 달라도 아니다(봉이 사라지거나 갈렸다)", () => {
        const next = [bar(1, 10), bar(2, 20), bar(5, 30)];
        expect(extendsPrevBars(prev, next, timeOf, closeOf)).toBe(false);
    });

    it("짧아지면 아니다(꼬리를 지울 수는 없다)", () => {
        expect(extendsPrevBars(prev, [bar(1, 10), bar(2, 20)], timeOf, closeOf)).toBe(false);
    });

    it("prev 가 비었으면 아니다(첫 로드는 setData)", () => {
        expect(extendsPrevBars([], prev, timeOf, closeOf)).toBe(false);
    });
});

describe("sameMarkers", () => {
    const m = (time: number, text: string, color: string): { time: number; text: string; color: string } => ({ time, text, color });

    it("시각·문구·색이 전부 같으면 같다(setMarkers 스킵)", () => {
        expect(sameMarkers([m(1, "30", "#a"), m(2, "50", "#b")], [m(1, "30", "#a"), m(2, "50", "#b")])).toBe(true);
    });

    it("길이·문구·색 어느 하나라도 다르면 다르다", () => {
        expect(sameMarkers([m(1, "30", "#a")], [])).toBe(false);
        expect(sameMarkers([m(1, "30", "#a")], [m(1, "50", "#a")])).toBe(false);
        expect(sameMarkers([m(1, "30", "#a")], [m(1, "30", "#b")])).toBe(false);
        expect(sameMarkers([m(1, "30", "#a")], [m(2, "30", "#a")])).toBe(false);
    });

    it("빈 두 벌은 같다(토글 OFF 유지 시 스킵)", () => {
        expect(sameMarkers([], [])).toBe(true);
    });
});
