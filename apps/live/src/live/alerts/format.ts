// 발화 → 사람이 읽는 한 줄 — 서버 로그와 텔레그램 메시지가 같은 포맷을 쓴다(드리프트 방지).
import type { AlertFiring } from "./types.js";

const sign = (n: number): string => (n >= 0 ? "+" : "");
const DELAY_MARK_MS = 30_000; // 이보다 늦게 배달되면 원발화 시각 표기(텔레그램 수신시각 오독 방지)

export function kstTime(ms: number): string {
    return new Date(ms).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/** 한 발화의 요약 한 줄: 종목 · 현재가 · 등락률 · 메모 (+지연 배달이면 원발화 시각). */
export function formatFiring(f: AlertFiring, now?: number): string {
    const { price, changeRate } = f.features;
    const parts = [`${f.name || f.code}(${f.code})`, `${price.toLocaleString("ko-KR")}원 ${sign(changeRate)}${changeRate.toFixed(2)}%`];
    if (f.note) parts.push(f.note);
    if (now != null && now - f.at > DELAY_MARK_MS) parts.push(`⏰ ${kstTime(f.at)} 발화(지연 전송)`);
    return parts.join(" · ");
}

/** 한 배치(한 틱) 발화 → 종목당 1메시지 텍스트 — 전송로(Bot API/MTProto) 공용. now=배달 시각(지연 표기용). */
export function buildAlertMessages(firings: readonly AlertFiring[], now?: number): string[] {
    const byCode = new Map<string, AlertFiring[]>();
    for (const f of firings) {
        const list = byCode.get(f.code);
        if (list) list.push(f);
        else byCode.set(f.code, [f]);
    }
    return [...byCode.values()].map((group) => `🔔 ${group.map((f) => formatFiring(f, now)).join("\n")}`);
}
