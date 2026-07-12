// 엔진 조립 팩토리 — createKiwoom(.env 자동 로드) + createKiwoomWs 로 배선.
// (모듈 가장자리에서만 호출. 엔진 자체는 framework-free.)
import type { Kiwoom } from "@trade-data-manager/kiwoom";
import { createKiwoomWs } from "@trade-data-manager/kiwoom/ws";
import { SheetThemeMembershipAdapter, DEFAULT_THEME_SHEET } from "@trade-data-manager/broker";
import { createSheetsClient } from "@trade-data-manager/google/sheets";
import { LiveEngine } from "./engine.js";
import { SheetMembership } from "./membership.js";
import { KiwoomTrailingHighs } from "./trailingHighs.js";

// kiwoom 은 모듈이 만들어 주입(차트 서비스와 공유). ws 는 이 엔진 전용이라 여기서 생성.
export function createLiveEngine(kiwoom: Kiwoom, conditionName: string, pollMs?: number): LiveEngine {
    const ws = createKiwoomWs(kiwoom);
    // 테마 멤버십(read) — 시트 어댑터를 live 자체 인스턴스로. 자격은 @tdm/google 이 infra/google/.env 에서 자급(소비앱 무설정).
    const membership = new SheetMembership(new SheetThemeMembershipAdapter(createSheetsClient(), DEFAULT_THEME_SHEET));
    // 트레일링 고가 — kiwoom 일봉 온디맨드(hot 종목만·캐시·self-heal). DB 무의존.
    const trailing = new KiwoomTrailingHighs(kiwoom);
    return new LiveEngine(kiwoom, ws, membership, trailing, { conditionName, pollMs });
}
