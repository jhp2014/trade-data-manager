// 테마 궤적 [실시간] — 골격 패널의 테마 오버레이 문법(무채색 선 + 거래대금 굵기)을 **장중에** 본다.
//
// 데이터 = apps/live 테이프(3초 틱을 분당 1점으로 접은 하루치, 편입 이전은 분봉 백필 머리).
// 결손 문법(사용자 확정): 선이 끊긴 자리는 조건 이탈의 기록(그것도 정보), 전역 틱이 없던 분은
// 회색 세로띠(기계 결손 — 서버 재시작·WS 끊김). 라벨 우클릭 = 수동 메우기(그 종목만 분봉 재조회).
//
// y = 절대 등락률(%·기준가 UN — 복기와 같은 잣대), x = 벽시계. 팬·줌 없음 — 장중 상황판이라
// 항상 하루 전체가 보인다(자세한 복기는 장 마감 후 골격 패널의 몫).
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { backfillTape } from "../../api/liveTape.js";
import { tapeThemesQuery } from "../../api/queries.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { usePlaneBus } from "../../store/usePlaneBus.js";
import { ScrollRow, TextToggle } from "../../components/ControlChrome.js";
import { CanvasLayers } from "../skeleton/CanvasPainter.js";
import { layoutReadoutRows } from "../skeleton/readout.js";
import { machineGaps } from "./tapeData.js";
import { tapeLayers, type Scales } from "./tapeLayers.js";
import { useTape } from "./useTape.js";

const PAD = { left: 8, right: 118, top: 8, bottom: 20 }; // 오른쪽 = 이름 거터(DOM 라벨, 클릭 표면)
const LABEL_GAP = 14;
const SESSION_START = 9 * 60; // 회색띠·화면 시작의 기본 하한(데이터가 더 이르면 그쪽을 따른다 — NXT 프리마켓)

export function LiveTapePanel({ panelId }: { panelId: string }): JSX.Element {
    const { code } = usePlaneBus("live");
    // 포커스 종목의 테마 칩 — 옵션(폴링 주기·enabled)은 queries.ts 한 곳.
    const themesQ = useQuery(tapeThemesQuery(code));
    const chips = useMemo(() => themesQ.data?.themes ?? [], [themesQ.data]);

    // 선택 테마 — 패널별 영속. 칩에 없으면(포커스가 다른 종목으로) 첫 칩으로 자동 이동.
    const [picked, setPicked] = usePanelUi<string>(panelId, "theme", "");
    const theme = chips.includes(picked) ? picked : (chips[0] ?? "");
    const [amountWidthOn, setAmountWidthOn] = usePanelUi(panelId, "amountWidth", true);

    const { data, error } = useTape(theme || null);
    const [hovered, setHovered] = useState<string | null>(null);
    useEffect(() => setHovered(null), [theme]);

    // ── 상자 측정
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver((es) => setSize({ w: es[0].contentRect.width, h: es[0].contentRect.height }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const box = { left: PAD.left, top: PAD.top, width: Math.max(0, size.w - PAD.left - PAD.right), height: Math.max(0, size.h - PAD.top - PAD.bottom) };

    // ── 프레임(값 공간) — x 는 세션 시작~지금(마지막 틱), y 는 데이터 맞춤(0% 포함).
    const stocks = useMemo(() => (data ? [...data.stocks.values()] : []), [data]);
    const frame = useMemo(() => {
        let dataMin = Infinity;
        let dataMax = -Infinity;
        let lo = Infinity;
        let hi = -Infinity;
        for (const st of stocks) {
            if (st.minutes.length > 0) {
                dataMin = Math.min(dataMin, st.minutes[0]);
                dataMax = Math.max(dataMax, st.minutes[st.minutes.length - 1]);
            }
            for (const r of st.rate) {
                if (r < lo) lo = r;
                if (r > hi) hi = r;
            }
        }
        const lastTick = data && data.ticks.length > 0 ? data.ticks[data.ticks.length - 1] : -1;
        const fromMinute = Math.min(SESSION_START, dataMin === Infinity ? SESSION_START : dataMin);
        const toMinute = Math.max(fromMinute + 60, dataMax === -Infinity ? 0 : dataMax, lastTick) + 3;
        // y 는 0% 를 항상 포함(등락의 축) + 여유 8%
        if (lo === Infinity) [lo, hi] = [-3, 3];
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
        const padY = Math.max((hi - lo) * 0.08, 0.5);
        return { fromMinute, toMinute, minRate: lo - padY, maxRate: hi + padY, lastTick };
    }, [stocks, data]);

    const scales = useMemo<Scales>(() => {
        const sx = (m: number): number => box.left + ((m - frame.fromMinute) / (frame.toMinute - frame.fromMinute)) * box.width;
        const sy = (r: number): number => box.top + ((frame.maxRate - r) / (frame.maxRate - frame.minRate)) * box.height;
        return { x: sx, y: sy };
    }, [frame, box.left, box.top, box.width, box.height]);

    // ── 회색띠(기계 결손) — 세션 시작~마지막 틱에서 틱이 없던 연속 분들. 마지막 틱 뒤는 미래지 결손이 아니다.
    const gaps = useMemo(
        () => (data && frame.lastTick >= 0 ? machineGaps(data.ticks, frame.fromMinute, frame.lastTick) : []),
        [data, frame.fromMinute, frame.lastTick],
    );

    const layers = useMemo(
        () => tapeLayers(gaps, frame, box, { stocks, focusCode: code, hovered, amountWidthOn, scales }),
        [gaps, frame, box.left, box.top, box.width, box.height, stocks, code, hovered, amountWidthOn, scales], // eslint-disable-line react-hooks/exhaustive-deps
    );

    // ── 이름 거터(DOM — 클릭 표면): 선 끝값 순으로 세로 벌림. 우클릭 = 수동 메우기.
    const labels = useMemo(() => {
        const rows = stocks
            .map((st) => {
                const last = st.minutes.length - 1;
                return last < 0 ? null : { st, y: scales.y(st.rate[last]), endRate: st.rate[last] };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
            .sort((a, b) => a.y - b.y)
            .map((r) => ({ item: r, y: r.y }));
        return layoutReadoutRows(rows, { min: box.top + 6, max: box.top + box.height - 6 }, LABEL_GAP);
    }, [stocks, scales, box.top, box.height]);

    const drawable = size.w > 0 && size.h > 0 && box.width > 0 && box.height > 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            <ScrollRow gap={6} style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>
                {chips.length === 0 && (
                    themesQ.isError
                        // 조회 실패를 "미배정"으로 둔갑시키지 않는다 — 검증 400·서버 다운은 별개 상태.
                        ? <span style={{ fontSize: 12, color: "var(--rise)" }}>{`테마 조회 오류: ${(themesQ.error as Error).message}`}</span>
                        : <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{code ? `${code} 테마 없음(시트 미배정)` : "종목을 선택하세요"}</span>
                )}
                {chips.map((t) => (
                    <button
                        key={t}
                        onClick={() => setPicked(t)}
                        style={{
                            fontSize: 12,
                            padding: "1px 8px",
                            borderRadius: 10,
                            border: `1px solid ${t === theme ? "var(--plane-live)" : "var(--border-default)"}`,
                            color: t === theme ? "var(--plane-live)" : "var(--text-secondary)",
                            background: t === theme ? "var(--plane-live-soft)" : "transparent",
                            flexShrink: 0,
                        }}
                    >
                        {t}
                    </button>
                ))}
                <span style={{ flex: 1 }} />
                {data && data.pending.length > 0 && (
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }} title={data.pending.join(", ")}>기준가 대기 {data.pending.length}</span>
                )}
                <TextToggle active={amountWidthOn} onClick={() => setAmountWidthOn((v) => !v)} title="선 굵기 = 분당 거래대금">굵기</TextToggle>
            </ScrollRow>

            <div ref={wrapRef} style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
                {theme === "" ? null : error ? (
                    <Center text={`오류 — 재시도 중… (${error})`} />
                ) : !data ? (
                    <Center text="테이프 로딩중…" />
                ) : stocks.length === 0 ? (
                    <Center text="테이프 비어 있음 — 이 테마 멤버가 아직 유니버스에 안 들었다" />
                ) : null}
                {drawable && data && stocks.length > 0 && (
                    <>
                        <CanvasLayers layers={layers} width={size.w} height={size.h} clip={null} />
                        {labels.map(({ item, labelY, off }) => {
                            const st = item.st;
                            const isFocus = st.code === code;
                            return (
                                <div
                                    key={st.code}
                                    onMouseEnter={() => setHovered(st.code)}
                                    onMouseLeave={() => setHovered((h) => (h === st.code ? null : h))}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        void backfillTape(st.code).catch(() => {}); // 다음 폴(rev 증가)에서 풀로 실려 온다
                                    }}
                                    title={`${st.name} ${item.endRate >= 0 ? "+" : ""}${item.endRate.toFixed(1)}%${st.watched ? " · 모니터링(이탈해도 폴링 지속)" : ""} — 우클릭: 구멍 메우기(분봉 재조회)`}
                                    style={{
                                        position: "absolute",
                                        left: box.left + box.width + 4,
                                        top: labelY - 8,
                                        maxWidth: PAD.right - 8,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        fontSize: 11,
                                        lineHeight: "16px",
                                        cursor: "default",
                                        color: isFocus ? "var(--plane-live)" : hovered === st.code ? "var(--text-primary)" : "var(--text-secondary)",
                                        fontWeight: isFocus || hovered === st.code ? 600 : 400,
                                    }}
                                >
                                    {off === "up" ? "▲ " : off === "down" ? "▼ " : ""}
                                    {st.watched ? "★" : ""}
                                    {st.name}
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
}

function Center({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            {text}
        </div>
    );
}
