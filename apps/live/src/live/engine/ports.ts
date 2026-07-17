// 엔진·스캐너·폴러가 의존하는 **최소 표면(포트)** — 엔진이 Kiwoom 전체가 아니라 **실제로 쓰는 메서드만**
// 의존하게 좁힌다(ISP). KiwoomWs·KiwoomRest 는 private 필드를 가진 concrete 클래스라 구조적 대역을 꽂을 수
// 없었다 → 테스트가 캐스트(as unknown as Kiwoom) 없이 대역을 주입한다(= 대역도 타입 검사를 받는다).
// 실물 KiwoomRest/KiwoomWs 는 이 포트를 이미 만족하므로 런타임 동작 무변화.
import type { ConnectionStatus } from "@trade-data-manager/kiwoom/ws";
import type { KiwoomApiResponse, KiwoomKa10095Response } from "@trade-data-manager/kiwoom";

/** WS 프레임(느슨한 JSON 맵) — 스캐너가 trnm/data/return_code 를 캐스트로 읽는다. */
export type WsFrame = Record<string, unknown>;

/** 조건검색 WS 최소 표면 — 스캐너(request)·엔진(연결 수명·상태). 실물=KiwoomWs. */
export interface LiveWs {
    connect(): Promise<void>;
    getStatus(): ConnectionStatus;
    request(frame: WsFrame, match: (f: WsFrame) => boolean, timeoutMs?: number): Promise<WsFrame>;
    close(): void;
    on(event: "status", listener: (s: ConnectionStatus) => void): void;
    on(event: "connected", listener: () => void): void;
}

/** 멀티시세 소스 최소 표면 — 폴러(getMultiQuote)만. 실물=KiwoomRest. */
export interface QuoteSource {
    getMultiQuote(codes: string[]): Promise<KiwoomApiResponse<KiwoomKa10095Response>>;
}
