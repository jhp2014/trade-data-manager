// 조건검색 스캐너: CNSRLST 로 목록→seq 확정, CNSRREQ(search_type=0)로 현재 충족 종목 멤버십.
// 매 틱(5초) 재조회 — 매번 서버 진실 전체를 받으므로 drift·푸시 포맷 리스크가 없다.
// (실시간(search_type=1)은 100종목 한도(과거 실측 121매칭)라 기각 — 292fe77 도입, 오진 판명 후 복원.
//  당시 "갱신 안 됨"의 실제 원인은 정규장 시간 밖이라 조건 매칭이 조용했던 것.)
// 정본: market-eye/src/engine/rankingScanner.ts. WS 는 tdm infra/kiwoom KiwoomWs(주입).
import type { LiveConditionEntry } from "@trade-data-manager/wire";
import type { LiveWs } from "./ports.js";
import { toCanonical } from "./codes.js";
import type { ScanHit } from "./types.js";

interface CondRow {
    "9001": string; // 종목코드(A접두)
    "302": string; // 종목명
}

/** 에러 프레임(return_code≠0)이 "매칭 0개"로 위장되지 않게 — 서버 메시지를 실어 던진다(엔진 오류 로그로 노출). */
function assertOk(frame: Record<string, unknown>, label: string): void {
    const rc = frame.return_code;
    if (rc != null && Number(rc) !== 0) {
        throw new Error(`${label} 실패 (return_code=${String(rc)}): ${String(frame.return_msg ?? "메시지 없음")}`);
    }
}

/** CNSRLST 1회 — 서버저장 조건식 전체 목록. 스캐너 init(이름→seq 해소)과 설정 UI(GET /conditions)가 공유. */
export async function fetchConditionList(ws: LiveWs): Promise<LiveConditionEntry[]> {
    const res = await ws.request({ trnm: "CNSRLST" }, (f) => f.trnm === "CNSRLST");
    assertOk(res, "CNSRLST");
    return ((res.data ?? []) as [string, string][]).map(([seq, name]) => ({ seq, name }));
}

export class RankingScanner {
    private seq: string | null = null;

    constructor(
        private readonly ws: LiveWs,
        private readonly conditionName: string,
    ) {}

    /** CNSRLST 로 목록을 받아 이름으로 seq 확정(CNSRREQ 전 선조회 요구사항 겸함). */
    async init(): Promise<void> {
        const list = await fetchConditionList(this.ws);
        const found = list.find((c) => c.name === this.conditionName);
        if (!found) {
            const names = list.map((c) => `${c.seq}:${c.name}`).join(", ");
            throw new Error(
                `조건식 '${this.conditionName}' 없음. 영웅문에서 만들고 서버저장했는지 확인.\n  현재 목록: ${names}`,
            );
        }
        this.seq = found.seq;
    }

    get conditionSeq(): string | null {
        return this.seq;
    }

    /** 1회 재조회 → 현재 충족 종목 멤버십(코드+명). */
    async scan(): Promise<ScanHit[]> {
        if (this.seq == null) throw new Error("RankingScanner.init() 먼저 호출해야 함");
        const req = { trnm: "CNSRREQ", seq: this.seq, search_type: "0", stex_tp: "K" };
        const res = await this.ws.request(req, (f) => f.trnm === "CNSRREQ" && f.seq === this.seq, 15000);
        assertOk(res, "CNSRREQ"); // 조회 제한 등 에러 응답이 빈 멤버십으로 새지 않게(hot 전멸 위장 방지)
        const rows = (res.data ?? []) as CondRow[];
        return rows.map((r) => ({ code: toCanonical(r["9001"]), name: (r["302"] ?? "").trim() }));
    }
}
