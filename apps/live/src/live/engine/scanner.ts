// 조건검색 스캐너(순수 실시간): CNSRLST 로 목록→seq 확정, CNSRREQ(search_type=1)로
// 초기 충족 목록 + 실시간 등록 → 이후 REAL 푸시(843: I=편입/D=이탈)로 멤버십을 유지한다.
// 일반(search_type=0) 반복 재조회는 하지 않는다 — 등록은 소켓 수명이므로 재연결 시 register() 재호출(엔진 몫).
// REAL 프레임 포맷은 문서 부실 → 관대 파싱: 843(I/D)+9001(코드)만 필수, 841(조건 seq)은 있으면 필터.
import type { KiwoomWs } from "@trade-data-manager/kiwoom/ws";
import { toCanonical } from "./codes.js";
import type { ScanHit } from "./types.js";

interface CondRow {
    "9001": string; // 종목코드(A접두)
    "302"?: string; // 종목명(실시간 응답엔 없을 수 있음 — 이름은 시세 폴(ka10095)이 채우므로 무해)
}

export class RankingScanner {
    private seq: string | null = null;
    /** code → name. 초기 목록이 시딩, REAL 편입은 ""(이름 미상 — 소비처 없음), 이탈은 삭제. */
    private members = new Map<string, string>();
    private realBound = false;

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

    /**
     * 실시간 등록(search_type=1) — 응답의 초기 충족 목록으로 멤버십을 원자 스왑(등록 시점 서버 진실).
     * 서버 등록은 이 소켓에 묶이므로 재연결마다 다시 불러야 한다(엔진 onReconnect 경로).
     */
    async register(): Promise<void> {
        if (this.seq == null) throw new Error("RankingScanner.init() 먼저 호출해야 함");
        this.bindReal();
        const req = { trnm: "CNSRREQ", seq: this.seq, search_type: "1", stex_tp: "K" };
        const res = await this.ws.request(req, (f) => f.trnm === "CNSRREQ" && f.seq === this.seq, 15000);
        const rows = (res.data ?? []) as CondRow[];
        const next = new Map<string, string>();
        for (const r of rows) {
            const code = toCanonical(r["9001"]);
            if (code) next.set(code, (r["302"] ?? "").trim());
        }
        this.members = next;
    }

    /** REAL 푸시 → 편입/이탈 반영. 핸들러는 1회만 바인딩(재등록해도 중복 없음). */
    private bindReal(): void {
        if (this.realBound) return;
        this.realBound = true;
        this.ws.onReal((f) => {
            const arr = Array.isArray(f.data) ? (f.data as Array<Record<string, unknown>>) : [];
            for (const d of arr) {
                const v = (d?.values ?? {}) as Record<string, unknown>;
                const io = String(v["843"] ?? "").trim().toUpperCase();
                if (io !== "I" && io !== "D") continue; // 조건검색 편입/이탈 프레임 아님(체결 등) → 무시
                const seq = String(v["841"] ?? "").trim();
                if (seq && this.seq && seq !== this.seq) continue; // 다른 조건식의 푸시
                const code = toCanonical(String(v["9001"] ?? d?.item ?? ""));
                if (!code) continue;
                if (io === "I") {
                    if (!this.members.has(code)) this.members.set(code, "");
                } else {
                    this.members.delete(code);
                }
            }
        });
    }

    /** 현재 멤버십(코드+명) — 푸시로 유지되는 인메모리 뷰, 동기 읽기. */
    current(): ScanHit[] {
        return [...this.members].map(([code, name]) => ({ code, name }));
    }
}
