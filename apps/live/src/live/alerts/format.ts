// 발화 → 사람이 읽는 형태. 서버 로그(한 줄)와 알림 메시지(구조체)가 같은 스칼라 포맷을 쓴다(드리프트 방지).
// 지연 배달 표기(⏰)는 여기가 아니라 NotifyQueue 가 붙인다 — 적재 시점엔 지연 여부를 알 수 없고,
// 배달 시점에만 알 수 있기 때문(메시지는 적재 시점에 만들어진다).
import type { NotifyMessage } from "./message.js";
import type { AlertFiring } from "./types.js";

const sign = (n: number): string => (n >= 0 ? "+" : "");

export function kstTime(ms: number): string {
    return new Date(ms).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/** 발화 시점 스칼라 한 조각: `71,000원 +2.10%`. 로그·메시지 공용. */
function scalars(f: AlertFiring): string {
    const { price, changeRate } = f.features;
    return `${price.toLocaleString("ko-KR")}원 ${sign(changeRate)}${changeRate.toFixed(2)}%`;
}

/** 한 발화의 요약 한 줄 — 서버 로그용(종목 · 현재가 · 등락률 · 메모). */
export function formatFiring(f: AlertFiring): string {
    const parts = [`${f.name || f.code}(${f.code})`, scalars(f)];
    if (f.note) parts.push(f.note);
    return parts.join(" · ");
}

/**
 * 한 배치(한 틱) 발화 → 종목당 1메시지. 같은 종목의 여러 조건은 한 메시지 안에 줄로 붙는다
 * (같은 틱이면 시세가 같으므로 스칼라는 헤더에 한 번만).
 */
export function buildFiringMessages(firings: readonly AlertFiring[]): NotifyMessage[] {
    const byCode = new Map<string, AlertFiring[]>();
    for (const f of firings) {
        const list = byCode.get(f.code);
        if (list) list.push(f);
        else byCode.set(f.code, [f]);
    }
    return [...byCode.values()].map((group) => {
        const head = group[0];
        const msg: NotifyMessage = {
            kind: "firing",
            priority: "high",
            blocks: [
                { kind: "text", text: `🔔 ${head.name || head.code}(${head.code})`, bold: true },
                { kind: "text", text: scalars(head) },
            ],
        };
        for (const f of group) if (f.note) msg.blocks.push({ kind: "text", text: `· ${f.note}` });
        return msg;
    });
}
