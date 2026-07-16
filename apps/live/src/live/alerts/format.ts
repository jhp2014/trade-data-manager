// 발화 → 사람이 읽는 형태. 서버 로그(한 줄)와 알림 메시지(구조체)가 같은 스칼라 포맷을 쓴다(드리프트 방지).
// 지연 배달 표기(⏰)는 여기가 아니라 NotifyQueue 가 붙인다 — 적재 시점엔 지연 여부를 알 수 없고,
// 배달 시점에만 알 수 있기 때문(메시지는 적재 시점에 만들어진다).
import type { MessageBlock, NotifyMessage } from "./message.js";
import type { AlertFiring, AlertMarket, AlertThemeContext, AlertThemeMember, LeafEvidence } from "./types.js";

const TELEGRAM_MEMBER_CUT = 5; // 텔레그램 테마당 상위 N — 워크벤치는 전부(구조엔 전 멤버가 있고 컷은 렌더 결정)

const sign = (n: number): string => (n >= 0 ? "+" : "");
const won = (n: number): string => `${n.toLocaleString("ko-KR")}원`;
const marketLabel = (m: AlertMarket): string => (m === "krx" ? "KRX" : "UN");
const pct = (n: number | null): string => (n == null ? "-" : `${sign(n)}${n.toFixed(1)}%`);
/** 백만원 → 억 표기(거래대금). */
const eok = (tvMillion: number): string => `${Math.round(tvMillion / 100).toLocaleString("ko-KR")}억`;

export function kstTime(ms: number): string {
    return new Date(ms).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

// ── 구조화 근거·테마 컨텍스트 → 텔레그램/로그 문구 렌더 ──
// 계약(wire)은 구조를 싣고, 여기(서버)가 텔레그램 텍스트로 flatten 한다. 워크벤치는 자기 렌더를 갖는다
// (같은 문구 재현이 아니라 매체별 뷰라 드리프트 개념이 없다).

/**
 * 순위 근거 — 앞 = 실측 순위 변화, 괄호 = 조건. 가격 근거(실측 ≥ 임계)와 같은 구조.
 *   7→3 reach:  `반도체 UN 7위→3위 (3위 이내)` / 3 유지: `3위 유지` / 이력 없음: `3위`
 *   delta:      `반도체 UN 7위→3위 (3계단↑)`
 * "도달"이라 안 하는 이유: 계속 3위였는데 다른 leaf(가격 돌파)로 발화한 경우 순위가 방금 오른 걸로 오해.
 */
export function renderEvidence(e: LeafEvidence): string {
    if (e.kind === "pred") return e.text; // 유니버스 술어 — core predicateEvidence 가 이미 문구화
    if (e.kind === "price") return `${won(e.price)} ${e.op === "gte" ? "≥" : "≤"} ${won(e.value)}`;
    const head = `${e.theme} ${marketLabel(e.market)}`;
    const move = e.past == null ? `${e.rank}위` : e.past === e.rank ? `${e.rank}위 유지` : `${e.past}위→${e.rank}위`;
    const cond = e.mode === "reach" ? `${e.threshold}위 이내` : `${e.threshold}계단↑`;
    return `${head} ${move} (${cond})`;
}

/** 멤버 한 줄(텔레그램 고정폭) — `3. 삼성전자 ← +2.1%(+1.8%) 1,203억`. 화살표=발화 종목 자신. */
function memberLine(m: AlertThemeMember): string {
    const self = m.isSelf ? " ←" : "";
    const krx = m.rateKrx != null ? `(${pct(m.rateKrx)})` : "";
    return `${m.rank}. ${m.name}${self} ${pct(m.rateUn)}${krx} ${eok(m.tradeValue)}`;
}

/** 테마 컨텍스트 → 텔레그램 블록들. 칩 한 줄 + 보드마다 헤더+상위 N(+"외 M종목"). 빈 컨텍스트면 없음. */
export function themeContextBlocks(ctx: AlertThemeContext): MessageBlock[] {
    const blocks: MessageBlock[] = [];
    if (ctx.chips.length > 0) blocks.push({ kind: "text", text: `테마: ${ctx.chips.join(" · ")}` });
    for (const board of ctx.boards) {
        const shown = board.members.slice(0, TELEGRAM_MEMBER_CUT);
        const rest = board.members.length - shown.length;
        const lines = shown.map(memberLine);
        if (rest > 0) lines.push(`… 외 ${rest}종목`);
        blocks.push({ kind: "pre", text: `[${board.theme} UN]\n${lines.join("\n")}` });
    }
    return blocks;
}

/** 발화 시점 스칼라 한 조각: `71,000원 +2.10%`. 로그·메시지 공용. */
function scalars(f: AlertFiring): string {
    const { price, changeRate } = f.features;
    return `${price.toLocaleString("ko-KR")}원 ${sign(changeRate)}${changeRate.toFixed(2)}%`;
}

/** 그 발화가 왜 났는지 — 근거들 + 메모. 없으면 빈 문자열. */
function reasons(f: AlertFiring): string {
    const parts = f.evidence.map(renderEvidence);
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
        // 테마 상황 — 같은 종목이라 그룹 전체가 같은 컨텍스트(head 것). 즉시 데이터라 발화 메시지에 인라인.
        if (head.themeContext) msg.blocks.push(...themeContextBlocks(head.themeContext));
        return msg;
    });
}
