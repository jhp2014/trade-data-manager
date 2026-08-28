// 테마 순위 패널 — **순수 시선**: 순위 평면(x=거래대금 서수·y=등락률 서수)에 그날 유니버스를 점으로
// 세우고, 시선 종목의 테마 동료를 켠 채 N/M 존 컷선과 시각 스크럽으로 테마 상황을 탐색한다.
//
// 조건은 여기서 만들지 않는다 — 탐색값(themeRankParams)은 영속 슬라이스에 살고, 조건화(동결)는
// 집합 편성 보드의 풀 스냅샷이 한다(decisions.md "테마 강도·순위 단면"). 흔적 영역도 그 파생 뷰라
// 이번엔 자리만 있다.
//
// 산점은 **항상 /day-replay 재계산 단면**을 그린다(scrubSection 머리 주석 — 서수 출처 단일화).
// 구운 번들은 헤더의 라이브 통과 카운트(모수 전체) 전용이다.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import { PanelHeader } from "../../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../../components/HeaderControls.js";
import { SubjectBadge } from "../../components/SubjectBadge.js";
import { NumberField } from "../../ui/controls.js";
import { CanvasLayers } from "../canvas/CanvasPainter.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { ThemeStrengthFields } from "../../components/ThemeStrengthFields.js";
import { themeStrengthLabel } from "../filter/label.js";
import { useSubject, subjectStatus } from "../../lib/subject.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";
import { useChartPoints } from "../../lib/useChartPoints.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { anyConditionOn, type ThemeStrengthParams } from "../../lib/themeStrength.js";
import { defaultMinuteOf, scrubSectionOf, type ScrubSection } from "./scrubSection.js";
import { scatterLayer } from "./scatterLayer.js";
import { useThemeStrengthStats } from "../../lib/useThemeStrengthStats.js";
import { FILTER } from "../../styles/palette.js";

const PAD = { left: 44, top: 14, right: 14, bottom: 30 };
/** 컷선 잡기 판정 폭(px). */
const GRAB = 7;

const fmtMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function ThemeRankPanel(): JSX.Element {
    const subject = useSubject();
    const params = useWorkbench((s) => s.themeRankParams);
    const setParams = useWorkbench((s) => s.setThemeRankParams);
    const { nameOf } = useStockNamesDict();

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

    // ── 흔적 — 깔때기 단계 목록의 파생(useFunnel 을 물지 않는다 — 이 패널은 시선이라 정산 구독이 필요 없다).
    const stages = useWorkbench(selectFilterStages);
    const themeTraces = useMemo(
        () => stages.flatMap((s) => {
            const p = s.predicates.find((x) => x.kind === "themeStrength");
            return p && p.kind === "themeStrength" ? [{ id: s.id, enabled: s.enabled, params: p.params }] : [];
        }),
        [stages],
    );

    // ── 컷선 드래그 — 미리보기는 로컬, 커밋은 손 뗄 때 한 번(Rail 규약). 그림·카운트는 미리보기 값을 본다.
    const [preview, setPreview] = useState<Partial<ThemeStrengthParams> | null>(null);
    const eff: ThemeStrengthParams = useMemo(() => ({ ...params, ...preview }), [params, preview]);
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

    const layers = useMemo(
        () => [scatterLayer({ points: participants, subject: subject?.code ?? null, peers, zone: { rateN: eff.zoneRateN, amountN: eff.zoneAmountN }, scales })],
        [participants, subject, peers, eff.zoneRateN, eff.zoneAmountN, scales],
    );

    // ── 컷선 드래그(위 SVG 층이 포인터 소유 — 캔버스는 포인터를 안 받는다).
    const dragRef = useRef<"rate" | "amount" | null>(null);
    const cutX = scales.x(eff.zoneAmountN); // 세로선(거래대금 컷)
    const cutY = scales.y(eff.zoneRateN); // 가로선(등락률 컷)
    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (e.button !== 0) return; // 우클릭·휠클릭이 드래그를 시작시키지 않게(Rail 규약)
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
            if (p) setParams(p); // 커밋은 여기 한 번 — 보드 라이브 미러가 드래그 내내 떨리지 않게
            return null;
        });
    };

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

    const controls = useMemo<ControlSpec[]>(() => [
        {
            kind: "choice", id: "basis", name: "순위 기준", group: "조건",
            help: "테마 내 순위 조건(②③)이 타는 서수 — 등락률이 기본(사용자 확정)",
            values: [{ v: "rate", label: "등락" }, { v: "amount", label: "대금" }],
            value: params.basis,
            set: (v) => setParams({ basis: v === "amount" ? "amount" : "rate" }),
        },
    ], [params.basis, setParams]);

    // 빈 입력은 커밋하지 않는다 — NumberField 버퍼가 빈칸을 유지하게 두고, 유효 숫자만 스토어로.
    // (하위 조건 3종은 공용 ThemeStrengthFields 가 blur 커밋으로 진다 — 여긴 존 N/M 둘뿐.)
    const onNum = (key: "zoneRateN" | "zoneAmountN") =>
        (e: React.ChangeEvent<HTMLInputElement>): void => {
            const n = Math.floor(Number(e.target.value));
            if (Number.isFinite(n) && n >= 1) setParams({ [key]: n });
        };

    return (
        <div style={wrap}>
            <PanelHeader chrome={false} gap={8} style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)" }}>
                <span style={label} title="현재 묶음 조건을 타점 모수 전체에 적용한 수 — 통과/판정가능. 결손 = 단면 없음(오늘 이후·미수집)">
                    {count.error ? <span style={{ color: FILTER }}>모수 재료 오류</span>
                        : count.isLoading ? "…"
                            : anyConditionOn(countParams)
                                ? <>통과 {count.passed.toLocaleString()} / {count.evaluable.toLocaleString()}{count.missing > 0 && <span style={{ color: "var(--text-tertiary)" }}> · 결손 {count.missing}</span>}</>
                                : <span style={{ color: "var(--text-tertiary)" }}>조건 없음 — 판정가능 {count.evaluable.toLocaleString()}</span>}
                </span>
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
                <HeaderControls controls={controls} storageKey="wb.headerPins.themeRank" />
            </PanelHeader>

            {!subject && <div style={empty}>차트·시트에서 종목(타점)을 짚으면 그 시각의 순위 평면이 선다</div>}
            {subject && snapQ.isError && <div style={{ ...empty, color: FILTER }}>복기 파생 로드 실패 — {(snapQ.error as Error).message}</div>}
            {subject && snapQ.isLoading && <div style={empty}>그날 복기 파생을 당기는 중…</div>}
            {subject && !snapQ.isLoading && !snapQ.isError && !section && <div style={empty}>그날 분봉 파생이 없다 — 미수집이거나 오늘(수집 전)이다</div>}

            {subject && section && (
                <div ref={wrapRef} style={{ position: "relative", flex: 1, minHeight: 0 }}>
                    {/* 아래 SVG — 축·존 틴트(그림 밑) */}
                    <svg width={size.w} height={size.h} style={underSvg}>
                        <rect x={box.left} y={box.top} width={Math.max(0, cutX - box.left)} height={Math.max(0, cutY - box.top)} fill="var(--accent-soft)" opacity={0.7} />
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

                    {/* 위 SVG — 컷선·손잡이·호버(포인터 소유) */}
                    <svg width={size.w} height={size.h} style={overSvg}
                        onPointerDown={onPointerDown}
                        onPointerMove={(e) => { onPointerMove(e); onHoverMove(e); }}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp} // 터치·제스처 가로채기로 up 이 안 올 때 드래그가 끼지 않게(Rail 규약)
                        onPointerLeave={() => setHover(null)}>
                        <line x1={cutX} y1={box.top} x2={cutX} y2={box.top + box.height} stroke={FILTER} strokeWidth={1.5} strokeDasharray="5 3" style={{ cursor: "ew-resize" }} />
                        <line x1={box.left} y1={cutY} x2={box.left + box.width} y2={cutY} stroke={FILTER} strokeWidth={1.5} strokeDasharray="5 3" style={{ cursor: "ns-resize" }} />
                        <g style={{ fontSize: 10, fill: "#fff", fontVariantNumeric: "tabular-nums" }}>
                            <rect x={cutX - 26} y={box.top + box.height + 3} width={52} height={14} rx={3} fill={FILTER} />
                            <text x={cutX} y={box.top + box.height + 14} textAnchor="middle">대금 {eff.zoneAmountN}</text>
                            <rect x={box.left + box.width - 54} y={cutY - 16} width={52} height={14} rx={3} fill={FILTER} />
                            <text x={box.left + box.width - 28} y={cutY - 5} textAnchor="middle">등락 {eff.zoneRateN}</text>
                        </g>
                        {hover && (
                            <g style={{ pointerEvents: "none" }}>
                                <rect x={hover.x + 10} y={hover.y - 24} width={150} height={18} rx={3} fill="var(--bg-tertiary)" stroke="var(--border-default)" strokeWidth={0.5} />
                                <text x={hover.x + 16} y={hover.y - 11} style={{ fontSize: 11, fill: "var(--text-primary)" }}>
                                    {nameOf(hover.code)} · 등락 {hover.rate}위 · 대금 {hover.amount}위
                                </text>
                            </g>
                        )}
                    </svg>
                </div>
            )}

            {/* 조건 줄은 **상시** — 이 값들은 영속이라 화면에 안 보여도 카운트(와 다음 단계의 보드 미러)를
                계속 바꾼다. 안 보이는데 숫자가 달라지는 사고 방지(축 서랍 배지와 같은 논리). 스크럽만 단면 전제. */}
            <div style={footer}>
                {subject && section && (
                    <span style={cond}>
                        시각
                        <input type="range" min={minuteRange?.lo ?? 540} max={minuteRange?.hi ?? 930} step={1}
                            value={minute ?? minuteRange?.lo ?? 540}
                            onChange={(e) => setSessionUi("themeRank", subjectKey, Number(e.target.value))}
                            style={{ width: 160 }} />
                        <b style={mono}>{minute !== null ? fmtMin(minute) : "—"}</b>
                        {scrub !== undefined && (
                            <button style={btn} title="타점 시각으로 되돌리기" onClick={() => setSessionUi("themeRank", subjectKey, undefined)}>↺</button>
                        )}
                    </span>
                )}
                <span style={{ flex: 1 }} />
                {/* 하위 조건 3종 — 보드의 동결 행과 **같은 컴포넌트**(레이블·툴팁이 갈리면 두 화면이 딴말을 한다). */}
                <ThemeStrengthFields value={params} onChange={setParams} />
                <span style={cond} title="존 컷(그림의 빨간 선과 같은 값) — 등락 서수 ≤ N ∧ 대금 서수 ≤ M">
                    존 N <NumberField min={1} value={eff.zoneRateN} onChange={onNum("zoneRateN")} style={numBox} />
                    M <NumberField min={1} value={eff.zoneAmountN} onChange={onNum("zoneAmountN")} style={numBox} />
                </span>
            </div>

            {/* 흔적 — 깔때기에 걸린 테마 필터들의 **파생 뷰**(별도 저장물 없음). 클릭 = 그 동결값을 탐색값으로 복원. */}
            {themeTraces.length > 0 && (
                <div style={{ ...footer, borderTop: "1px dashed var(--border-subtle)", paddingTop: 3 }}>
                    <span style={{ color: "var(--text-tertiary)" }}>흔적(깔때기)</span>
                    {themeTraces.map((t, i) => (
                        <button key={t.id} style={{ ...btn, opacity: t.enabled ? 1 : 0.5 }}
                            title="집합 편성 보드에 걸린 테마 필터 — 클릭하면 그 동결값을 이 패널의 탐색값으로 복원"
                            onClick={() => setParams(t.params)}>
                            {themeStrengthLabel(t.params)}{themeTraces.length > 1 ? ` #${i + 1}` : ""}
                        </button>
                    ))}
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
const cond: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };
const mono: CSSProperties = { fontVariantNumeric: "tabular-nums", color: "var(--text-primary)", fontWeight: 500 };
const numBox: CSSProperties = { width: 44, fontSize: 11, padding: "1px 4px" }; // 나머지는 NumberField(inputBase) 것 — 공용 필드 칸과 같은 겉이어야 한다
const btn: CSSProperties = { border: "1px solid var(--border-default)", borderRadius: 3, padding: "0 5px", fontSize: 11, background: "var(--bg-secondary)", cursor: "pointer" };
