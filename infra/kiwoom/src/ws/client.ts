// 키움 WebSocket 클라이언트 (조건검색/실시간). 정본: market-eye/src/lib/kiwoomWs.ts 이주.
// 흐름: connect → LOGIN(token) → CNSRLST/CNSRREQ ... → PING echo 유지
// 끊기면 백오프로 자동 재연결 + 재LOGIN. 연결 수명(백오프·토큰 강제갱신)은 전부 이 클래스가 소유한다.
// 이벤트: 'connected' = LOGIN 성공 전부(최초·재연결) / 'reconnected' = 재연결만 / 'status' = 연결 상태.
//   최초 연결 실패는 기본적으로 호출자 몫이지만(CLI 즉시 실패), autoRetryFirstConnect 면 여기서 재시도한다.
// 모든 프레임은 logFrame 으로 기록된다.
// 단일 상주 연결이라 CredentialPool(REST 로테이션)과 무관 — 토큰 공급자(getToken)만 주입받는다.
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { type FrameLogger, noopFrameLogger } from "./frameLogger.js";

export type ConnectionStatus = "closed" | "connecting" | "reconnecting" | "live";

type Frame = Record<string, any>;
type Waiter = {
    match: (f: Frame) => boolean;
    resolve: (f: Frame) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
};

export interface KiwoomWsOptions {
    wsUrl: string;
    /** 토큰 공급자(보통 CredentialPool.primaryToken). force=true 면 강제 재발급. */
    getToken: (force?: boolean) => Promise<string>;
    logFrame?: FrameLogger;
    /**
     * **최초** 연결 실패도 백오프 재연결할지(기본 false).
     *  · false(기본) = CLI·recon 계약: 첫 연결 실패는 즉시 호출자에게 알린다. 앱키 오류·URL 오타·조건식 부재를
     *    5분씩 매달리며 숨기지 않는다(끊김 후 재연결은 이 값과 무관하게 항상 동작).
     *  · true = 상주 데몬(apps/live)용: 장외·무효 토큰 같은 일시 실패에서 자력 복구한다. 재시도가
     *    forceTokenRefresh 를 격발해 **무효 캐시 토큰까지 자가치유**한다(2026-07-15 실측: 이게 없어
     *    LOGIN 805004 에 엔진이 영구 사망, 손으로 캐시를 지워야 복구됐다).
     * true 여도 connect() 는 첫 실패에 reject 한다(호출자가 로그를 남기게) — 복구는 백그라운드로 계속되고,
     * 지연 성공은 'connected' 이벤트로 알린다.
     */
    autoRetryFirstConnect?: boolean;
}

const BACKOFF_MIN = 1_000;
const BACKOFF_MAX = 30_000;

export class KiwoomWs extends EventEmitter {
    private ws: WebSocket | null = null;
    private waiters: Waiter[] = [];
    private realHandlers: ((f: Frame) => void)[] = [];

    private status: ConnectionStatus = "closed";
    private shouldRun = false; // 의도적 close와 끊김을 구분
    private started = false; // 최초 LOGIN 성공 1회 이상 → 이후 재연결은 'reconnected' emit
    private reconnectTimer: NodeJS.Timeout | null = null;
    private backoff = BACKOFF_MIN;
    private forceTokenRefresh = false; // 직전 LOGIN 거부 시 다음 시도는 토큰 강제 갱신

    private readonly wsUrl: string;
    private readonly getToken: (force?: boolean) => Promise<string>;
    private readonly logFrame: FrameLogger;
    private readonly autoRetryFirstConnect: boolean;

    constructor(opts: KiwoomWsOptions) {
        super();
        this.wsUrl = opts.wsUrl;
        this.getToken = opts.getToken;
        this.logFrame = opts.logFrame ?? noopFrameLogger;
        this.autoRetryFirstConnect = opts.autoRetryFirstConnect ?? false;
    }

    getStatus(): ConnectionStatus {
        return this.status;
    }
    get connected(): boolean {
        return this.status === "live";
    }

    private setStatus(s: ConnectionStatus): void {
        if (this.status === s) return;
        this.status = s;
        this.emit("status", s);
    }

    /** 최초 연결 + LOGIN까지 await. 이후 끊김은 자동 재연결(백오프). */
    async connect(): Promise<void> {
        this.shouldRun = true;
        await this.open();
    }

    /** 1회 연결 시도. resolve=LOGIN 성공. 실패 시 reject(최초 연결이면 호출자에게 전파). */
    private open(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.setStatus(this.started ? "reconnecting" : "connecting");
            let settled = false;
            const settle = (fn: () => void) => {
                if (settled) return;
                settled = true;
                fn();
            };

            this.getToken(this.forceTokenRefresh)
                .then((token) => {
                    this.forceTokenRefresh = false;
                    const ws = new WebSocket(this.wsUrl);
                    this.ws = ws;

                    ws.on("open", () => {
                        this.logFrame("sys", { event: "open", url: this.wsUrl });
                        this.sendRaw({ trnm: "LOGIN", token });
                    });

                    ws.on("message", (raw) => {
                        let frame: Frame;
                        try {
                            frame = JSON.parse(raw.toString());
                        } catch {
                            this.logFrame("sys", { event: "parse_error", raw: raw.toString().slice(0, 200) });
                            return;
                        }
                        this.logFrame("in", frame);

                        // PING 은 받은 그대로 echo (안 하면 서버가 끊음)
                        if (frame.trnm === "PING") {
                            this.sendRaw(frame);
                            return;
                        }

                        // LOGIN 응답 처리
                        if (frame.trnm === "LOGIN") {
                            if (frame.return_code === 0) {
                                this.logFrame("sys", { event: "login_ok" });
                                this.backoff = BACKOFF_MIN;
                                const wasStarted = this.started;
                                this.started = true;
                                this.setStatus("live");
                                settle(resolve);
                                // 'connected' = LOGIN 성공 전부(최초·재연결 공통). autoRetryFirstConnect 로 첫 연결이
                                // **지연 성공**하면 connect() 는 이미 reject 됐고 wasStarted 도 false라 'reconnected' 가
                                // 안 뜬다 — 그 성공을 소비자가 알 수 있는 유일한 통로다.
                                this.emit("connected");
                                if (wasStarted) this.emit("reconnected"); // 재연결 → 엔진이 scanner 재init
                            } else {
                                this.forceTokenRefresh = true; // 토큰 문제 가능 → 다음 시도 강제 갱신
                                this.logFrame("sys", { event: "login_fail", code: frame.return_code });
                                settle(() =>
                                    reject(new Error(`LOGIN 실패 (${frame.return_code}): ${frame.return_msg}`)),
                                );
                                ws.close(); // close 핸들러가 재연결 스케줄
                            }
                            return;
                        }

                        // 실시간(REAL) 프레임은 핸들러로
                        if (frame.trnm === "REAL") {
                            for (const h of this.realHandlers) h(frame);
                        }

                        // 대기 중인 요청 응답 매칭
                        for (const w of [...this.waiters]) {
                            if (w.match(frame)) {
                                clearTimeout(w.timer);
                                this.waiters = this.waiters.filter((x) => x !== w);
                                w.resolve(frame);
                            }
                        }
                    });

                    ws.on("close", (code) => {
                        this.logFrame("sys", { event: "close", code });
                        settle(() => reject(new Error(`연결 종료 (code ${code})`)));
                        this.handleDisconnect();
                    });
                    ws.on("error", (err) => {
                        this.logFrame("sys", { event: "error", message: (err as Error).message });
                        settle(() => reject(err as Error)); // close 가 뒤따르며 재연결 스케줄
                    });
                })
                .catch((err) => {
                    this.logFrame("sys", { event: "connect_error", message: (err as Error).message });
                    settle(() => reject(err as Error));
                    this.handleDisconnect();
                });
        });
    }

    /** 끊김 처리: 대기중 요청 즉시 실패 + (최초 연결 성공 이력이 있으면) 백오프 재연결 예약. */
    private handleDisconnect(): void {
        for (const w of this.waiters.splice(0)) {
            clearTimeout(w.timer);
            w.reject(new Error("연결이 끊겼습니다"));
        }
        this.ws = null;

        // 의도적 종료면 재연결 안 함. 최초 시도 실패는 기본적으로 호출자에게 위임하되(CLI 즉시 실패),
        // autoRetryFirstConnect 면 여기서도 백오프 재시도한다(상주 데몬 — 아래 재연결 기계를 그대로 재사용).
        if (!this.shouldRun || (!this.started && !this.autoRetryFirstConnect)) {
            this.setStatus(this.shouldRun ? "connecting" : "closed");
            return;
        }
        if (this.reconnectTimer) return; // 이미 예약됨

        this.setStatus("reconnecting");
        const delay = this.backoff;
        this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX);
        this.logFrame("sys", { event: "reconnect_scheduled", delayMs: delay });
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.open().catch(() => {
                /* 실패하면 close 핸들러가 다시 스케줄 */
            });
        }, delay);
    }

    private sendRaw(frame: Frame): void {
        this.logFrame("out", frame);
        this.ws?.send(JSON.stringify(frame));
    }
    send(frame: Frame): void {
        this.sendRaw(frame);
    }

    /** 특정 응답(trnm 등)을 기다린다. 미연결이면 즉시 실패(15초 매달림 방지). */
    request(frame: Frame, match: (f: Frame) => boolean, timeoutMs = 10000): Promise<Frame> {
        if (this.status !== "live" || !this.ws) {
            return Promise.reject(new Error("키움 서버에 연결되어 있지 않습니다"));
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiters = this.waiters.filter((w) => w.timer !== timer);
                reject(new Error("키움 서버 응답이 지연되고 있습니다"));
                this.recover(); // 응답 지연 = 반쯤 죽은 연결 의심 → 소켓 강제 재활용(close→재연결)
            }, timeoutMs);
            this.waiters.push({ match, resolve, reject, timer });
            this.sendRaw(frame);
        });
    }

    /** 응답이 끊겼는데 'close'가 안 오는 반-사망(half-open) 소켓을 강제로 끊어 재연결을 유발. */
    private recover(): void {
        if (!this.shouldRun || !this.ws) return; // 이미 재연결 진행 중이면 ws=null
        this.logFrame("sys", { event: "recover_force_terminate" });
        this.ws.terminate(); // 'close' 발생 → handleDisconnect → 백오프 재연결
    }

    onReal(cb: (f: Frame) => void): void {
        this.realHandlers.push(cb);
    }

    close(): void {
        this.shouldRun = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.ws?.close();
        this.setStatus("closed");
    }
}
