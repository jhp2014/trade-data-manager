// 채널 줄의 순수 규칙 — 무엇이 줄에 서나(visibleChips)와 저장본이 깨졌을 때(parseRowState).
// 손짓 자체는 worksetPresence.dom 이 끝까지 밟는다. 여기는 그 아래의 두 함수만 잠근다.
import { describe, it, expect } from "vitest";
import { DEFAULT_ROW_STATE, parseRowState, visibleChips, type ChipItem } from "../WorksetChipRow.js";

const chip = (key: string, active = false): ChipItem => ({ key, label: key, active, onClick: () => {} });

describe("visibleChips — 줄에 서는 것 = 고른 것 + 핀", () => {
    const items = [chip("a"), chip("b", true), chip("c"), chip("d")];

    it("접힘 — 고른 것과 핀만 서고 나머지는 ⋯ 로 간다", () => {
        const { shown, rest } = visibleChips(items, ["d"], false);
        expect(shown.map((i) => i.key)).toEqual(["b", "d"]);
        expect(rest.map((i) => i.key)).toEqual(["a", "c"]);
    });

    it("**선언 순서를 지킨다** — 고른 것을 앞으로 당기면 클릭할 때마다 칩이 움직여 다음 클릭이 빗나간다", () => {
        const { shown } = visibleChips([chip("a", true), chip("b"), chip("c", true)], ["b"], false);
        expect(shown.map((i) => i.key)).toEqual(["a", "b", "c"]);
    });

    it("펼침 — 핀과 무관하게 전부 선다(⋯ 는 사라진다)", () => {
        const { shown, rest } = visibleChips(items, [], true);
        expect(shown).toHaveLength(4);
        expect(rest).toHaveLength(0);
    });

    it("아무것도 안 골랐고 핀도 없으면 줄은 비고 전부 ⋯ 로 — 빈 줄이 정상인 채널(프리셋)이 있다", () => {
        const { shown, rest } = visibleChips([chip("a"), chip("b")], [], false);
        expect(shown).toHaveLength(0);
        expect(rest).toHaveLength(2);
    });
});

describe("parseRowState — 깨진 저장본이 줄 넷을 통째로 초기화하지 않는다", () => {
    it("없는 필드는 기본값으로 채운다", () => {
        const st = parseRowState({ shown: { month: false } })!;
        expect(st.shown.month).toBe(false);
        expect(st.shown.preset).toBe(DEFAULT_ROW_STATE.shown.preset); // 안 적힌 줄은 기본값
        expect(st.expanded).toEqual(DEFAULT_ROW_STATE.expanded);
        expect(st.pins.month).toEqual([]);
    });

    it("핀 배열의 문자열 아닌 항목은 걸러낸다 — 그 줄만 손해 보고 나머지는 산다", () => {
        const st = parseRowState({ pins: { month: ["2026-08", 7, null, "2026-07"] } })!;
        expect(st.pins.month).toEqual(["2026-08", "2026-07"]);
    });

    it("객체가 아니면 null — 호출부가 기본값으로 떨어진다", () => {
        expect(parseRowState("nope")).toBeNull();
        expect(parseRowState(null)).toBeNull();
    });
});
