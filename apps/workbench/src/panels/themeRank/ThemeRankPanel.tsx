// 테마 순위 패널 — **연동 거울**: 순위 평면(x=거래대금 서수·y=등락률 서수)에 그날 유니버스를 점으로
// 세우고, 시선 종목의 테마 동료를 켠 채 시각 스크럽으로 테마 상황을 탐색한다.
//
// 조건을 **만드는** 손은 여기 없다(행은 집합 편성 보드의 ＋ 조건이 낳는다). 대신 이 패널이 테마 조건의
// **유일한 편집면**이다(2026-08-29 재편) — 보드 행은 요약 줄·정산·순서만 진다. 행 하나(themeLink)를
// 비추고, 존 컷선 드래그는 그 행의 N/M 을(커밋 = 손 뗄 때 한 번, Rail 규약), 손잡이 줄
// (ThemeParamControls)은 나머지 파라미터를 직접 고친다. 사본이 없으므로 동기화 개념도 없다.
// 행이 없거나 연동을 풀면 컷선·존 틴트 없는 순수 산점이다. 상단 칩 스트립 = 테마 행 목록의 파생 뷰
// (클릭 = 연동 전환).
//
// 산점은 **항상 /day-replay 재계산 단면**을 그린다(scrubSection 머리 주석 — 서수 출처 단일화).
// 구운 번들은 헤더의 라이브 통과 카운트(모수 전체) 전용이다.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import { PanelHeader } from "../../components/ControlChrome.js";
import { SubjectBadge } from "../../components/SubjectBadge.js";
import { CanvasLayers } from "../canvas/CanvasPainter.js";
import { useWorkbench } from "../../store/workbench.js";
import { themeStrengthLabel } from "../filter/label.js";
import { themeParamsOf, useLinkedThemeStage } from "../filter/themeLink.js";
import { useSubject, subjectStatus } from "../../lib/subject.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";
import { useChartPoints } from "../../lib/useChartPoints.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { useThemeStrengthStats } from "../../lib/useThemeStrengthStats.js";
import { anyConditionOn, DEFAULT_THEME_STRENGTH, type ThemeStrengthParams } from "../../lib/themeStrength.js";
import { defaultMinuteOf, scrubSectionOf, type ScrubSection } from "./scrubSection.js";
import { scatterLayer } from "./scatterLayer.js";
import { ThemeParamControls } from "./ThemeParamControls.js";
import { TimelineBar } from "./TimelineBar.js";
import { tooltipBoxOf } from "./tooltipBox.js";
import { bandSegmentsOf, subjectOrdinalTrack } from "./zoneTrack.js";
import { FILTER } from "../../styles/palette.js";

const PAD = { left: 44, top: 14, right: 14, bottom: 30 };
/** 컷선 잡기 판정 폭(px). */
const GRAB = 7;

const fmtMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function ThemeRankPanel(): JSX.Element {
    const subject = useSubject();
    const { nameOf } = useStockNamesDict();

    // ── 연동 행 — 보드와 같은 상태 하나(펼침 ≡ 연동). 이 행의 params 가 존·카운트의 유일한 재료다.
    const { themeStages, linkedId, setLinked } = useLinkedThemeStage();
    const linked = useMemo(() => (linkedId === null ? null : themeStages.find((s) => s.id === linkedId) ?? null), [themeStages, linkedId]);
    const linkedParams = useMemo(() => (linked ? themeParamsOf(linked) : null), [linked]);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);

    // ── 그날 스냅샷(복기 파생) — 정규화 패널과 같은 공용 LRU 캐시.
    const snapQ = useDaySnapshot(subject?.date ?? null);
    const stocks = snapQ.data?.stocks;

    // ── 스크럽 분 — 세션 수명(프리셋 전환엔 살고 새로고침엔 리셋). subject 가 바뀌면 따라가기(null)로 되돌린다.
    const subjectKey = subject ? `${subject.code}|${subject.date}|${subject.time ?? ""}` : "";
    const scrub = useWorkbench((s) => s.sessionUi["themeRank"]?.[subjectKey]) as number | undefined;
    const setSessionUi = useWorkbench((s) => s.setSessionUi);

    // 슬라이더 도메인 — 스냅샷의 실제 분 범위.
    const minuteRange = useMemo(() => {
        if (!stocks || stocks.length === 0) return null;
        let lo = Infinity;
        let hi = -Infinity;
        for (const s of stocks) {
            if (s.times.length === 0) continue;
            const a = minuteOfDayOf(s.times[0]);
            const b = minuteOfDayOf(s.times[s.times.length - 1]);
            if (a < lo) lo = a;
            if (b > hi) hi = b;
        }
        return Number.isFinite(lo) ? { lo, hi } : null;
    }, [stocks]);

    // 기본 분 — 사다리(타점 시각 → 그날 첫 타점 → 마지막 봉)는 순수 함수(defaultMinuteOf)가 소유한다.
    const chartPoints = useChartPoints(subject?.code ?? "", subject?.date ?? "");
    const defaultMinute = useMemo(() => {
        if (!subject) return null;
        return defaultMinuteOf(subject.time, chartPoints.map((p) => p.time), minuteRange?.hi ?? null);
    }, [subject, chartPoints, minuteRange]);
    const minute = scrub ?? defaultMinute;

    // ── 단면 — 분 단위 memo. 파라미터는 의존성이 아니다(존 판정은 서수의 하류 — 드래그가 단면을 재굽지 않게).
    const section: ScrubSection | null = useMemo(() => {
        if (!stocks || stocks.length === 0 || !subject || minute === null) return null;
        return scrubSectionOf(stocks, subject.date, fmtMin(minute));
    }, [stocks, subject, minute]);

    // ── 테마 동료 — 읽기 시점 인덱스(멤버십은 굽지 않는다). 소속 전 테마 멤버의 **합집합**(자신 제외).
    // ⚠ 시선은 합집합이지만 카운트의 묶음 판정은 테마 단위 AND 다 — teal 점 3개를 세어도 서로 다른
    // 테마면 "동료 ≥ 3" 은 불통과일 수 있다(분해 금지). 테마 갈라 보기는 후속 과제.
    const themesView = useThemeIndex();
    const peers = useMemo(() => {
        const out = new Set<string>();
        if (!subject) return out;
        for (const t of themesView.index.themesOf(subject.code)) for (const c of themesView.index.codesOf(t)) out.add(c);
        out.delete(subject.code);
        return out;
    }, [themesView.index, subject]);

    // ── 컷선 드래그 — 미리보기는 로컬, 커밋은 손 뗄 때 한 번(Rail 규약) **연동 행의 술어로**.
    const [preview, setPreview] = useState<Partial<ThemeStrengthParams> | null>(null);
    const eff: ThemeStrengthParams = useMemo(
        () => ({ ...(linkedParams ?? DEFAULT_THEME_STRENGTH), ...preview }),
        [linkedParams, preview],
    );
    // 카운트만 한 프레임 뒤로 — 존 틴트·점은 즉시 따라와야 손이 안 끌린다.
    const countParams = useDeferredValue(eff);
    const count = useThemeStrengthStats(countParams);

    // ── 그림 상자 — **안정 콜백 ref**. 이 div 는 subject && section 일 때만 마운트되는데, 1회성 effect 로
    // 관찰을 붙이면 최초 렌더(시선 없음)에서 ref 가 null 이라 영영 안 붙는다(실측: 캔버스 0×0 고정).
    // 콜백은 useCallback 으로 고정한다 — 인라인이면 렌더마다 detach/attach 가 돌아 새 옵저버의 초기
    // 발화 → setSize(새 객체) → 재렌더의 조용한 루프가 된다(실측: React 렌더 중 setState 경고).
    // setSize 도 동일값이면 이전 객체를 돌려줘 재렌더를 끊는다.
    const [size, setSize] = useState({ w: 0, h: 0 });
    const roRef = useRef<ResizeObserver | null>(null);
    const wrapRef = useCallback((el: HTMLDivElement | null): void => {
        roRef.current?.disconnect();
        roRef.current = null;
        if (!el) return;
        const ro = new ResizeObserver((es) => {
            const w = es[0].contentRect.width;
            const h = es[0].contentRect.height;
            setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
        });
        ro.observe(el); // 관찰 시작 시 1회 발화(스펙) — 초기 크기도 이 경로로 들어온다
        roRef.current = ro;
    }, []);
    useEffect(() => () => roRef.current?.disconnect(), []);
    const box = { left: PAD.left, top: PAD.top, width: Math.max(0, size.w - PAD.left - PAD.right), height: Math.max(0, size.h - PAD.top - PAD.bottom) };

    // 축 상한 = 유니버스 크기 — 서수 정의역(n)보다 클 수 있지만(결손분), n 을 쓰면 carry-forward 로
    // n 이 자라는 아침 구간에서 스크럽 중 축이 계속 늘어나 점들이 출렁인다. 하루 안에서 축은 상수가 낫다.
    const maxRank = Math.max(section?.codes.length ?? 0, 1);
    const scales = useMemo(() => ({
        x: (ord: number): number => box.left + ((Math.min(ord, maxRank) - 1) / Math.max(maxRank - 1, 1)) * box.width,
        y: (ord: number): number => box.top + ((Math.min(ord, maxRank) - 1) / Math.max(maxRank - 1, 1)) * box.height,
    }), [box.left, box.top, box.width, box.height, maxRank]);
    const ordAtX = (px: number): number => Math.max(1, Math.min(maxRank, Math.round(1 + ((px - box.left) / Math.max(box.width, 1)) * (maxRank - 1))));
    const ordAtY = (py: number): number => Math.max(1, Math.min(maxRank, Math.round(1 + ((py - box.top) / Math.max(box.height, 1)) * (maxRank - 1))));

    const participants = useMemo(() => {
        if (!section) return [];
        const out: { code: string; rate: number; amount: number }[] = [];
        for (let i = 0; i < section.codes.length; i++) {
            const r = section.section.rate[i];
            const a = section.section.amount[i];
            if (r !== null && a !== null) out.push({ code: section.codes[i], rate: r, amount: a });
        }
        return out;
    }, [section]);

    // 존은 연동 행이 있을 때만 — 없으면 동료 전부 채운 점(존 안/밖 구분 자체가 없다).
    const zone = linkedParams === null ? null : { rateN: eff.zoneRateN, amountN: eff.zoneAmountN };
    const layers = useMemo(
        () => [scatterLayer({ points: participants, subject: subject?.code ?? null, peers, zone, scales })],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [participants, subject, peers, zone?.rateN, zone?.amountN, linkedParams === null, scales],
    );

    // ── 컷선 드래그(위 SVG 층이 포인터 소유 — 캔버스는 포인터를 안 받는다). 연동 행 없으면 손짓도 없다.
    const dragRef = useRef<"rate" | "amount" | null>(null);
    const cutX = scales.x(eff.zoneAmountN); // 세로선(거래대금 컷)
    const cutY = scales.y(eff.zoneRateN); // 가로선(등락률 컷)
    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (e.button !== 0 || linkedParams === null) return; // 우클릭·휠클릭·비연동이 드래그를 시작시키지 않게
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const target = Math.abs(x - cutX) <= GRAB ? "amount" : Math.abs(y - cutY) <= GRAB ? "rate" : null;
        if (!target) return;
        dragRef.current = target;
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
        const drag = dragRef.current;
        if (!drag) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (drag === "amount") setPreview((p) => ({ ...p, zoneAmountN: ordAtX(e.clientX - rect.left) }));
        else setPreview((p) => ({ ...p, zoneRateN: ordAtY(e.clientY - rect.top) }));
    };
    const onPointerUp = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (!dragRef.current) return;
        dragRef.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        setPreview((p) => {
            // 커밋은 여기 한 번, **연동 행의 술어로** — 보드 행·막대·저장물이 같이 바뀐다.
            if (p && linked !== null && linkedParams !== null) {
                setPredicates(linked.id, [{ kind: "themeStrength", params: { ...linkedParams, ...p } }]);
            }
            return null;
        });
    };

    // ── 타임라인 재료 — 트랙(분당 서수, 시선/날짜당 한 번)과 띠 필터(컷 드래그마다 O(분))를 가른다.
    // 띠는 연동 행의 존 기준이므로 연동 없을 땐 트랙 자체를 안 굽는다(~390분 × 정렬 — 공짜가 아니다).
    const hasLink = linkedParams !== null;
    const track = useMemo(
        () => (hasLink && stocks && subject && minuteRange ? subjectOrdinalTrack(stocks, subject.date, subject.code, minuteRange) : null),
        [hasLink, stocks, subject, minuteRange],
    );
    // 의존성은 **원시값**(zone 은 렌더마다 새 객체 — layers 메모와 같은 함정, 호버 move 마다 재계산·재렌더가 된다).
    const segments = useMemo(
        () => (track && minuteRange && zone !== null ? bandSegmentsOf(track, minuteRange.lo, minuteRange.hi, zone.rateN, zone.amountN) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [track, minuteRange, zone === null, zone?.rateN, zone?.amountN],
    );
    // 저장 타점의 분들 — ▼ 마커(클릭 = 점프, 옛 ↺ 의 후계).
    const pointMinutes = useMemo(
        () => chartPoints.map((p) => {
            const [h, m] = p.time.split(":");
            return Number(h) * 60 + Number(m);
        }),
        [chartPoints],
    );

    // ── 호버 — 위 SVG 층에서 가까운 점 선형 스캔(수백 개 — 공짜).
    const [hover, setHover] = useState<{ x: number; y: number; code: string; rate: number; amount: number } | null>(null);
    const onHoverMove = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (dragRef.current) { setHover(null); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        let best: typeof hover = null;
        let bestD = 8 * 8;
        for (const p of participants) {
            const dx = scales.x(p.amount) - x;
            const dy = scales.y(p.rate) - y;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = { x, y, code: p.code, rate: p.rate, amount: p.amount }; }
        }
        setHover(best);
    };

    return (
        <div style={wrap}>
            <PanelHeader chrome={false} gap={8} style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)" }}>
                <span style={label} title="연동 행의 조건을 타점 모수 전체에 적용한 수 — 통과/판정가능. 결손 = 단면 없음(오늘 이후·미수집)">
                    {linkedParams === null
                        ? <span style={{ color: "var(--text-tertiary)" }}>
                            {themeStages.length === 0 ? "테마 조건 행 없음 — 편성 보드에서 ＋ 테마 조건" : "연동 없음 — 아래 칩으로 행을 고르세요"}
                        </span>
                        : count.error ? <span style={{ color: FILTER }}>모수 재료 오류</span>
                            : count.isLoading ? "…"
                                : anyConditionOn(countParams)
                                    ? <>통과 {count.passed.toLocaleString()} / {count.evaluable.toLocaleString()}{count.missing > 0 && <span style={{ color: "var(--text-tertiary)" }}> · 결손 {count.missing}</span>}</>
                                    : <span style={{ color: "var(--text-tertiary)" }}>조건 없음 — 판정가능 {count.evaluable.toLocaleString()}</span>}
                </span>
                {linked !== null && !linked.enabled && (
                    <span title="연동 행이 꺼져 있어 깔때기에 안 낀다 — 위 카운트는 켰을 때의 값(탐색용)"
                        style={{ ...label, color: "var(--text-tertiary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "0 6px" }}>
                        꺼짐
                    </span>
                )}
                {subject && (
                    <span style={{ ...label, color: "var(--text-tertiary)" }}>
                        {nameOf(subject.code)} · {subject.date}{minute !== null && ` ${fmtMin(minute)}`}
                    </span>
                )}
                {/* 단면이 아예 없을 땐 빈 화면 문구가 말한다 — 배지는 "단면은 있는데 시선이 안 그려진" 경우만. */}
                <SubjectBadge subject={subject} name={subject ? nameOf(subject.code) : undefined} absentLabel="그 분 순위 없음"
                    status={section
                        ? subjectStatus(
                            section.indexOf(subject?.code ?? "") !== null && participants.some((p) => p.code === subject?.code),
                            participants.some((p) => p.code === subject?.code),
                        )
                        : "shown"} />
            </PanelHeader>

            {/* 연동 행의 편집 손잡이 — 컷선으로 못 그리는 값들(존 N/M 은 산점 드래그가 진다). */}
            {linked !== null && linkedParams !== null && (
                <ThemeParamControls params={linkedParams}
                    onPatch={(p) => setPredicates(linked.id, [{ kind: "themeStrength", params: { ...linkedParams, ...p } }])} />
            )}

            {/* 칩 스트립 — 테마 행 목록의 파생 뷰(별도 저장물 없음). 클릭 = 연동 전환(보드 요약 줄도 같은 상태를 본다). */}
            {themeStages.length > 0 && (
                <div style={chipsRow}>
                    {themeStages.map((s) => {
                        const p = themeParamsOf(s);
                        if (!p) return null;
                        const active = s.id === linkedId;
                        return (
                            <button key={s.id} onClick={() => setLinked(active ? null : s.id)}
                                title={active ? "연동 중 — 클릭하면 해제(컷선 없는 순수 산점)" : "이 행을 비추기 — 컷선 드래그가 이 행의 N/M 을 직접 고칩니다"}
                                style={{
                                    ...chipBtn,
                                    ...(active ? { color: "var(--accent-primary)", borderColor: "var(--accent-primary)", background: "var(--accent-soft)" } : {}),
                                    opacity: s.enabled ? 1 : 0.55,
                                }}>
                                {themeStrengthLabel(p)}{!s.enabled && " · 꺼짐"}
                            </button>
                        );
                    })}
                </div>
            )}

            {!subject && <div style={empty}>차트·시트에서 종목(타점)을 짚으면 그 시각의 순위 평면이 선다</div>}
            {subject && snapQ.isError && <div style={{ ...empty, color: FILTER }}>복기 파생 로드 실패 — {(snapQ.error as Error).message}</div>}
            {subject && snapQ.isLoading && <div style={empty}>그날 복기 파생을 당기는 중…</div>}
            {subject && !snapQ.isLoading && !snapQ.isError && !section && <div style={empty}>그날 분봉 파생이 없다 — 미수집이거나 오늘(수집 전)이다</div>}

            {subject && section && (
                <div ref={wrapRef} style={{ position: "relative", flex: 1, minHeight: 0 }}>
                    {/* 아래 SVG — 축·존 틴트(그림 밑). 존은 연동 행이 있을 때만. */}
                    <svg width={size.w} height={size.h} style={underSvg}>
                        {linkedParams !== null && (
                            <rect x={box.left} y={box.top} width={Math.max(0, cutX - box.left)} height={Math.max(0, cutY - box.top)} fill="var(--accent-soft)" opacity={0.7} />
                        )}
                        <line x1={box.left} y1={box.top} x2={box.left} y2={box.top + box.height} stroke="var(--border-strong)" />
                        <line x1={box.left} y1={box.top + box.height} x2={box.left + box.width} y2={box.top + box.height} stroke="var(--border-strong)" />
                        <text x={box.left - 6} y={box.top + 10} textAnchor="end" style={axisText}>1위</text>
                        <text x={box.left - 6} y={box.top + box.height} textAnchor="end" style={axisText}>{maxRank}</text>
                        <text x={box.left - 28} y={box.top + box.height / 2} textAnchor="middle" style={axisText} transform={`rotate(-90 ${box.left - 28} ${box.top + box.height / 2})`}>등락률 순위 ↓</text>
                        <text x={box.left + box.width / 2} y={size.h - 8} textAnchor="middle" style={axisText}>거래대금 순위 →</text>
                        <text x={box.left + box.width} y={box.top + box.height + 14} textAnchor="end" style={axisText}>{maxRank}</text>
                    </svg>

                    <div style={{ position: "absolute", inset: 0 }}>
                        <CanvasLayers layers={layers} width={size.w} height={size.h} clip={null} />
                    </div>

                    {/* 위 SVG — 컷선·손잡이·호버(포인터 소유). 컷선은 연동 행이 있을 때만. */}
                    <svg width={size.w} height={size.h} style={overSvg}
                        onPointerDown={onPointerDown}
                        onPointerMove={(e) => { onPointerMove(e); onHoverMove(e); }}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp} // 터치·제스처 가로채기로 up 이 안 올 때 드래그가 끼지 않게(Rail 규약)
                        onPointerLeave={() => setHover(null)}>
                        {linkedParams !== null && (
                            <>
                                <line x1={cutX} y1={box.top} x2={cutX} y2={box.top + box.height} stroke={FILTER} strokeWidth={1.5} strokeDasharray="5 3" style={{ cursor: "ew-resize" }} />
                                <line x1={box.left} y1={cutY} x2={box.left + box.width} y2={cutY} stroke={FILTER} strokeWidth={1.5} strokeDasharray="5 3" style={{ cursor: "ns-resize" }} />
                                <g style={{ fontSize: 10, fill: "#fff", fontVariantNumeric: "tabular-nums" }}>
                                    <rect x={cutX - 26} y={box.top + box.height + 3} width={52} height={14} rx={3} fill={FILTER} />
                                    <text x={cutX} y={box.top + box.height + 14} textAnchor="middle">대금 {eff.zoneAmountN}</text>
                                    <rect x={box.left + box.width - 54} y={cutY - 16} width={52} height={14} rx={3} fill={FILTER} />
                                    <text x={box.left + box.width - 28} y={cutY - 5} textAnchor="middle">등락 {eff.zoneRateN}</text>
                                </g>
                            </>
                        )}
                        {hover && (() => {
                            // 자리는 순수 셈(tooltipBox) — 경계에서 플립·클램프, 폭은 글자에서.
                            const text = `${nameOf(hover.code)} · 등락 ${hover.rate}위 · 대금 ${hover.amount}위`;
                            const tb = tooltipBoxOf(hover, text, { w: size.w, h: size.h });
                            return (
                                <g style={{ pointerEvents: "none" }}>
                                    <rect x={tb.x} y={tb.y} width={tb.w} height={tb.h} rx={3} fill="var(--bg-tertiary)" stroke="var(--border-default)" strokeWidth={0.5} />
                                    <text x={tb.x + 6} y={tb.y + 13} style={{ fontSize: 11, fill: "var(--text-primary)" }}>{text}</text>
                                </g>
                            );
                        })()}
                    </svg>
                </div>
            )}

            {/* footer = 시각 타임라인만 — 조건 폼은 없다(조건은 보드 행·컷선이 전부다).
                띠 = 시선 종목의 존 재적(연동 행 N/M 기준, 끊김 = 이탈/결손) · ▼ = 저장 타점(클릭 = 점프). */}
            {subject && section && minuteRange && (
                <div style={footer}>
                    <span style={{ ...cond, flexShrink: 0 }}>시각</span>
                    <TimelineBar lo={minuteRange.lo} hi={minuteRange.hi} minute={minute}
                        pointMinutes={pointMinutes} segments={segments}
                        onScrub={(m) => setSessionUi("themeRank", subjectKey, m)} />
                </div>
            )}
        </div>
    );
}

const wrap: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" };
const label: CSSProperties = { fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 };
const empty: CSSProperties = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 12 };
const underSvg: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
const overSvg: CSSProperties = { position: "absolute", inset: 0, touchAction: "none", userSelect: "none" };
const axisText: CSSProperties = { fontSize: 10, fill: "var(--text-tertiary)" };
const footer: CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "4px 10px", borderTop: "1px solid var(--border-default)", fontSize: 11, color: "var(--text-secondary)", flexWrap: "wrap" };
const chipsRow: CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderBottom: "1px solid var(--border-subtle)", overflowX: "auto", flexShrink: 0 };
// border 는 낱개 속성으로 — 활성 칩이 borderColor 만 덮는데, 축약(border)과 섞이면 React 가 경고한다.
const chipBtn: CSSProperties = { fontSize: 10.5, color: "var(--text-secondary)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--border-default)", borderRadius: 8, padding: "1px 8px", background: "transparent", cursor: "pointer", whiteSpace: "nowrap" };
const cond: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };
