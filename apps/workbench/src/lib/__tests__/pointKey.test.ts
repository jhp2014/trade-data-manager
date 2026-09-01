// 복기 타점·차트의 자연키 — 그때그때 만드는 파생값이 아니라 **실제로 저장·전달되는 식별자**다.
//
// store(작업셋 순서·호버 링크) · dnd id 의 본체 · 시트 행 ↔ 축 배치 셀 ↔ 경로 통계의 조인 키가 전부
// 이 문자열이다. 그래서 형식이 흔들리면 화면이 깨지는 게 아니라 **조인이 조용히 0건**이 된다.
//
// 형식의 정의는 도메인(서버 캐시 지문·리졸버와 같은 문자열)이고 이 파일은 그 위의 클라 편의만 소유한다.
// 여기서 재는 건 두 가지다: ① 도메인과 같은 문자열을 낸다(구분자 계약이 한 곳이다) ② 되돌리기가
// 깨진 값을 조용히 통과시키지 않는다 — 키의 출처가 dnd id·영속된 목록이라 손상된 값이 실제로 들어온다.
import { describe, it, expect } from "vitest";
import { pointKeyOf as domainPointKey, chartKeyOf as domainChartKey } from "@trade-data-manager/market/domain";
import { chartKey, chartKeyOf, parsePointKey, pointKey, pointKeyOf, samePoint, type PointRef } from "../pointKey.js";

const REF: PointRef = { stockCode: "005930", date: "2026-07-08", time: "09:30:00" };
const KEY = "005930|2026-07-08|09:30:00";

describe("타점 키 — 만들기", () => {
    it("종목|날짜|시각", () => {
        expect(pointKey(REF)).toBe(KEY);
        expect(pointKeyOf(REF.stockCode, REF.date, REF.time)).toBe(KEY);
    });

    // 구분자 계약이 두 곳이면 한쪽만 바뀌는 사고가 난다 — 그때 조인이 0건이 되고 화면은 멀쩡해 보인다.
    it("**도메인과 같은 문자열** — 형식의 정의는 한 곳이다", () => {
        expect(pointKey(REF)).toBe(domainPointKey(REF));
        expect(chartKey(REF)).toBe(domainChartKey(REF));
    });

    it("필드명이 다른 값에서도 같은 키가 나온다 — subject 는 {code,date,time} 이다", () => {
        expect(pointKeyOf("005930", "2026-07-08", "09:30:00")).toBe(pointKey(REF));
    });

    it("구조가 같으면 통용된다 — 남는 필드는 무시된다(RankPoint 등)", () => {
        expect(pointKey({ ...REF, name: "삼성전자" } as PointRef)).toBe(KEY);
    });
});

describe("차트 키 — 타점 키의 앞 두 조각", () => {
    it("종목|날짜", () => {
        expect(chartKey(REF)).toBe("005930|2026-07-08");
        expect(chartKeyOf("005930", "2026-07-08")).toBe("005930|2026-07-08");
    });

    // 타점 키에서 시각만 떼면 차트 키 — 골격 패널이 두 뷰를 오가는 근거다(선은 언제나 차트 소유).
    it("타점 키의 접두어다 — 타점 단위 선이 제 차트를 찾을 수 있다", () => {
        expect(pointKey(REF).startsWith(`${chartKey(REF)}|`)).toBe(true);
    });

    it("타점 키와 차트 키는 조각 수가 다르다 — 되돌릴 때 이걸로 갈린다", () => {
        expect(chartKey(REF).split("|")).toHaveLength(2);
        expect(pointKey(REF).split("|")).toHaveLength(3);
    });
});

describe("되돌리기 — 깨진 값을 지어내지 않는다", () => {
    it("왕복이 제자리로 돌아온다", () => {
        expect(parsePointKey(pointKey(REF))).toEqual(REF);
    });

    // ⚠ 필드가 undefined 인 타점을 만들어 퍼뜨리면 그 뒤의 조인·조회가 전부 조용히 빗나간다.
    it.each([
        ["빈 문자열", ""],
        ["차트 키(조각 부족)", "005930|2026-07-08"],
        ["조각 과다", "005930|2026-07-08|09:30:00|군더더기"],
        ["종목이 빔", "|2026-07-08|09:30:00"],
        ["날짜가 빔", "005930||09:30:00"],
        ["시각이 빔", "005930|2026-07-08|"],
        ["구분자 없음", "00593020260708093000"],
    ])("%s → null", (_label, broken) => {
        expect(parsePointKey(broken)).toBeNull();
    });
});

describe("같은 타점인가 — 필드 셋을 손으로 잇는 자리를 대체", () => {
    it("셋이 다 같아야 같다", () => {
        expect(samePoint(REF, { ...REF })).toBe(true);
    });

    it.each([
        ["종목", { stockCode: "000660" }],
        ["날짜", { date: "2026-07-09" }],
        ["시각", { time: "09:31:00" }],
    ])("%s 이 다르면 다르다", (_label, diff) => {
        expect(samePoint(REF, { ...REF, ...diff })).toBe(false);
    });
});
