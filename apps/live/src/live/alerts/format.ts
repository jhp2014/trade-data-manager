// 발화 → 사람이 읽는 한 줄 — 서버 로그와 텔레그램 메시지가 같은 포맷을 쓴다(드리프트 방지).
import type { AlertFiring } from "./types.js";

const sign = (n: number): string => (n >= 0 ? "+" : "");

/** 한 발화의 요약 한 줄: 종목 · 현재가 · 등락률 · (밴드)기준가 대비 · (순위)테마 순위 · 메모. */
export function formatFiring(f: AlertFiring): string {
    const { price, changeRate, baselinePct, themeRank, themeRankDelta } = f.features;
    const parts = [`${f.name || f.code}(${f.code})`, `${price.toLocaleString("ko-KR")}원 ${sign(changeRate)}${changeRate.toFixed(2)}%`];
    if (baselinePct != null) parts.push(`기준가 대비 ${sign(baselinePct)}${baselinePct.toFixed(2)}%`);
    if (themeRank != null) parts.push(`테마 ${themeRank}위${themeRankDelta != null ? `(↑${themeRankDelta})` : ""}`);
    if (f.note) parts.push(f.note);
    return parts.join(" · ");
}

/** 한 배치(한 틱) 발화 → 종목당 1메시지 텍스트 — 전송로(Bot API/MTProto) 공용. */
export function buildAlertMessages(firings: readonly AlertFiring[]): string[] {
    const byCode = new Map<string, AlertFiring[]>();
    for (const f of firings) {
        const list = byCode.get(f.code);
        if (list) list.push(f);
        else byCode.set(f.code, [f]);
    }
    return [...byCode.values()].map((group) => `🔔 ${group.map(formatFiring).join("\n")}`);
}
