// 차트 거래대금 우상단 — 지금 타점의 라벨. 잠그는 것: ① 직접 라벨은 진하게, 하위를 거친 조상은 흐리게 뒤에
// ② 라벨 없는 분·시간선 없음 = 아예 안 선다 ③ 지워진 그룹(사전에 없음)은 안 선다.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Providers, seededClient, type Seed } from "../../test/renderPanel.js";
import { PointLabelCard } from "../PointLabelCard.js";

const seed: Seed = {
    groups: [{ name: "강세", parentName: null }, { name: "베타 강세", parentName: "강세" }, { name: "돌파", parentName: null }],
    pointMemberships: [
        { stockCode: "A", date: "2026-09-25", time: "09:12:00", groupNames: ["베타 강세", "돌파", "지워짐"] },
    ],
};

const renderCard = (time: string | null): HTMLElement => {
    const client = seededClient(seed);
    return render(<Providers client={client}><PointLabelCard code="A" date="2026-09-25" time={time} /></Providers>).container;
};

describe("PointLabelCard", () => {
    it("직접 라벨 뒤에 경유 조상을 흐리게 · 지워진 그룹은 없다", () => {
        const c = renderCard("09:12:00");
        const names = [...c.querySelectorAll<HTMLElement>("span[title]")].map((s) => [s.textContent, s.style.opacity]);
        expect(names.slice(0, 2).sort()).toEqual([["돌파", "1"], ["베타 강세", "1"]]);
        expect(names[2]).toEqual(["강세", "0.45"]);
        expect(names).toHaveLength(3);
        expect(c.querySelector("span[title*='하위 라벨을 거쳐']")?.textContent).toBe("강세");
    });

    it("라벨 없는 분·시간선 없음 = 안 선다", () => {
        expect(renderCard("09:13:00").textContent).toBe("");
        expect(renderCard(null).textContent).toBe("");
    });
});
