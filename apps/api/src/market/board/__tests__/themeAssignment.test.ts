import { describe, expect, it } from "vitest";
import type { ThemeMember } from "@trade-data-manager/market";
import { CachedMembership } from "../cachedMembership.js";
import { ThemeAssignment } from "../themeAssignment.js";

// 시트 페이크 — append-only(중복 방지가 쓰기 쪽에 없으므로 규칙이 앱에 있어야 한다는 게 이 테스트의 요지).
function fakeSheet(seed: ThemeMember[] = []) {
    const rows = [...seed];
    return {
        rows,
        loads: 0,
        load(this: { loads: number }): Promise<ThemeMember[]> {
            this.loads++;
            return Promise.resolve([...rows]);
        },
        addMember: (m: ThemeMember): Promise<void> => {
            rows.push(m);
            return Promise.resolve();
        },
    };
}
const master = { refresh: () => {}, refreshed: 0 } as unknown as { refresh(): void };

const member = (theme: string, code: string): ThemeMember => ({ theme, code } as ThemeMember);

function build(seed: ThemeMember[] = []) {
    const sheet = fakeSheet(seed);
    const membership = new CachedMembership(sheet);
    return { sheet, membership, svc: new ThemeAssignment(membership, master as never, sheet) };
}

describe("ThemeAssignment", () => {
    it("이미 그 테마면 시트에 안 쓴다(append-only 라 중복 행이 쌓인다)", async () => {
        const { sheet, svc } = build([member("2차전지", "005930")]);

        expect(await svc.assign({ theme: "2차전지", code: "005930" })).toEqual({ assigned: false });
        expect(sheet.rows).toHaveLength(1);
    });

    it("같은 종목이라도 다른 테마면 배정한다(한 종목이 여러 테마에 속하는 건 정상)", async () => {
        const { sheet, svc } = build([member("2차전지", "005930")]);

        expect(await svc.assign({ theme: "반도체", code: "005930" })).toEqual({ assigned: true });
        expect(sheet.rows).toHaveLength(2);
    });

    it("배정 뒤 멤버십 캐시가 비워져 다음 조회가 새 행을 본다", async () => {
        const { membership, svc } = build();

        await membership.load(); // 캐시 채움
        await svc.assign({ theme: "로봇", code: "000660" });

        const after = await membership.load();
        expect(after.map((m) => m.theme)).toContain("로봇");
    });

    it("같은 (테마,종목) 동시 배정은 한 행만 남는다 — check-then-act 를 사슬로 직렬화", async () => {
        // 직렬화가 없으면 둘 다 같은 로드(캐시 dedup)에서 "없음"을 보고 둘 다 append → 시트에 중복 행.
        const { sheet, svc } = build();

        const [r1, r2] = await Promise.all([
            svc.assign({ theme: "로봇", code: "000660" }),
            svc.assign({ theme: "로봇", code: "000660" }),
        ]);

        expect([r1.assigned, r2.assigned].sort()).toEqual([false, true]); // 한쪽만 실제 배정
        expect(sheet.rows).toHaveLength(1);
    });

    it("편입이슈는 공백만이면 안 싣는다", async () => {
        const { sheet, svc } = build();

        await svc.assign({ theme: "로봇", code: "000660", issue: "   " });
        expect(sheet.rows[0].issue).toBeUndefined();
    });

    it("contextOf — 그 종목 행 전부(중복 포함) + 전체 테마 목록(가나다)", async () => {
        const { svc } = build([member("반도체", "005930"), member("반도체", "005930"), member("2차전지", "005930"), member("로봇", "000660")]);

        const ctx = await svc.contextOf("005930");
        expect(ctx.current).toHaveLength(3); // 시트가 진실 — 중복 행도 그대로 노출
        expect(ctx.allThemes).toEqual(["2차전지", "로봇", "반도체"]);
    });
});
