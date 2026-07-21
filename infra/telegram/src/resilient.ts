// infra/telegram 자가치유 상태기계 — 상주 MTProto 연결의 신뢰성은 transport 관심사(infra 몫)라
// 앱마다 재접속 로직을 중복하지 않도록 여기서 한 번만 보장한다.
//
// 배경(왜 필요한가): GramJS 는 접속 후 백그라운드 _updateLoop 로 세션을 유지한다. 절전/네트워크
// 끊김/장시간 idle 로 그 연결이 stale 되면 ping 이 TIMEOUT 하고, GramJS 는 로그를 찍고 _sender.reconnect()
// 를 스스로 건다(양성 소음). 문제는 '재접속 중인 나쁜 창'에 도착한 요청이 자체 타임아웃/재시도 없이
// 그냥 실패·매달린다는 것. 그래서 요청 단위로 (타임아웃 → 연결계열이면 죽은 연결 버리고 1회 재빌드
// 재시도) 를 얹어, 배경 상태와 무관하게 한 요청이 스스로 복구되게 한다.
import type { Telegram, TelegramMessage, TelegramSearchOptions } from "./types.js";

/** GramJS 한 연결의 저수준 표면(rawClient 가 구현). 상태기계는 이 포트에만 의존 → mock 주입 테스트. */
export interface RawTelegram {
    /** 로컬 플래그(client.connected). RPC 없이 싸게 연결여부를 본다. */
    isConnected(): boolean;
    searchChannel(peer: string, query: string, opts?: TelegramSearchOptions): Promise<TelegramMessage[]>;
    sendMessage(peer: string, text: string): Promise<void>;
    /** 업데이트 루프·sender 까지 완전 정리(client.destroy). 재빌드 시 옛 연결 누수 방지. */
    destroy(): Promise<void>;
}

export interface Timeouts {
    /** connect + getMe 검증 상한(openRawTelegram 내부). */
    connectTimeoutMs: number;
    /** searchChannel/sendMessage 한 번의 상한. connected-but-wedged 를 여기서 걸러 재빌드로 넘긴다. */
    opTimeoutMs: number;
}

/**
 * promise 를 ms 안에 못 끝내면 TELEGRAM_TIMEOUT:label 로 거절. 밑단 op 를 실제로 취소하진 못하지만
 * (GramJS 취소 토큰 없음), 버려진 연결은 재빌드에서 destroy 되므로 무해하다.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`TELEGRAM_TIMEOUT:${label}`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 이 에러에서 '죽은 연결을 버리고 재빌드' 를 해도 되는가?
 *  · 터미널(재시도 무의미/유해) → false 로 그대로 표면화: 세션 무효(재로그인 필요), FLOOD_WAIT(두드리면 악화).
 *  · 연결계열 → true: 우리 타임아웃, GramJS TIMEOUT, disconnect/소켓 계열.
 *  · 그 외 → '지금 끊겨 있으면' 연결문제로 간주(c.isConnected()===false).
 * 순서 주의: 터미널 제외를 먼저 본다(연결계열 정규식과 겹칠 수 있으므로).
 */
export function isConnectionError(err: unknown, c: RawTelegram): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    if (/SESSION_REVOKED|AUTH_KEY|USER_DEACTIVATED|세션 무효/i.test(msg)) return false;
    if (/FLOOD_WAIT/i.test(msg)) return false;
    if (/TIMEOUT|not connected|disconnect|connection closed|ECONNRESET|ETIMEDOUT|EPIPE|ENETUNREACH|socket/i.test(msg)) {
        return true;
    }
    return c.isConnected() === false;
}

/**
 * open 팩토리(매 호출 '깨끗한' RawTelegram 을 새로 세움)를 자가치유 Telegram 으로 감싼다.
 * 반환 객체는 Telegram 이지만 조립부(createTelegram)가 최초 접속을 강제하도록 ensureConnected 를 덧붙인다
 * (구조적 타입이라 소비자에겐 Telegram 으로 보이며 이 메서드는 감춰진다).
 */
export function makeResilient(
    open: () => Promise<RawTelegram>,
    t: Timeouts,
): Telegram & { ensureConnected(): Promise<void> } {
    let client: RawTelegram | null = null;
    let opening: Promise<RawTelegram> | null = null;
    let closed = false;

    // 살아있는 연결을 돌려준다. 동시 최초접속/재빌드는 opening 메모이즈로 한 번만.
    function getClient(): Promise<RawTelegram> {
        if (closed) return Promise.reject(new Error("텔레그램 클라이언트가 이미 종료됨"));
        if (client && client.isConnected()) return Promise.resolve(client);
        if (opening) return opening;
        opening = open()
            .then((c) => {
                client = c;
                opening = null;
                return c;
            })
            .catch((err: unknown) => {
                opening = null; // 실패 시 다음 요청에서 재시도 가능
                throw err;
            });
        return opening;
    }

    // dead 를 폐기한다. 단, 그 사이 동시 요청이 새 연결로 교체했다면(client !== dead) 건드리지 않는다
    // → 이중 teardown / 재빌드 핑퐁 방지(identity 가드).
    async function invalidate(dead: RawTelegram): Promise<void> {
        if (client !== dead) return;
        client = null;
        await dead.destroy().catch(() => {});
    }

    // 요청 1건: 타임아웃으로 감싸고, 연결계열 실패면 죽은 연결 버리고 딱 1회 재빌드 재시도.
    async function run<T>(label: string, op: (c: RawTelegram) => Promise<T>): Promise<T> {
        const first = await getClient();
        try {
            return await withTimeout(op(first), t.opTimeoutMs, label);
        } catch (err) {
            if (!isConnectionError(err, first)) throw err; // RPC/FLOOD/세션무효 → 그대로
            await invalidate(first);
            const second = await getClient(); // 재빌드(메모이즈)
            return await withTimeout(op(second), t.opTimeoutMs, label); // 재시도 실패는 그대로 던짐
        }
    }

    return {
        searchChannel(peer, query, opts) {
            return run("searchChannel", (c) => c.searchChannel(peer, query, opts));
        },
        sendMessage(peer, text) {
            return run("sendMessage", (c) => c.sendMessage(peer, text));
        },
        ensureConnected() {
            return getClient().then(() => undefined);
        },
        // 접속 진행 중에 종료되면 그 접속이 끝날 때까지 기다린 뒤 destroy 한다(누수 방지, Lazy.close 관례 미러).
        async disconnect() {
            closed = true;
            if (opening) await opening.catch(() => {});
            const c = client;
            client = null;
            opening = null;
            if (c) await c.destroy().catch(() => {});
        },
    };
}
