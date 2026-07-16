import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAlertLog, type AlertLogEntry } from "../api/alerts.js";
import { kstTime } from "../lib/date.js";
import { useWorkbench } from "../store/workbench.js";

// 알람 로그 패널 — 실시간 플레인. **발화 전부**를 시간순으로 누적한다(텔레그램으로 간 것 + 쿨다운에 막힌 것).
// 존재 이유: 텔레그램은 소음을 막으려 쿨다운으로 아끼지만, 알람을 듣고 PC 앞에 앉았을 땐 시장 전체를
// 봐야 한다 — 그 자리가 여기다. 서버는 발화를 억제하지 않고 전부 로그에 남긴다(억제는 배달 직전).
//
// 폴링은 **커서 증분**(seq) — 로그 5,000건을 5초마다 통째로 내리면 수 MB 라, 마지막으로 본 seq 초과분만
// 받아 클라가 누적한다. 서버 재시작이면 seq 가 0 부터 다시 → latestSeq < 커서 를 보고 리셋한다.
const LOG_KEY = ["live-alert-log"];
const CLIENT_MAX = 2_000; // 화면 누적 상한(서버는 5,000) — DOM·메모리 방어

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
        refetchInterval: 5_000,
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
            if (delivery === "sent" && !e.notified) return false;
            if (delivery === "held" && e.notified) return false;
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
                    <LogRow key={e.seq} entry={e} onPick={() => setLiveCode(e.firing.code, "alert-log")} />
                ))}
            </div>
        </div>
    );
}

function Empty({ text }: { text: string }): JSX.Element {
    return <div style={{ padding: "14px 10px", fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>{text}</div>;
}

/** 발화 한 줄 — 시각·종목·시세 / 근거(왜 울렸는지) / 테마. 억제분은 🔕 + 흐리게. */
function LogRow({ entry, onPick }: { entry: AlertLogEntry; onPick: () => void }): JSX.Element {
    const { firing: f, notified, themes } = entry;
    const { price, changeRate } = f.features;
    const why = [...f.evidence.map((ev) => ev.text), ...(f.note ? [f.note] : [])].join(" · ");
    return (
        <div
            onClick={onPick}
            title={notified ? "텔레그램 전송됨" : "쿨다운에 막혀 전송 안 됨(발화는 남음)"}
            style={{ padding: "4px 10px", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer", opacity: notified ? 1 : 0.55 }}
        >
            <div style={{ display: "flex", gap: 6, fontSize: 11, alignItems: "baseline" }}>
                <span className="tabular" style={{ flexShrink: 0, color: "var(--accent-primary)" }}>{kstTime(f.at)}</span>
                <span style={{ flexShrink: 0, fontWeight: 600, color: "var(--text-primary)" }}>{f.name || f.code}</span>
                <span className="tabular" style={{ flexShrink: 0, color: changeRate >= 0 ? "var(--rise)" : "var(--fall)" }}>
                    {price.toLocaleString("ko-KR")}원 {sign(changeRate)}{changeRate.toFixed(2)}%
                </span>
                {!notified && <span style={{ flexShrink: 0, color: "var(--text-tertiary)" }}>🔕</span>}
                {entry.scope === "universe" && <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)" }}>탐지</span>}
            </div>
            {why && <div style={{ fontSize: 11, color: "var(--text-secondary)", paddingLeft: 2 }}>{why}</div>}
            {themes.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 2, marginTop: 1 }}>
                    {themes.map((t) => (
                        <span key={t} style={{ fontSize: 10, color: "var(--text-tertiary)", background: "var(--bg-tertiary)", borderRadius: 3, padding: "0 4px" }}>{t}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

const selectStyle: React.CSSProperties = {
    fontSize: 11,
    padding: "2px 4px",
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "none",
    borderRadius: 4,
    outline: "none",
};
