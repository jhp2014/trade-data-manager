// 테마 배정 유스케이스 — 시트(정적 정체성)에 (테마, 종목) 행을 추가하고 캐시를 무효화한다.
//
// 규칙이 둘 있어서 컨트롤러가 아니라 여기 산다:
//  ① **이미 그 테마면 추가하지 않는다** — 시트는 append-only 라 그냥 쓰면 중복 행이 쌓인다.
//     (같은 종목이 여러 테마에 속하는 건 정상이므로 "그 테마에 이미 있는가"만 본다.)
//  ② **쓰기 뒤 캐시 무효화 순서** — 시트에 append 한 다음 멤버십 캐시를 비워야 다음 조회가 새 행을 본다.
//     반대로 하면 append 전 상태를 다시 캐싱해 배정이 화면에 안 나타난다.
import { kstToday, type ThemeMembershipStore } from "@trade-data-manager/market";
import type { ThemeContext } from "@trade-data-manager/wire";
import type { CachedMembership } from "./cachedMembership.js";
import type { MasterCache } from "./masterCache.js";

export interface AssignInput {
    theme: string;
    code: string;
    name?: string;
    /** 편입이슈(선택) — 새로 추가하는 행에만 기록. */
    issue?: string;
}

export class ThemeAssignment {
    constructor(
        private readonly membership: CachedMembership,
        private readonly master: MasterCache,
        private readonly store: ThemeMembershipStore,
    ) {}

    /** 종목 우클릭 팝업용 — 이 종목의 (테마, 편입이슈) 전부 + 자동완성용 전체 테마. */
    async contextOf(code: string): Promise<ThemeContext> {
        const all = await this.membership.load();
        return {
            current: all.filter((m) => m.code === code), // 중복 행도 그대로 노출(시트가 진실)
            allThemes: [...new Set(all.map((m) => m.theme))].sort((a, b) => a.localeCompare(b, "ko")),
        };
    }

    /** 배정. 이미 그 테마면 아무것도 안 하고 assigned:false(규칙 ①). */
    async assign({ theme, code, name, issue }: AssignInput): Promise<{ assigned: boolean }> {
        const all = await this.membership.load();
        if (all.some((m) => m.code === code && m.theme === theme)) return { assigned: false };
        await this.store.addMember({ theme, code, name, issue: issue?.trim() || undefined, date: kstToday() });
        this.membership.refresh(); // 규칙 ② — append 뒤에 비워야 다음 조회가 새 행을 본다
        return { assigned: true };
    }

    /** 시트 수동편집·신규상장 후 날짜무관 캐시 무효화(수동 트리거). 날짜별 불변 파일 캐시는 무관. */
    refreshCaches(): void {
        this.membership.refresh();
        this.master.refresh();
    }
}
