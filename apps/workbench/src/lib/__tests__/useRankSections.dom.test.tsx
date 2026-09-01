// useRankSections 의 접기 — 번들 → (날짜|분) 단면 조회·코드 인덱스. 서버 대사는 api 테스트가 지키고,
// 여긴 클라가 그 계약을 **틀리지 않게 접는지**(시각 절단·유니버스 밖 null·pending)만 본다.
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RankSectionBundle } from "../../api/rankSections.js";
import { rankSectionsQuery } from "../../api/queries.js";
import { useRankSections } from "../useRankSections.js";

const BUNDLE: RankSectionBundle = {
    version: 1,
    dates: [{
        date: "2026-08-14",
        sealed: true,
        codes: ["A", "B", "C"],
        sections: [
            { time: "09:30", n: 3, rows: [0, 2, 1, 1, 1, 2, 2, 3, 3] },
            { time: "10:00", n: 2, rows: [0, 1, 2, 1, 2, 1, 2, -1, -1] },
        ],
    }],
    pending: ["2026-08-28"],
};

function setup() {
    const qc = new QueryClient();
    qc.setQueryData(rankSectionsQuery().queryKey, BUNDLE);
    const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    return renderHook(() => useRankSections(), { wrapper });
}

describe("useRankSections — 번들 접기", () => {
    it("타점 시각(HH:MM:SS)을 분으로 절단해 단면을 찾는다", async () => {
        const { result } = setup();
        await waitFor(() => expect(result.current.bundle).not.toBeNull());
        const v = result.current.sectionAt("2026-08-14", "09:30:45");
        expect(v?.section.time).toBe("09:30");
        expect(v?.sealed).toBe(true);
        expect(v?.ranksOf("A")).toEqual({ rate: 2, amount: 1 });
    });

    it("유니버스 밖 코드는 null — 지어내지 않는다. 결손 서수는 null 그대로", async () => {
        const { result } = setup();
        await waitFor(() => expect(result.current.bundle).not.toBeNull());
        const v = result.current.sectionAt("2026-08-14", "10:00")!;
        expect(v.ranksOf("Z")).toBeNull();
        expect(v.indexOf("Z")).toBeNull();
        expect(v.ranksOf("C")).toEqual({ rate: null, amount: null });
    });

    it("없는 (날짜,분)은 null, pending 은 그대로 노출", async () => {
        const { result } = setup();
        await waitFor(() => expect(result.current.bundle).not.toBeNull());
        expect(result.current.sectionAt("2026-08-14", "11:00")).toBeNull();
        expect(result.current.sectionAt("2026-01-01", "09:30")).toBeNull();
        expect(result.current.pending).toEqual(["2026-08-28"]);
    });
});
