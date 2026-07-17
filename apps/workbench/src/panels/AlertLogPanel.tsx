import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAlertLog, type AlertLogEntry, type AlertThemeContext, type AlertThemeMember, type LeafEvidence } from "../api/alerts.js";
import { kstTime } from "../lib/date.js";
import { LIVE_CADENCE_MS } from "../lib/liveCadence.js";
import { useWorkbench } from "../store/workbench.js";

// 근거 문구는 core 술어(predicateEvidence — 서버)가 채운다(4b 통합) — 그대로 렌더.
function renderEvidence(e: LeafEvidence): string {
    return e.text;
}

/** 배달 상태 배지 — sent 는 배지 없음(정상 배달), 나머지는 왜 텔레그램에 안 갔는지. */
const DELIVERY_BADGE: Record<string, { icon: string; title: string } | undefined> = {
    suppressed: { icon: "🔕", title: "쿨다운에 막혀 전송 안 됨(발화는 남음)" },
    logOnly: { icon: "📋", title: "로그 전용 규칙(텔레그램 안 감)" },
    blacklisted: { icon: "🚫", title: "당일 블랙리스트(텔레그램 차단)" },
};

// 알람 로그 패널 — 실시간 플레인. **발화 전부**를 시간순으로 누적한다(텔레그램으로 간 것 + 쿨다운에 막힌 것).
// 존재 이유: 텔레그램은 소음을 막으려 쿨다운으로 아끼지만, 알람을 듣고 PC 앞에 앉았을 땐 시장 전체를
// 봐야 한다 — 그 자리가 여기다. 서버는 발화를 억제하지 않고 전부 로그에 남긴다(억제는 배달 직전).
//
// 폴링은 **커서 증분**(seq) — 로그 5,000건을 5초마다 통째로 내리면 수 MB 라, 마지막으로 본 seq 초과분만
// 받아 클라가 누적한다. 서버 재시작이면 seq 가 0 부터 다시 → latestSeq < 커서 를 보고 리셋한다.
const LOG_KEY = ["live-alert-log"];
const CLIENT_MAX = 5_000; // 서버 보유분(LOG_MAX)과 동일 — 하루치(실측 <3,000)를 다 볼 수 있게. 상한은 폭주 방어용.

type Delivery = "all" | "sent" | "held";

const sign = (n: number): string => (n >= 0 ? "+" : "");

export function AlertLogPanel(): JSX.Element {
    const [entries, setEntries] = useState<AlertLogEntry[]>([]); // 최신이 앞
    const cursor = useRef(0);
    const [q, setQ] = useState("");
    const [theme, setTheme] = useState("");
    const [delivery, setDelivery] = useState<Delivery>("all");
    const setLiveCode = useWorkbench((s) => s.setLiveCode); // 로그 줄 클릭 → 실시간 포커스(차트·뉴스가 따라온다)

    const poll = useQuery({
        queryKey: LOG_KEY,
        refetchInterval: LIVE_CADENCE_MS,
        queryFn: async ({ signal }) => {
            const view = await fetchAlertLog(cursor.current, signal);
            if (view.latestSeq < cursor.current) {
                // 서버 재시작(seq 리셋) — 커서를 되돌려 다음 폴링이 전체를 다시 받게 한다.
                cursor.current = 0;
                setEntries([]);
                return view;
            }
            if (view.entries.length > 0) {
                cursor.current = view.latestSeq;
                setEntries((prev) => [...[...view.entries].reverse(), ...prev].slice(0, CLIENT_MAX));
            }
            return view;
        },
    });

    // 지금까지 본 테마 — 필터 셀렉트 옵션(서버가 발화마다 그 종목의 전체 테마를 실어준다).
    const themes = useMemo(() => [...new Set(entries.flatMap((e) => e.themes))].sort(), [entries]);

    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return entries.filter((e) => {
            if (delivery === "sent" && e.delivery !== "sent") return false;
            if (delivery === "held" && e.delivery === "sent") return false;
            if (theme && !e.themes.includes(theme)) return false;
            if (!needle) return true;
            return e.firing.code.includes(needle) || (e.firing.name ?? "").toLowerCase().includes(needle);
        });
    }, [entries, q, theme, delivery]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderBottom: "1px solid var(--border-default)", flexShrink: 0 }}>
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="종목 · 코드"
                    style={{ width: 96, fontSize: 11, padding: "2px 6px", color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "none", borderRadius: 4, outline: "none" }}
                />
                <select value={theme} onChange={(e) => setTheme(e.target.value)} style={selectStyle}>
                    <option value="">전체 테마</option>
                    {themes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <select value={delivery} onChange={(e) => setDelivery(e.target.value as Delivery)} style={selectStyle}>
                    <option value="all">전송·억제</option>
                    <option value="sent">전송된 것만</option>
                    <option value="held">억제된 것만</option>
                </select>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>
                    {shown.length !== entries.length ? `${shown.length}/${entries.length}` : entries.length}건
                </span>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
                {poll.isError && <Empty text={`로그를 못 읽음 — ${poll.error instanceof Error ? poll.error.message : "오류"}`} />}
                {!poll.isError && entries.length === 0 && <Empty text="아직 발화 없음 — 조건에 걸리면 여기 쌓입니다" />}
                {!poll.isError && entries.length > 0 && shown.length === 0 && <Empty text="필터에 걸리는 발화 없음" />}
                {shown.map((e) => (
                    <LogRow key={e.seq} entry={e} onPick={(code) => setLiveCode(code, "alert-log")} />
                ))}
            </div>
        </div>
    );
}

function Empty({ text }: { text: string }): JSX.Element {
    return <div style={{ padding: "14px 10px", fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>{text}</div>;
}

/** 발화 한 줄 — 시각·종목·시세 / 근거(왜 울렸는지) / 테마 미니 보드. 텔레그램 미배달분은 배지 + 흐리게. */
function LogRow({ entry, onPick }: { entry: AlertLogEntry; onPick: (code: string) => void }): JSX.Element {
    const { firing: f, delivery } = entry;
    const { price, changeRate } = f.features;
    const why = [...f.evidence.map(renderEvidence), ...(f.note ? [f.note] : [])].join(" · ");
    const badge = DELIVERY_BADGE[delivery];
    return (
        <div
            title={badge?.title ?? "텔레그램 전송됨"}
            style={{ padding: "4px 10px", borderBottom: "1px solid var(--border-subtle)", opacity: delivery === "sent" ? 1 : 0.55 }}
        >
            <div onClick={() => onPick(f.code)} style={{ display: "flex", gap: 6, fontSize: 11, alignItems: "baseline", cursor: "pointer" }}>
                <span className="tabular" style={{ flexShrink: 0, color: "var(--accent-primary)" }}>{kstTime(f.at)}</span>
                <span style={{ flexShrink: 0, fontWeight: 600, color: "var(--text-primary)" }}>{f.name || f.code}</span>
                <span className="tabular" style={{ flexShrink: 0, color: changeRate >= 0 ? "var(--rise)" : "var(--fall)" }}>
                    {price.toLocaleString("ko-KR")}원 {sign(changeRate)}{changeRate.toFixed(2)}%
                </span>
                {badge && <span style={{ flexShrink: 0, color: "var(--text-tertiary)" }}>{badge.icon}</span>}
                {entry.scope === "universe" && <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)" }}>탐지</span>}
            </div>
            {why && <div style={{ fontSize: 11, color: "var(--text-secondary)", paddingLeft: 2 }}>{why}</div>}
            {f.themeContext && <ThemeBoards ctx={f.themeContext} selfCode={f.code} onPick={onPick} />}
        </div>
    );
}

/** 테마 미니 보드 — 텔레그램보다 시각적으로 정리(색상·칩·클릭). 소속 테마 칩 + 펼친 테마별 멤버 표. */
function ThemeBoards({ ctx, selfCode, onPick }: { ctx: AlertThemeContext; selfCode: string; onPick: (code: string) => void }): JSX.Element {
    return (
        <div style={{ paddingLeft: 2, marginTop: 2 }}>
            {ctx.chips.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {ctx.chips.map((t) => (
                        <span key={t} style={chip("var(--text-tertiary)")}>{t}</span>
                    ))}
                </div>
            )}
            {ctx.boards.map((board) => (
                <div key={board.theme} style={{ marginTop: 3 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)" }}>{board.theme} · UN</div>
                    {board.members.map((m) => (
                        <MemberRow key={m.code} m={m} highlight={m.code === selfCode} onPick={onPick} />
                    ))}
                </div>
            ))}
        </div>
    );
}

function MemberRow({ m, highlight, onPick }: { m: AlertThemeMember; highlight: boolean; onPick: (code: string) => void }): JSX.Element {
    const pct = (n: number | null): string => (n == null ? "-" : `${sign(n)}${n.toFixed(1)}%`);
    return (
        <div
            onClick={() => onPick(m.code)}
            style={{
                display: "flex", gap: 5, alignItems: "baseline", fontSize: 11, padding: "1px 4px", cursor: "pointer",
                background: highlight ? "var(--bg-tertiary)" : undefined, borderRadius: 3,
            }}
        >
            <span className="tabular" style={{ flexShrink: 0, width: 16, textAlign: "right", color: "var(--text-tertiary)" }}>{m.rank}</span>
            <span style={{ flexShrink: 0, fontWeight: highlight ? 700 : 500, color: "var(--text-primary)" }}>{m.name}</span>
            <span className="tabular" style={{ flexShrink: 0, color: (m.rateUn ?? 0) >= 0 ? "var(--rise)" : "var(--fall)" }}>
                {pct(m.rateUn)}
                {m.rateKrx != null && <span style={{ color: "var(--text-tertiary)" }}>({pct(m.rateKrx)})</span>}
            </span>
            <span className="tabular" style={{ flexShrink: 0, color: "var(--text-tertiary)" }}>{Math.round(m.tradeValue / 100).toLocaleString("ko-KR")}억</span>
            <span style={{ display: "flex", gap: 3, flexWrap: "wrap", minWidth: 0 }}>
                {m.themes.slice(0, 4).map((t) => (
                    <span key={t} style={chip("var(--text-tertiary)")}>{t}</span>
                ))}
            </span>
        </div>
    );
}

const chip = (color: string): React.CSSProperties => ({ fontSize: 10, color, background: "var(--bg-tertiary)", borderRadius: 3, padding: "0 4px", flexShrink: 0 });

const selectStyle: React.CSSProperties = {
    fontSize: 11,
    padding: "2px 4px",
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "none",
    borderRadius: 4,
    outline: "none",
};
