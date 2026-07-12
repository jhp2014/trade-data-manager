// 시트 테마 멤버십(read) — 엔진이 종목→테마 룩업에 쓴다. 정본 어댑터=infra/broker SheetThemeMembershipAdapter.
// write(배정)는 workbench→apps/api 경로라 여기 없다(live 는 읽기 전용). 로드 실패는 삼켜 빈 멤버십으로 degrade.
import type { ThemeMember } from "@trade-data-manager/market";

/** 엔진이 의존하는 최소 표면(코드→테마들). 구체 어댑터는 조립 가장자리(createLiveEngine)에서 주입. */
export interface MembershipSource {
    themesOf(code: string): string[];
    reload(): Promise<void>;
}

/** ThemeMembershipProvider(load())를 code→themes[] 맵으로 캐시. reload 로 갱신(배정 반영). */
export class SheetMembership implements MembershipSource {
    private byCode = new Map<string, string[]>();

    constructor(private readonly provider: { load(): Promise<ThemeMember[]> }) {}

    /** 시트 전체를 다시 읽어 code→themes 맵을 재구성. 성공 시에만 원자 스왑(실패하면 직전 맵 유지 → 호출측이 catch). */
    async reload(): Promise<void> {
        const members = await this.provider.load();
        const next = new Map<string, string[]>();
        for (const m of members) {
            const list = next.get(m.code);
            if (list) list.push(m.theme);
            else next.set(m.code, [m.theme]);
        }
        this.byCode = next;
    }

    themesOf(code: string): string[] {
        return this.byCode.get(code) ?? [];
    }
}
