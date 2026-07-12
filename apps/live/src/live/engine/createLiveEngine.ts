// 엔진 조립 팩토리 — createKiwoom(.env 자동 로드) + createKiwoomWs 로 배선.
// (모듈 가장자리에서만 호출. 엔진 자체는 framework-free.)
import { createKiwoom } from "@trade-data-manager/kiwoom";
import { createKiwoomWs } from "@trade-data-manager/kiwoom/ws";
import { LiveEngine } from "./engine.js";

export function createLiveEngine(conditionName: string, pollMs?: number): LiveEngine {
    const kiwoom = createKiwoom();
    const ws = createKiwoomWs(kiwoom);
    return new LiveEngine(kiwoom, ws, { conditionName, pollMs });
}
