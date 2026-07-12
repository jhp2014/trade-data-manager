// 조건검색 스캐너: CNSRLST 로 목록→seq 확정, CNSRREQ(search_type=0)로 현재 충족 종목 멤버십.
// 매 틱(5초) 재조회 — 매번 서버 진실 전체를 받으므로 drift·푸시 포맷 리스크가 없다.
// (실시간(search_type=1)은 100종목 한도(과거 실측 121매칭)라 기각 — 292fe77 도입, 오진 판명 후 복원.
//  당시 "갱신 안 됨"의 실제 원인은 정규장 시간 밖이라 조건 매칭이 조용했던 것.)
// 정본: market-eye/src/engine/rankingScanner.ts. WS 는 tdm infra/kiwoom KiwoomWs(주입).
import type { KiwoomWs } from "@trade-data-manager/kiwoom/ws";
import { toCanonical } from "./codes.js";
import type { ScanHit } from "./types.js";

interface CondRow {
    "9001": string; // 종목코드(A접두)
    "302": string; // 종목명
}

export class RankingScanner {
    private seq: string | null = null;

    constructor(
        private readonly ws: KiwoomWs,
        private readonly conditionName: string,
    ) {}

    /** CNSRLST 로 목록을 받아 이름으로 seq 확정(CNSRREQ 전 선조회 요구사항 겸함). */
    async init(): Promise<void> {
        const res = await this.ws.request({ trnm: "CNSRLST" }, (f) => f.trnm === "CNSRLST");
        const list = (res.data ?? []) as [string, string][];
        const found = list.find(([, name]) => name === this.conditionName);
        if (!found) {
            const names = list.map(([s, n]) => `${s}:${n}`).join(", ");
            throw new Error(
                `조건식 '${this.conditionName}' 없음. 영웅문에서 만들고 서버저장했는지 확인.\n  현재 목록: ${names}`,
            );
        }
        this.seq = found[0];
    }

    get conditionSeq(): string | null {
        return this.seq;
    }

    /** 1회 재조회 → 현재 충족 종목 멤버십(코드+명). */
    async scan(): Promise<ScanHit[]> {
        if (this.seq == null) throw new Error("RankingScanner.init() 먼저 호출해야 함");
        const req = { trnm: "CNSRREQ", seq: this.seq, search_type: "0", stex_tp: "K" };
        const res = await this.ws.request(req, (f) => f.trnm === "CNSRREQ" && f.seq === this.seq, 15000);
        const rows = (res.data ?? []) as CondRow[];
        return rows.map((r) => ({ code: toCanonical(r["9001"]), name: (r["302"] ?? "").trim() }));
    }
}
