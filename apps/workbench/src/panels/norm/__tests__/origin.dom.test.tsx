// 원점·축·전일 종가선의 **자리**를 화면에서 못박는다.
//
// 이 셋은 좌표 규약이라 눈으로만 확인하면 다음 수정에서 조용히 어긋난다:
//   ① 원점 (0,0)은 **선 위의 점**이다 — 일봉도 전일(D−1)이 x=0 이라 그 봉의 종가가 0선에 앉는다.
//   ② 원점은 **바닥 스택 + 세로 점선**이 가리킨다(옛 ▲·축 칩의 후임) — 칩엔 항목별 정체가 적힌다.
//   ③ 전일 종가선(0%)은 분봉 전용이고, 창 밖이면 **가장자리 라벨 + ▼** 로 존재를 말한다.
//
// 재는 법: 캔들은 캔버스 표시목록(drawProbe)에서 x·y 를 값으로 읽고, 0선·▲ 는 SVG 좌표를 읽는다.
// 둘이 같은 화면 좌표계라 **숫자를 직접 비교**할 수 있다 — 스케일을 몰라도 관계는 단언된다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NormOverlayPanel } from "../NormOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { CODE, DATE, TIME, dailyBundle, dailyBundleOf, dailyPin, minuteBundle, minutePin, seedPins, stockNames, themeSnapshot } from "./overlayFixture.js";
import { ORIGIN_CAP, originOff } from "../OriginStack.js";
import { drawnOps, kindIn } from "./drawProbe.js";
import { useWorkbench } from "../../../store/workbench.js";

/** 캔들 몸통들(rect) — 캔들 하나당 하나라 x 로 봉을 고를 수 있다. */
const bodies = (c: HTMLElement): { x: number; y: number; w: number }[] =>
    kindIn(drawnOps(c, "candles"), "rect").map((r) => ({ x: r.x + r.w / 2, y: r.y, w: r.w }));

/** 가로 0선의 y — 원점의 **값**이 앉은 높이. */
const zeroLineY = (c: HTMLElement): number =>
    Number(c.querySelector('[data-layer="axis-origin"] line')!.getAttribute("y1"));

/** 원점 세로 점선의 x — 원점 봉과 같은 열에 서야 한다. */
const originLineX = (c: HTMLElement): number =>
    Number(c.querySelector('[data-layer="origin-leader"] line')!.getAttribute("x1"));

/** 바닥 원점 스택의 칩 글자들. */
const stackTexts = (c: HTMLElement): string[] =>
    [...c.querySelectorAll('[data-layer="origin-stack"] button')].map((b) => b.textContent ?? "");

const seedZero = (v: "off" | "un" | "krx"): void => localStorage.setItem("wb.normZeroLine.minute", JSON.stringify(v));

/** 시선 하나 — 수준선(기준선·전일 종가선)은 **시선 단일 + 호버**만 받는다(옛 규칙 그대로). */
const gazePoint = (): void => useWorkbench.getState().goToPoint({ code: CODE, date: DATE, time: TIME }, "test");

const renderDaily = (): HTMLElement => {
    seedPins("daily", [dailyPin]);
    return renderWithProviders(<NormOverlayPanel grain="daily" />, {
        charts: [{ code: CODE, date: DATE, data: dailyBundle }], stockNames,
    }).container;
};
/** 상한을 넘기는 항목 한 벌 — 이름 사전엔 없어 코드가 그대로 이름이 된다(개수만 세면 되는 검사들). */
const MANY = ["005930", "000660", "035720", "000111", "000222", "000333", "000444"];
const renderMany = (gaze?: string): HTMLElement => {
    seedPins("daily", MANY.map((code) => ({ code, date: DATE })));
    if (gaze) useWorkbench.getState().goToDay({ code: gaze, date: DATE }, "test");
    return renderWithProviders(<NormOverlayPanel grain="daily" />, {
        charts: MANY.map((code) => ({ code, date: DATE, data: dailyBundleOf(code, [10_000, 11_000, 12_000]) })),
        stockNames,
    }).container;
};

const renderMinute = (): HTMLElement => {
    seedPins("minute", [minutePin]);
    return renderWithProviders(<NormOverlayPanel grain="minute" />, {
        charts: [{ code: CODE, date: DATE, data: minuteBundle }], stockNames,
        // 시선이 서면 거래대금(굵기)이 그날 복기를 당긴다 — 안 심으면 setup 의 네트워크 그물에 걸린다.
        daySnapshot: { date: DATE, data: themeSnapshot },
    }).container;
};

beforeEach(() => {
    localStorage.clear();
    useWorkbench.setState({ activePoint: null, focus: { date: DATE, code: "", time: null } });
});
afterEach(() => {
    localStorage.clear();
    useWorkbench.setState({ activePoint: null, focus: { date: DATE, code: "", time: null } });
});

describe("원점은 선 위의 점이다", () => {
    // 픽스처 일봉 종가는 […, 11_100, 11_000, 12_000] — D−1 = 11,000 이 원점(basePrice)이고 D = 12,000.
    it("일봉: **전일 봉**의 종가가 0선에 앉는다 — 원점이 D 였을 땐 (0,0)이 선 밖의 허공이었다", () => {
        const c = renderDaily();
        const bs = bodies(c);
        expect(bs.length).toBeGreaterThanOrEqual(2);
        const sorted = [...bs].sort((a, b) => a.x - b.x);
        const prev = sorted[sorted.length - 2]; // D−1
        // 시가(종가×0.99) < 종가라 몸통 윗변이 곧 종가 — 그 높이가 0선이다.
        expect(prev.y).toBeCloseTo(zeroLineY(c), 6);
    });

    it("분봉: 타점 시각 봉의 종가가 0선에 앉는다 — 같은 규약이 두 패널에 하나로 산다", () => {
        const c = renderMinute();
        const x0 = originLineX(c);
        const anchor = bodies(c).find((b) => Math.abs(b.x - x0) < 0.001);
        expect(anchor, "타점 시각 봉이 원점 점선과 같은 열에 없다").toBeDefined();
        expect(anchor!.y).toBeCloseTo(zeroLineY(c), 6);
    });
});

describe("원점 표식 — 바닥 스택과 점선", () => {
    it("일봉: 점선이 **원점(전일) 봉**의 열에 선다", () => {
        const c = renderDaily();
        const sorted = [...bodies(c)].sort((a, b) => a.x - b.x);
        const prev = sorted[sorted.length - 2]; // D−1 = 원점
        expect(originLineX(c)).toBeCloseTo(prev.x, 6);
        // 당일은 그 오른쪽 — 선의 끝이라 그림에서 저절로 읽힌다(표식이 따로 없다).
        expect(sorted[sorted.length - 1].x).toBeGreaterThan(originLineX(c));
    });

    it("점선은 **원점 봉 저가보다 아래**에서 시작한다 — 봉을 하나도 안 가린다(사용자 확정)", () => {
        const c = renderDaily();
        const line = c.querySelector('[data-layer="origin-leader"] line')!;
        const top = Number(line.getAttribute("y1"));
        // 화면 y 는 아래로 갈수록 크다. 원점 봉의 저가(=몸통 아래보다 더 아래)보다 아래에서 시작해야 한다.
        const originBody = [...bodies(c)].sort((a, b) => a.x - b.x).slice(-2)[0];
        expect(top).toBeGreaterThan(originBody.y);
        expect(Number(line.getAttribute("y2"))).toBeGreaterThan(top); // 아래로 내려간다
    });

    it("스택 칩이 정체를 **항목별로** 적는다 — 일봉 `날짜 종목` / 분봉 `날짜 시각 종목`", () => {
        expect(stackTexts(renderDaily())).toEqual(["26.07.08 삼성전자"]);
        expect(stackTexts(renderMinute())).toEqual(["26.07.08 09:30 삼성전자"]);
    });

    it("원점 세로선은 **격자 규격**으로 남는다 — 점선이 못 닿는 봉 위쪽의 기준", () => {
        const c = renderDaily();
        const grid = [...c.querySelectorAll('[data-layer="axis-ticks"] line')]
            .filter((l) => l.getAttribute("x1") === l.getAttribute("x2"));
        expect(grid).toHaveLength(1); // 세로 격자는 원점 하나뿐
        expect(grid[0].getAttribute("stroke")).toBe("var(--border-subtle)"); // y 격자와 같은 규격
    });

    it("축 원점 층에 남은 건 가로 0선 하나 — 옛 실선 세로축·화살촉·▲ 는 은퇴했다", () => {
        const c = renderDaily();
        const lines = [...c.querySelectorAll('[data-layer="axis-origin"] line')];
        expect(lines).toHaveLength(1);
        expect(lines[0].getAttribute("y1")).toBe(lines[0].getAttribute("y2")); // 가로선이다
    });
});

describe("스택은 넘치지도, 사라지지도 않는다", () => {
    it(`상한 ${ORIGIN_CAP}개까지만 이름을 달고 나머지는 뱃지 하나로 접힌다 — 위로 쌓다 캔들을 침범하지 않게`, () => {
        const texts = stackTexts(renderMany());
        expect(texts.filter((t) => t.startsWith("+"))).toEqual([`+${MANY.length - ORIGIN_CAP}`]);
        expect(texts).toHaveLength(ORIGIN_CAP + 1); // 이름 6 + 뱃지 1
    });

    it("**시선이 맨 위**에 선다(등록 순 — 사용자 확정) — 뱃지 바로 아래가 그 자리다", () => {
        const texts = stackTexts(renderMany("035720")); // 035720 = 카카오(이름 사전에 있다)
        expect(texts[0]).toMatch(/^\+/); // 뱃지가 맨 위
        expect(texts[1]).toContain("카카오"); // 그 다음이 시선
    });

    it("원점이 창 밖이면 가장자리로 클램프한다 — 스택이 사라지면 고정·이동 손잡이까지 같이 죽는다", () => {
        const box = { left: 20, top: 0, width: 100, height: 200 };
        expect(originOff(60, box)).toBeNull(); // 창 안
        expect(originOff(10, box)).toBe("left");
        expect(originOff(150, box)).toBe("right");
    });
});

describe("전일 종가선(0%) — 분봉 전용 토글", () => {
    /** 수준선 층의 글자들. */
    const levelTexts = (c: HTMLElement): string[] =>
        [...c.querySelectorAll('[data-layer="levels"] text')].map((t) => t.textContent ?? "");

    it("켜면 그 시장 이름과 함께 선다 — 픽스처 타점은 +26.3% 라 0% 는 창 밖, 그래서 ▼ 와 거리가 붙는다", () => {
        seedZero("un");
        gazePoint();
        const texts = levelTexts(renderMinute());
        expect(texts.some((t) => t.startsWith("0% (UN)"))).toBe(true);
        expect(texts.some((t) => t.includes("▼26.3%p"))).toBe(true);
    });

    it("KRX 로 바꾸면 그 시장 종가를 잰다 — 두 시장 종가가 갈리면 그 간격이 곧 정보다", () => {
        seedZero("krx");
        gazePoint();
        expect(levelTexts(renderMinute()).some((t) => t.startsWith("0% (KRX)"))).toBe(true);
    });

    it("끄면 사라진다 — 기준선(앵커)과 **따로** 켜지는 스위치다", () => {
        seedZero("off");
        gazePoint();
        expect(levelTexts(renderMinute()).some((t) => t.includes("0% ("))).toBe(false);
    });

    it("일봉엔 안 붙는다 — 거기선 y=0 자체가 전일 종가라 가로 0선이 그 자리다", () => {
        localStorage.setItem("wb.normZeroLine.daily", JSON.stringify("un"));
        useWorkbench.getState().goToDay({ code: CODE, date: DATE }, "test");
        expect(levelTexts(renderDaily()).some((t) => t.includes("0% ("))).toBe(false);
    });
});
