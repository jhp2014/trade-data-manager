// revealRow — 커서 줄을 **붙는 머리 밑이 아닌 곳**에, 앞뒤 한 줄(앞이 머리줄이면 이어진 머리줄 전부)과 같이 세운다.
// jsdom 은 레이아웃을 안 해서 좌표를 손으로 심는다: 상자 top=0 · 머리(thead) 20 · 줄 높이 20 · 보이는 높이 100.
// 그러면 보이는 칸은 [20, 100] 이고 i 번째 본문 줄은 y = 20 + 20i − scrollTop 에 선다.
import { describe, it, expect } from "vitest";
import { revealDelta, revealRow } from "../exploreTable.js";

const ROW = 20;
const HEAD = 20;
const VIEW = 100;

function rect(top: number, h: number): DOMRect {
    return { top, bottom: top + h, height: h, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

/** kinds: "h" = 머리줄(data-head) · "p" = 타점 줄. */
function build(kinds: string, scrollTop: number): { box: HTMLDivElement; rows: HTMLElement[] } {
    const box = document.createElement("div");
    box.setAttribute("data-scroll-box", "");
    box.innerHTML = `<table><thead><tr><th></th></tr></thead><tbody>${[...kinds].map((k) => (k === "h" ? `<tr data-head=""><td></td></tr>` : `<tr><td></td></tr>`)).join("")}</tbody></table>`;
    document.body.appendChild(box);
    Object.defineProperty(box, "clientHeight", { value: VIEW, configurable: true });
    box.scrollTop = scrollTop;
    box.getBoundingClientRect = () => rect(0, VIEW);
    box.querySelector("thead")!.getBoundingClientRect = () => rect(0, HEAD);
    const rows = [...box.querySelectorAll("tbody tr")] as HTMLElement[];
    rows.forEach((r, i) => { r.getBoundingClientRect = () => rect(HEAD + ROW * i - box.scrollTop, ROW); });
    return { box, rows };
}

describe("revealRow — 걷는 커서가 머리 밑에 숨지 않는다", () => {
    it("w 로 종목 첫 타점에 올라오면 그 위 이름줄까지 머리 **아래**에 선다", () => {
        const { box, rows } = build("hpphpp", 100);
        revealRow(rows[1]!);
        // 이름줄(0번)이 y=20 — 머리(0~20) 바로 아래.
        expect(box.scrollTop).toBe(0);
        expect(rows[0]!.getBoundingClientRect().top).toBe(HEAD);
    });

    it("날짜·종목 머리줄이 겹겹이면 전부 데려온다(라벨판)", () => {
        const { box, rows } = build("pphhpp", 200);
        revealRow(rows[4]!);
        // 날짜 머리(2번)가 머리 바로 아래 — 2번 y = 20 + 40 − scrollTop = 20.
        expect(box.scrollTop).toBe(40);
    });

    it("앞 줄이 타점이면 그 한 줄만 여유로 둔다", () => {
        const { box, rows } = build("hpppppppp", 200);
        revealRow(rows[6]!);
        // 5번(앞 줄) y = 20 + 100 − scrollTop = 20.
        expect(box.scrollTop).toBe(100);
    });

    it("s 로 내려가면 다음 줄까지 아래 가장자리 안에 든다", () => {
        const { box, rows } = build("hppppppp", 0);
        revealRow(rows[5]!);
        // 6번 bottom = 20 + 120 + 20 − scrollTop = 100.
        expect(box.scrollTop).toBe(60);
    });

    it("커서가 이름줄 자신이면(라벨판 시각 없는 커서) 앞 날짜 머리줄까지 데려온다", () => {
        const { box, rows } = build("phhp", 200);
        revealRow(rows[2]!);
        // 날짜 머리(1번) y = 20 + 20 − scrollTop = 20.
        expect(box.scrollTop).toBe(20);
    });

    it("머리줄을 데려오는 건 머리줄까지다 — 그 앞 타점 줄은 한 줄 여유에 안 든다", () => {
        const { box, rows } = build("pphhp", 200);
        revealRow(rows[4]!);
        // 2번(첫 머리) y = 20 + 40 − scrollTop = 20 — 1번 타점까지 끌어왔다면 20 이 됐을 것이다.
        expect(box.scrollTop).toBe(40);
    });

    it("문맥이 판보다 크면 커서 줄만이라도 머리 아래에 세운다", () => {
        // 머리줄 넷 + 커서 = 100 > 보이는 80.
        const { box, rows } = build("hhhhp", 200);
        revealRow(rows[4]!);
        // 4번 y = 20 + 80 − scrollTop = 20.
        expect(box.scrollTop).toBe(80);
    });

    it("이미 문맥까지 보이면 안 움직인다", () => {
        const { box, rows } = build("hppp", 0);
        revealRow(rows[2]!);
        expect(box.scrollTop).toBe(0);
    });
});

describe("revealDelta", () => {
    const view = { top: 20, bottom: 100 };
    it("문맥이 판보다 크면 커서 줄만이라도 맞춘다", () => {
        expect(revealDelta(view, { top: -200, bottom: 60 }, { top: -10, bottom: 10 })).toBe(-30);
    });
    it("안에 있으면 0", () => {
        expect(revealDelta(view, { top: 20, bottom: 100 }, { top: 40, bottom: 60 })).toBe(0);
    });
});
