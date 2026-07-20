import { useEffect, useMemo, useRef, useState } from "react";
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
const FLOOR_KEY = "wb.alertLog.floor"; // 시간 바닥(ms) — remount·재접속 넘어 유지. 하드 바닥은 항상 오늘 자정.

type Delivery = "all" | "sent" | "held";

const sign = (n: number): string => (n >= 0 ? "+" : "");

// 오늘(KST) 자정의 epoch ms — 로그의 하드 바닥. 어제 것은 여기서 아래로 잘려 화면·클라 메모리에서 빠진다.
function kstMidnight(): number {
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
    return new Date(`${day}T00:00:00+09:00`).getTime();
}
// ms → 오늘 KST "HH:mm" (시간 입력값). 자정이면 "00:00".
function kstHHmm(ms: number): string {
    return new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
}
// "HH:mm" → 오늘 KST 해당 시각의 epoch ms(빈 값이면 자정=전체).
function floorFromHHmm(hhmm: string): number {
    if (!hhmm) return kstMidnight();
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    const t = new Date(`${day}T${hhmm}:00+09:00`).getTime();
    return Number.isNaN(t) ? kstMidnight() : t;
}

export function AlertLogPanel(): JSX.Element {
    const [entries, setEntries] = useState<AlertLogEntry[]>([]); // 최신이 앞
    const cursor = useRef(0);
    const [q, setQ] = useState("");
    const [theme, setTheme] = useState("");
    const [delivery, setDelivery] = useState<Delivery>("all");
    const [floor, setFloorState] = useState(() => {
        const n = Number(localStorage.getItem(FLOOR_KEY));
        return Number.isFinite(n) ? n : 0;
    });
    const setFloor = (ms: number): void => {
        setFloorState(ms);
        localStorage.setItem(FLOOR_KEY, String(ms));
    };
    const headerRef = useRef<HTMLDivElement>(null);
    const setLiveCode = useWorkbench((s) => s.setLiveCode); // 로그 줄 클릭 → 실시간 포커스(차트·뉴스가 따라온다)

    // 헤더 가로 스크롤 — 세로 휠을 가로 이동으로(폭 좁을 때). passive:false 라야 preventDefault 로 페이지 스크롤을 막는다.
    useEffect(() => {
        const el = headerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent): void => {
            if (el.scrollWidth <= el.clientWidth || e.deltaY === 0) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

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
                // 오늘(KST) 것만 보유 — 어제 것은 화면뿐 아니라 클라 메모리에서도 뺀다(어제 저장 안 함).
                const midnight = kstMidnight();
                setEntries((prev) =>
                    [...[...view.entries].reverse(), ...prev].filter((e) => e.firing.at >= midnight).slice(0, CLIENT_MAX),
                );
            }
            return view;
        },
    });

    // 지금까지 본 테마 — 필터 셀렉트 옵션(서버가 발화마다 그 종목의 전체 테마를 실어준다).
    const themes = useMemo(() => [...new Set(entries.flatMap((e) => e.themes))].sort(), [entries]);

    // 실효 바닥 = max(사용자 floor, 오늘 자정) — 어제로는 못 내려간다. 폴링마다 재평가돼 자정 넘어가면 자동 리셋.
    const effFloor = Math.max(floor, kstMidnight());

    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return entries.filter((e) => {
            if (e.firing.at < effFloor) return false;
            if (delivery === "sent" && e.delivery !== "sent") return false;
            if (delivery === "held" && e.delivery === "sent") return false;
            if (theme && !e.themes.includes(theme)) return false;
            if (!needle) return true;
            return e.firing.code.includes(needle) || (e.firing.name ?? "").toLowerCase().includes(needle);
        });
    }, [entries, q, theme, delivery, effFloor]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderBottom: "1px solid var(--border-default)", flexShrink: 0 }}>
                {/* 가로 스크롤 대상 = 컨트롤들만. 건수는 이 바깥 우측 고정. */}
                <div ref={headerRef} className="no-scrollbar" style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", flexWrap: "nowrap", flex: 1, minWidth: 0 }}>
                    <FloorControl effFloor={effFloor} midnight={kstMidnight()} onSet={setFloor} />
                    <select value={theme} onChange={(e) => setTheme(e.target.value)} style={selectStyle}>
                        <option value="">전체 테마</option>
                        {themes.map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="종목 · 코드"
                        style={{ flexShrink: 0, width: 96, fontSize: 11, padding: "2px 6px", color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "none", borderRadius: 4, outline: "none" }}
                    />
                    <select value={delivery} onChange={(e) => setDelivery(e.target.value as Delivery)} style={selectStyle}>
                        <option value="all">전송·억제</option>
                        <option value="sent">전송된 것만</option>
                        <option value="held">억제된 것만</option>
                    </select>
                </div>
                <span style={{ flexShrink: 0, fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
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

/** 발화 한 줄 — 시각·종목·등락률 / 근거(왜 울렸는지) / 테마 미니 보드.
 *  배달 구분은 흐리게(가독성↓) 대신 **시각 색**으로: 전송=teal, 억제=amber + 배지. 줄 자체는 항상 또렷하게. */
function LogRow({ entry, onPick }: { entry: AlertLogEntry; onPick: (code: string) => void }): JSX.Element {
    const { firing: f, delivery } = entry;
    const { changeRate } = f.features;
    const why = [...f.evidence.map(renderEvidence), ...(f.note ? [f.note] : [])].join(" · ");
    const badge = DELIVERY_BADGE[delivery];
    const sent = delivery === "sent";
    return (
        <div style={{ padding: "4px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
            <div onClick={() => onPick(f.code)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span
                        className="tabular"
                        title={badge?.title ?? "텔레그램 전송됨"}
                        style={{ fontSize: 14, fontWeight: 700, color: sent ? "var(--accent-primary)" : "var(--warning)" }}
                    >
                        {kstTime(f.at)}
                    </span>
                    {badge && <span title={badge.title} style={{ fontSize: 12 }}>{badge.icon}</span>}
                </div>
                <div style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: 12, marginTop: 1 }}>
                    <span style={{ flexShrink: 0, fontWeight: 600, color: "var(--text-primary)" }}>{f.name || f.code}</span>
                    <span className="tabular" style={{ flexShrink: 0, color: changeRate >= 0 ? "var(--rise)" : "var(--fall)" }}>
                        {sign(changeRate)}{changeRate.toFixed(2)}%
                    </span>
                </div>
            </div>
            {why && <div style={{ fontSize: 11, color: "var(--text-secondary)", paddingLeft: 2, marginTop: 1 }}>{why}</div>}
            {f.themeContext && <ThemeBoards ctx={f.themeContext} selfCode={f.code} onPick={onPick} />}
        </div>
    );
}

/** 테마 미니 보드 — 소속 테마별 **자기 순위 칩**(보드 펼치기 없이 순위 노출) + 전체 멤버 표는 접힘(토글).
 *  순위 칩: board 있는 테마는 accent 칩 `테마 3/12`(순위/멤버수), board 없는(멤버 임계 미달) 테마는 회색 칩. */
function ThemeBoards({ ctx, selfCode, onPick }: { ctx: AlertThemeContext; selfCode: string; onPick: (code: string) => void }): JSX.Element {
    const [open, setOpen] = useState(false);
    // 테마 → 자기 순위/멤버수 (board 에서 isSelf 멤버로 도출) — chip-only 테마는 없음.
    const rankByTheme = useMemo(() => {
        const map = new Map<string, { rank: number; total: number }>();
        for (const b of ctx.boards) {
            const self = b.members.find((m) => m.isSelf);
            if (self) map.set(b.theme, { rank: self.rank, total: b.members.length });
        }
        return map;
    }, [ctx.boards]);
    return (
        <div style={{ paddingLeft: 2, marginTop: 2 }}>
            {(ctx.chips.length > 0 || ctx.boards.length > 0) && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "baseline" }}>
                    {ctx.chips.map((t) => {
                        const r = rankByTheme.get(t);
                        return r ? (
                            <span key={t} style={rankChip}>
                                {t} <span style={{ fontWeight: 700 }}>{r.rank}</span>/{r.total}
                            </span>
                        ) : (
                            <span key={t} style={chip("var(--text-tertiary)")}>{t}</span>
                        );
                    })}
                    {ctx.boards.length > 0 && (
                        <span
                            onClick={() => setOpen((v) => !v)}
                            title={open ? "테마보드 접기" : "테마보드 펼치기"}
                            style={{ fontSize: 10, color: "var(--text-tertiary)", cursor: "pointer", userSelect: "none" }}
                        >
                            {open ? "▾" : "▸"} 테마보드 {ctx.boards.length}
                        </span>
                    )}
                </div>
            )}
            {open && ctx.boards.map((board) => (
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

/** 순위 칩 — 자기 종목의 그 테마 내 UN 순위(accent). 순위 숫자는 <b>로 강조. */
const rankChip: React.CSSProperties = { fontSize: 11, color: "var(--accent-primary)", background: "var(--accent-soft)", borderRadius: 3, padding: "0 5px", flexShrink: 0 };

const selectStyle: React.CSSProperties = {
    flexShrink: 0,
    fontSize: 11,
    padding: "2px 4px",
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "none",
    borderRadius: 4,
    outline: "none",
};

const btnStyle: React.CSSProperties = { ...selectStyle, padding: "2px 7px", cursor: "pointer", whiteSpace: "nowrap" };

// "HH:mm"·"H:mm"·"HHmm" → 오늘 KST 해당 시각 ms. 범위 밖/파싱 실패는 null(무시).
function parseHHmm(s: string): number | null {
    const m = s.trim().match(/^(\d{1,2}):?(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return floorFromHHmm(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
}

/** 시간 floor — 평소엔 시각만 표시("09:41"/"전체"). 클릭하면 팝오버: [지금][전체] + 직접 입력(24h HH:mm).
 *  팝오버는 헤더의 overflow 클리핑을 피해 fixed 로 띄운다(백드롭 클릭·Esc 로 닫힘). */
function FloorControl({ effFloor, midnight, onSet }: { effFloor: number; midnight: number; onSet: (ms: number) => void }): JSX.Element {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [pos, setPos] = useState({ left: 0, top: 0 });
    const anchorRef = useRef<HTMLSpanElement>(null);
    const label = effFloor <= midnight ? "전체" : kstHHmm(effFloor);

    const openPop = (): void => {
        const r = anchorRef.current?.getBoundingClientRect();
        if (r) setPos({ left: r.left, top: r.bottom + 4 });
        setDraft(effFloor <= midnight ? "" : kstHHmm(effFloor));
        setOpen(true);
    };
    const apply = (ms: number): void => {
        onSet(ms);
        setOpen(false);
    };
    const commitDraft = (): void => {
        const ms = parseHHmm(draft);
        if (ms != null) onSet(ms);
        setOpen(false);
    };

    return (
        <>
            <span
                ref={anchorRef}
                onClick={() => (open ? setOpen(false) : openPop())}
                title="클릭 — 지금/전체/직접 입력(24h HH:mm)"
                style={{ flexShrink: 0, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--bg-tertiary)", color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}
            >
                {label}
            </span>
            {open && (
                <>
                    <div onMouseDown={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
                    <div
                        style={{
                            position: "fixed", left: pos.left, top: pos.top, zIndex: 51,
                            display: "flex", gap: 4, alignItems: "center", padding: 6,
                            background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 6,
                            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                        }}
                    >
                        <button type="button" onClick={() => apply(Date.now())} title="지금 이후만 — 화면 비우기" style={btnStyle}>지금</button>
                        <button type="button" onClick={() => apply(0)} title="오늘 전체 표시" style={btnStyle}>전체</button>
                        <input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commitDraft();
                                else if (e.key === "Escape") setOpen(false);
                            }}
                            placeholder="09:41"
                            style={{ ...selectStyle, width: 52, textAlign: "center" }}
                        />
                    </div>
                </>
            )}
        </>
    );
}
