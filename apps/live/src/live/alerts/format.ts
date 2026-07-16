// 발화 → 사람이 읽는 형태. 서버 로그(한 줄)와 알림 메시지(구조체)가 같은 스칼라 포맷을 쓴다(드리프트 방지).
// 지연 배달 표기(⏰)는 여기가 아니라 NotifyQueue 가 붙인다 — 적재 시점엔 지연 여부를 알 수 없고,
// 배달 시점에만 알 수 있기 때문(메시지는 적재 시점에 만들어진다).
import type { NotifyMessage } from "./message.js";
import type { AlertFiring, AlertMarket, LeafEvidence, PriceLeaf, RankLeaf } from "./types.js";

const sign = (n: number): string => (n >= 0 ? "+" : "");
const won = (n: number): string => `${n.toLocaleString("ko-KR")}원`;
const marketLabel = (m: AlertMarket): string => (m === "krx" ? "KRX" : "UN");

export function kstTime(ms: number): string {
    return new Date(ms).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

// ── leaf 근거 문구 — 발화 메시지·워크벤치 로그의 단일 출처(계약은 wire LeafEvidence). ──
// 값은 엔진이 판정하며 실측한 것을 넘긴다(여기서 다시 재지 않는다 — 판정과 표시가 어긋나지 않게).

/** `12,000원 ≥ 11,500원` */
export function priceEvidence(leaf: PriceLeaf, price: number): LeafEvidence {
    return { kind: "price", text: `${won(price)} ${leaf.op === "gte" ? "≥" : "≤"} ${won(leaf.value)}` };
}

/**
 * 순위 근거 — 앞 = 실측 순위 변화, 괄호 = 그 leaf 의 조건. 가격 근거(실측 ≥ 임계)와 같은 구조.
 *   7→3 reach:  `반도체 UN 7위→3위 (3위 이내)`
 *   3 유지:     `반도체 UN 3위 유지 (3위 이내)`   ← "도달"이라 안 함(계속 3위였는데 가격이 돌파해 발화한 경우 오해 방지)
 *   이력 없음:  `반도체 UN 3위 (3위 이내)`          ← past 없으면 변화 표기만 빠짐(undefined 인쇄 안 됨)
 *   delta:      `반도체 UN 7위→3위 (3계단↑)`
 * past 는 표시용 — reach 판정엔 안 쓰고, delta 는 판정에 필수라 여기 오면 항상 존재(엔진이 결손 시 미결로 스킵).
 */
export function rankEvidence(leaf: RankLeaf, rank: number, past: number | undefined): LeafEvidence {
    const head = `${leaf.theme} ${marketLabel(leaf.market)}`;
    const move = past == null ? `${rank}위` : past === rank ? `${rank}위 유지` : `${past}위→${rank}위`;
    const cond = leaf.mode === "reach" ? `${leaf.threshold}위 이내` : `${leaf.threshold}계단↑`;
    return { kind: "rank", text: `${head} ${move} (${cond})` };
}

/** 발화 시점 스칼라 한 조각: `71,000원 +2.10%`. 로그·메시지 공용. */
function scalars(f: AlertFiring): string {
    const { price, changeRate } = f.features;
    return `${price.toLocaleString("ko-KR")}원 ${sign(changeRate)}${changeRate.toFixed(2)}%`;
}

/** 그 발화가 왜 났는지 — 근거들 + 메모. 없으면 빈 문자열. */
function reasons(f: AlertFiring): string {
    const parts = f.evidence.map((e) => e.text);
    if (f.note) parts.push(f.note);
    return parts.join(" · ");
}

/** 한 발화의 요약 한 줄 — 서버 로그용(종목 · 현재가 · 등락률 · 근거 · 메모). */
export function formatFiring(f: AlertFiring): string {
    const parts = [`${f.name || f.code}(${f.code})`, scalars(f)];
    const why = reasons(f);
    if (why) parts.push(why);
    return parts.join(" · ");
}

/**
 * 한 배치(한 틱) 발화 → 종목당 1메시지. 같은 종목의 여러 조건은 조건당 한 줄로 붙는다
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
        for (const f of group) {
            const why = reasons(f);
            if (why) msg.blocks.push({ kind: "text", text: `· ${why}` });
        }
        return msg;
    });
}
