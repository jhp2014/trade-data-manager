import { describe, it, expect } from "vitest";
import { extractIpoPrice } from "../ipoPrice.js";
import type { ListInfoEvent } from "../marketCap.js";

const ev = (listDate: string, issueType: string, issuePrice: string): ListInfoEvent => ({
    listDate,
    issueQty: "0",
    totalShares: "0",
    issuePrice,
    issueType,
});

describe("extractIpoPrice", () => {
    // 더본코리아 실측 형태: 상장일 유상증자(공모가) + 통일교체(액면) 동시.
    const listingDate = "2024-11-06";
    const events = [
        ev("2024-11-06", "유상증자", "34000"), // 공모가
        ev("2024-11-06", "통일교체", "500"), // 액면가
        ev("2026-02-12", "STOCKOPTION행사", "9224"), // 후속, 무관
    ];

    it("상장일 유상증자 행의 issue_price = 공모가", () => {
        expect(extractIpoPrice(events, listingDate)).toBe("34000");
    });

    it("상장일 이후 유상증자는 무시(상장일 앵커)", () => {
        const later = [ev("2025-06-01", "유상증자", "99999")];
        expect(extractIpoPrice(later, "2024-11-06")).toBeNull();
    });

    it("상장일에 유상증자 행이 없으면 null", () => {
        const noIpo = [ev("2024-11-06", "통일교체", "500")];
        expect(extractIpoPrice(noIpo, "2024-11-06")).toBeNull();
    });

    it("빈 이벤트는 null", () => {
        expect(extractIpoPrice([], "2024-11-06")).toBeNull();
    });

    it("같은 날 유상증자 다중이면 최대 issue_price", () => {
        const multi = [
            ev("2024-11-06", "유상증자", "12000"),
            ev("2024-11-06", "유상증자", "34000"),
        ];
        expect(extractIpoPrice(multi, "2024-11-06")).toBe("34000");
    });
});
