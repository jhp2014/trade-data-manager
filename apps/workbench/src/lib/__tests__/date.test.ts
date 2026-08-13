import { describe, it, expect } from "vitest";
import { minutesOfDay, parseDate, parseTime, shortDate, timeOfMinutes } from "../date.js";

// 이 규칙들은 네 벌로 흩어져 있던 것을 한 벌로 모은 것이다 — 다시 갈리지 않게 여기서 잰다.

describe("minutesOfDay — 초는 버린다(분봉·골격의 t 해상도가 분)", () => {
    it("HH:MM:SS 를 자정 기준 분으로", () => {
        expect(minutesOfDay("09:30:00")).toBe(570);
        expect(minutesOfDay("15:19:59")).toBe(919); // 초를 올림하지 않는다
        expect(minutesOfDay("00:00:00")).toBe(0);
    });

    it("초가 없는 HH:MM 도 같은 값 — 부르는 자리마다 형식이 다르다", () => {
        expect(minutesOfDay("09:30")).toBe(minutesOfDay("09:30:00"));
    });
});

describe("timeOfMinutes — 분을 HH:MM 으로", () => {
    it("먼저 반올림하고 시·분을 한 값에서 뽑는다", () => {
        // 따로 뽑으면 599.7 이 floor(599.7/60)=9 시 · round(599.7%60)=60 분 → "09:60" 이 된다.
        expect(timeOfMinutes(599.7)).toBe("10:00");
        expect(timeOfMinutes(570)).toBe("09:30");
    });

    it("하루 밖은 끝에 붙는다", () => {
        expect(timeOfMinutes(-5)).toBe("00:00");
        expect(timeOfMinutes(99999)).toBe("23:59");
    });

    it("minutesOfDay 와 왕복한다", () => {
        expect(timeOfMinutes(minutesOfDay("13:07:00"))).toBe("13:07");
    });
});

describe("shortDate — 좁은 자리의 두 자리 연도", () => {
    it("YYYY-MM-DD → yy.mm.dd", () => {
        expect(shortDate("2026-07-08")).toBe("26.07.08");
    });

    it("빈 문자열은 빈 문자열 — 없는 날짜를 지어내지 않는다", () => {
        expect(shortDate("")).toBe("");
    });
});

describe("parseDate — 못 읽은 것은 null(조용히 넘기지 않는다)", () => {
    it("두 자리·네 자리 연도 둘 다 받고 한 자리 월·일도 채운다", () => {
        expect(parseDate("26.7.1")).toBe("2026-07-01");
        expect(parseDate("2026.07.01")).toBe("2026-07-01");
        expect(parseDate(" 26.07.01 ")).toBe("2026-07-01"); // 앞뒤 공백은 관용
    });

    it("shortDate 와 왕복한다", () => {
        expect(parseDate(shortDate("2026-07-08"))).toBe("2026-07-08");
    });

    it("범위 밖·형식 밖은 null", () => {
        expect(parseDate("26.13.01")).toBeNull();
        expect(parseDate("26.07.32")).toBeNull();
        expect(parseDate("2026-07-01")).toBeNull(); // 하이픈은 입력 형식이 아니다
        expect(parseDate("")).toBeNull();
    });
});

describe("parseTime — 못 읽은 것은 null", () => {
    it("H:MM 도 받아 HH:MM 으로 채운다", () => {
        expect(parseTime("9:30")).toBe("09:30");
        expect(parseTime("09:30")).toBe("09:30");
    });

    it("범위 밖·형식 밖은 null", () => {
        expect(parseTime("24:00")).toBeNull();
        expect(parseTime("09:60")).toBeNull();
        expect(parseTime("930")).toBeNull();
    });
});
