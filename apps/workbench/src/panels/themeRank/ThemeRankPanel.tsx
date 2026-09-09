// 테마 순위 패널 — **연동 거울**: 순위 평면(x=거래대금 서수·y=등락률 서수)에 그날 유니버스를 점으로
// 세우고, 시선 종목의 테마 동료를 켠 채 시각 스크럽으로 테마 상황을 탐색한다. 표시 시각은 **전역
// focus.time 직결**(2026-09-09) — 차트 클릭·a/d 와 이 패널의 타임라인 바가 같은 채널을 양방향으로 민다.
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
//
// 다중 테마(2026-09-07): 칩 줄 오른쪽 = 시선 종목의 테마(ThemeLensStrip) — 렌즈(택1 갈라 보기)와
// 진단(✓/✗ = 그 테마 단독 통과, themeVerdicts)을 겸한다. 둘 다 **시선 도구다**(깔때기·카운트 불변).
// 산점의 점은 클릭 = 그 종목으로 이동(동료·회색 무관)이고, 떠난 자리는 헤더 브레드크럼이 기억한다.
//
// 꼬리·줌(2026-09-09): 그려진 점마다 상대 오프셋 시점들의 자리를 잇는 꼬리(trailLayer, 설정 영속) +
// 휠 = 커서 중심 확대·확대 중 좌드래그 = 팬·빈 곳 더블클릭 = 원위치(도메인은 sessionUi, 날짜 낟알).
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { anyConditionOn, DEFAULT_THEME_STRENGTH, themeProjectionOf, themeVerdicts, type ThemeStrengthParams, type ThemeVerdict } from "../../lib/themeStrength.js";
import { defaultMinuteOf, scrubSectionOf, type ScrubSection } from "./scrubSection.js";
import { scatterLayer } from "./scatterLayer.js";
import { themeColorMap } from "./themeColor.js";
import { ThemeLensStrip } from "./ThemeLensStrip.js";
import { ThemeParamControls } from "./ThemeParamControls.js";
import { TimelineBar } from "./TimelineBar.js";
import { tooltipBoxOf } from "./tooltipBox.js";
import { TrailControl } from "./TrailControl.js";
import { trailLayer, type Trail, type TrailPoint } from "./trailLayer.js";
import { bandSegmentsOf, subjectOrdinalTrack } from "./zoneTrack.js";
import { ACTIVE, FILTER } from "../../styles/palette.js";

// 오른쪽 여백이 넓은 이유: 등락 컷 **손잡이 배지가 그림 밖에 앉기 때문**이다(안에 두면 그 자리 동료
// 점의 클릭을 먹고, 바닥으로 클램프되면 x 눈금 글자를 덮는다). 손잡이는 그림 밖에만 산다.
const PAD = { left: 44, top: 14, right: 60, bottom: 30 };
/** 컷선 라벨 배지 크기(px) — **이게 손잡이다**(선 자체는 안 잡힌다, 아래 cutLabels 주석). */
const LBL_W = 52;
const LBL_H = 14;
/** 라벨 잡기 여유(px) — 배지가 작아서 가장자리를 조금 넉넉히 준다. */
const LBL_PAD = 3;
/** 점 집기 반경(px) — 호버 툴팁과 클릭 이동이 같이 쓴다. */
const HIT_R = 8;
/** 이만큼 넘게 끌렸으면 클릭이 아니다(px). */
const CLICK_SLOP = 4;

const fmtMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** 분 → focus.time 포맷("HH:MM:00") — Taskbar TimeControl 과 같은 자. */
const fmtHms = (m: number): string => `${fmtMin(m)}:00`;

/** 줌 도메인(서수 공간) — 날짜에 매인다(유니버스 크기가 날짜마다 달라 같은 사각이 다른 영역이 된다). */
interface ZoomDom { date: string; x0: number; x1: number; y0: number; y1: number }
/** 줌 하한(서수 폭) — 이보다 좁히면 몇 위 안 남아 좌표가 무의미해진다. */
const ZOOM_MIN_SPAN = 4;
/** 도메인 구간 눈금 — 균등 4~5개(정수로 반올림·중복 제거). */
const tickListOf = (a: number, b: number, maxRank: number): number[] =>
    [...new Set([a, a + (b - a) * 0.25, a + (b - a) * 0.5, a + (b - a) * 0.75, b].map(Math.round))]
        .filter((t) => t >= 1 && t <= maxRank);

export function ThemeRankPanel(): JSX.Element {
    const subject = useSubject();
    const { nameOf } = useStockNamesDict();
    // 전역 시각(focus.time) — 표시 분의 1순위 재료(아래 minute)이자, 동료 클릭 이동·되돌아가기의 시각.
    const setCode = useWorkbench((s) => s.setCode);
    const setFocus = useWorkbench((s) => s.setFocus);
    const setTime = useWorkbench((s) => s.setTime);
    const focusTime = useWorkbench((s) => s.focus.time);
    const lastFocusOrigin = useWorkbench((s) => s.lastFocusOrigin);
    const originId = useId(); // 시선 변경 출처 태그 — 브레드크럼이 "내가 옮긴 것"만 기억하게 한다

    // ── 연동 행 — 보드와 같은 상태 하나(펼침 ≡ 연동). 이 행의 params 가 존·카운트의 유일한 재료다.
    const { themeStages, linkedId, setLinked } = useLinkedThemeStage();
    const linked = useMemo(() => (linkedId === null ? null : themeStages.find((s) => s.id === linkedId) ?? null), [themeStages, linkedId]);
    const linkedParams = useMemo(() => (linked ? themeParamsOf(linked) : null), [linked]);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);

    // ── 그날 스냅샷(복기 파생) — 정규화 패널과 같은 공용 LRU 캐시.
    const snapQ = useDaySnapshot(subject?.date ?? null);
    const stocks = snapQ.data?.stocks;

    const setSessionUi = useWorkbench((s) => s.setSessionUi); // 렌즈·되돌아가기 앵커용(스크럽은 전역 시각으로 이관)

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

    // ── 표시 분 = **전역 시각 직결**(2026-09-09 양방향 수렴 — 복기 보드·뉴스와 같은 focus.time 채널).
    // 옛 로컬 스크럽(sessionUi, subjectKey 낟알)은 은퇴했다 — 차트 클릭·a/d·툴바 슬라이더·아래 타임라인
    // 바가 전부 setTime 하나로 이 값을 민다. focus.time 이 없으면(하루 선택) 기본 사다리가 채운다
    // (그날 첫 타점 → 마지막 봉 — 빈 화면을 만들지 않는다, defaultMinuteOf).
    const chartPoints = useChartPoints(subject?.code ?? "", subject?.date ?? "");
    const minute = useMemo(() => {
        if (!subject) return null;
        const m = defaultMinuteOf(focusTime, chartPoints, minuteRange?.hi ?? null);
        // 표시 클램프만 — 장전 시각(뉴스 점프 08:20 등)이 오면 첫 봉에 세운다(빈 산점 + 라벨/자리 불일치
        // 방지). 전역 focus.time 은 되쓰지 않는다(패널이 전역을 정정하기 시작하면 루프 모양이 된다).
        if (m === null || !minuteRange) return m;
        return Math.min(Math.max(m, minuteRange.lo), minuteRange.hi);
    }, [subject, focusTime, chartPoints, minuteRange]);

    // ── 단면 — 분 단위 memo. 파라미터는 의존성이 아니다(존 판정은 서수의 하류 — 드래그가 단면을 재굽지 않게).
    const section: ScrubSection | null = useMemo(() => {
        if (!stocks || stocks.length === 0 || !subject || minute === null) return null;
        return scrubSectionOf(stocks, subject.date, fmtMin(minute));
    }, [stocks, subject, minute]);

    // ── 테마 동료 — 읽기 시점 인덱스(멤버십은 굽지 않는다).
    // 기본은 소속 전 테마의 **합집합**인데, 그러면 teal 점 3개를 세어도 서로 다른 테마라 "동료 ≥ 3" 이
    // 불통과일 수 있다(판정은 테마 단위 AND · 테마 사이 ∃ — 분해 금지). 그 눈-숫자 어긋남을 **렌즈**가
    // 푼다: 칩 줄에서 테마 하나를 고르면 그 테마 멤버만 동료로 남는다(= 판정 단위와 화면이 같아진다).
    const themesView = useThemeIndex();
    // ⚠ 아래 시선-파생 memo 들의 의존성은 subject 객체가 아니라 **원시값(code·date)** 이다 — useSubject 가
    // focus.time 마다 새 객체를 내놓아서, 객체를 걸면 타임라인 드래그 1틱마다 이 사슬(동료 맵·색·트랙)이
    // 통째로 재계산된다(트랙은 390분 × 정렬 — 공짜가 아니다). 분을 실제로 먹는 memo(section·verdicts)만 minute 을 따른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const subjectThemes = useMemo(() => (subject ? themesView.index.themesOf(subject.code) : []), [themesView.index, subject?.code]);
    // 렌즈 — 세션 수명(sessionUi). **소속 아니면 전체로 접는 건 순수 파생**이다: 시선이 바뀔 때마다
    // 저장값을 지우는 effect 를 두면 "돌아왔는데 렌즈가 없다"가 되고, 지우는 시점 경쟁도 생긴다.
    // 저장값은 남기고 읽을 때만 거르므로, 그 테마에 속한 종목으로 돌아오면 렌즈도 같이 살아난다.
    const rawLens = useWorkbench((s) => s.sessionUi["themeRank"]?.["lens"]) as string | undefined;
    const lens = rawLens !== undefined && subjectThemes.includes(rawLens) ? rawLens : null;
    // 동료 → 시선과 **공유하는 테마들**(칩 줄 순서). 색·겹침·클릭 대상이 전부 이 맵 하나에서 나온다.
    // 렌즈는 여기서 거르지 않는다 — 강조만 바꾸므로(scatterLayer), 옅게 남은 다른 테마 동료도 집힌다.
    const peerThemes = useMemo(() => {
        const out = new Map<string, string[]>();
        if (!subject) return out;
        for (const t of subjectThemes)
            for (const c of themesView.index.codesOf(t)) {
                if (c === subject.code) continue;
                const list = out.get(c);
                if (list) list.push(t);
                else out.set(c, [t]);
            }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [themesView.index, subject?.code, subjectThemes]);
    // 테마 색 — 이름 해시(결정론) + 이 시선 안에서만 충돌 회피. 산점 점과 칩 스와치의 단일 출처.
    const themeColors = useMemo(() => themeColorMap(subjectThemes), [subjectThemes]);
    // 멤버십 재료가 아직/영영 없을 수 있다 — 빈 인덱스는 "동료 0"이 아니라 **모름**이다. 회색 층이 있던
    // 시절엔 화면이 살아 있는 게 보였지만, 지금은 점 하나짜리 빈 평면이라 말해주지 않으면 오독한다.
    const themesStatus = themesView.error ? "error" : themesView.ready ? "ready" : "loading";

    // ── 컷선 드래그 — 미리보기는 로컬, 커밋은 손 뗄 때 한 번(Rail 규약) **연동 행의 술어로**.
    const [preview, setPreview] = useState<Partial<ThemeStrengthParams> | null>(null);
    const eff: ThemeStrengthParams = useMemo(
        () => ({ ...(linkedParams ?? DEFAULT_THEME_STRENGTH), ...preview }),
        [linkedParams, preview],
    );
    // 카운트만 한 프레임 뒤로 — 존 틴트·점은 즉시 따라와야 손이 안 끌린다.
    const countParams = useDeferredValue(eff);
    const count = useThemeStrengthStats(countParams);

    // ── 테마별 진단 — 시선 종목의 테마마다 "그 테마 **단독으로** 활성 조건을 다 만족하나"(∃ 를 접기 전 재료).
    // 헤더 카운트(모수 전체 ∃)와 층이 다르다: 저건 "몇 개가 통과하나", 이건 "지금 이 종목을 어느 테마가
    // 통과시키나". eff(컷선 미리보기 포함)를 쓴다 — 끌면 ✓/✗ 가 그 자리에서 따라와야 손이 맥락을 잃지 않는다.
    // 활성 조건이 없으면 전부 참이라 표식이 소음이 된다 → null(칩은 이름만).
    const proj = useMemo(() => themeProjectionOf(themesView.index), [themesView.index]);
    const verdicts = useMemo((): ReadonlyMap<string, ThemeVerdict> | null => {
        if (!subject || !section || linkedParams === null || !anyConditionOn(eff)) return null;
        return new Map(themeVerdicts(subject.code, section, eff, proj).map((v) => [v.theme, v] as const));
    }, [subject, section, linkedParams, eff, proj]);

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

    // ── 줌 도메인 — 세션 수명(sessionUi)·날짜 낟알. 읽을 때 거른다(날짜가 다르면 없는 셈 — 지우는 손 없음).
    // x·y 폭은 항상 같다(전체 도메인이 정사각이고, 휠은 균등·팬은 폭 보존이라 불변이 유지된다).
    const rawZoom = useWorkbench((s) => s.sessionUi["themeRank"]?.["zoom"]) as ZoomDom | undefined;
    const zoom = rawZoom !== undefined && subject !== null && rawZoom.date === subject.date ? rawZoom : null;
    const dom = useMemo(
        () => zoom ?? { x0: 1, x1: maxRank, y0: 1, y1: maxRank },
        [zoom, maxRank],
    );
    const domSpan = Math.max(dom.x1 - dom.x0, 1);
    const scales = useMemo(() => {
        const span = Math.max(dom.x1 - dom.x0, 1);
        return {
            x: (ord: number): number => box.left + ((Math.min(ord, maxRank) - dom.x0) / span) * box.width,
            y: (ord: number): number => box.top + ((Math.min(ord, maxRank) - dom.y0) / span) * box.height,
        };
    }, [box.left, box.top, box.width, box.height, maxRank, dom]);
    const ordAtX = (px: number): number =>
        Math.max(1, Math.min(maxRank, Math.round(dom.x0 + ((px - box.left) / Math.max(box.width, 1)) * domSpan)));
    const ordAtY = (py: number): number =>
        Math.max(1, Math.min(maxRank, Math.round(dom.y0 + ((py - box.top) / Math.max(box.height, 1)) * domSpan)));
    /** 도메인 시작점 클램프 — 폭을 유지한 채 [1, maxRank] 안에 눕힌다(휠·팬 공용). */
    const clampDom0 = (v: number, span: number): number => Math.max(1, Math.min(v, maxRank - span));

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

    // 존(틴트·컷선·타임라인 띠)은 연동 행이 있을 때만. 산점의 점은 존을 **표시하지 않는다** — 자리와
    // 칩 숫자가 이미 말한다(scatterLayer 머리 주석).
    const zone = linkedParams === null ? null : { rateN: eff.zoneRateN, amountN: eff.zoneAmountN };
    // 집기 대상 = **그려진 것**뿐(시선 + 동료). 안 그린 점에 툴팁이 뜨면 유령을 짚는 셈이다.
    const hitPoints = useMemo(
        () => participants.filter((p) => p.code === subject?.code || peerThemes.has(p.code)),
        [participants, peerThemes, subject],
    );

    // ── 꼬리 — 상대 오프셋(설정 영속, 빈 배열 = 꺼짐). 재료는 스크럽과 같은 공용 단면 캐시(sectionSeries)라
    // 오프셋 단면 몇 개는 공짜에 가깝다. 장 시작보다 이른 꼭짓점은 거른다(결손은 결손 — 당겨 그리지 않는다).
    const trailOffsets = useWorkbench((s) => s.themeTrailOffsets);
    const trailMinutes = useMemo(() => {
        if (minute === null || !minuteRange || trailOffsets.length === 0) return [];
        return trailOffsets.map((o) => minute - o).filter((m) => m >= minuteRange.lo).sort((a, b) => a - b);
    }, [trailOffsets, minute, minuteRange]);
    const trails = useMemo((): Trail[] | null => {
        if (trailMinutes.length === 0 || !stocks || !subject || !section) return null;
        const secs = trailMinutes.map((m) => scrubSectionOf(stocks, subject.date, fmtMin(m)));
        const peers: Trail[] = [];
        let subjTrail: Trail | null = null;
        for (const p of hitPoints) {
            const isSubj = p.code === subject.code;
            const themes = peerThemes.get(p.code);
            const pts: (TrailPoint | null)[] = secs.map((s) => {
                const r = s.ranksOf(p.code);
                return r !== null && r.rate !== null && r.amount !== null ? { rate: r.rate, amount: r.amount } : null;
            });
            pts.push({ rate: p.rate, amount: p.amount }); // 머리 = 지금 분(산점의 점과 같은 자리)
            const t: Trail = {
                color: isSubj ? ACTIVE : themeColors.get(themes?.[0] ?? "") ?? ACTIVE,
                dim: !isSubj && lens !== null && !(themes ?? []).includes(lens),
                pts,
            };
            if (isSubj) subjTrail = t;
            else peers.push(t);
        }
        if (subjTrail) peers.push(subjTrail); // 시선 꼬리가 맨 위(나중에 그린 게 위)
        return peers;
    }, [trailMinutes, stocks, subject, section, hitPoints, peerThemes, themeColors, lens]);

    const layers = useMemo(() => {
        const scatter = scatterLayer({ points: participants, subject: subject?.code ?? null, peerThemes, colorOf: themeColors, lens, scales, compact: trails !== null });
        return trails !== null ? [trailLayer({ trails, scales }), scatter] : [scatter];
    }, [participants, subject, peerThemes, themeColors, lens, scales, trails]);
    // 축 눈금 — 배경 점이 하던 좌표 감각을 대신한다(균등 4~5개, 정확한 컷 값은 컷선 라벨이 말한다).
    // 줌 도메인을 따른다 — 확대하면 그 구간의 서수가 눈금으로 선다(축마다 따로 — 팬으로 중심이 갈린다).
    const ticks = useMemo(
        () => ({ x: tickListOf(dom.x0, dom.x1, maxRank), y: tickListOf(dom.y0, dom.y1, maxRank) }),
        [dom, maxRank],
    );

    /** 그 자리에서 가장 가까운 점(HIT_R 안). 호버 툴팁과 클릭 이동이 **같은 판정**을 쓴다.
     *  확대로 클립돼 안 보이는 점은 제외 — 화면과 손이 어긋나면 가장자리에서 유령을 집는다. */
    const nearestAt = (x: number, y: number): { code: string; rate: number; amount: number } | null => {
        let best: { code: string; rate: number; amount: number } | null = null;
        let bestD = HIT_R * HIT_R;
        for (const p of hitPoints) {
            const px = scales.x(p.amount);
            const py = scales.y(p.rate);
            if (px < box.left || px > box.left + box.width || py < box.top || py > box.top + box.height) continue;
            const dx = px - x;
            const dy = py - y;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = p; }
        }
        return best;
    };

    // ── 되돌아가기 앵커 — 이 패널에서 **점을 눌러 떠나기 전** 시선. 세션 수명(sessionUi).
    // 돌아왔으면 앵커는 없는 것이다 — 읽기 시점 파생이라 지우는 손이 따로 없다.
    const rawAnchor = useWorkbench((s) => s.sessionUi["themeRank"]?.["origin"]) as { code: string; date: string; time: string | null } | undefined;
    const anchor = rawAnchor !== undefined && subject && rawAnchor.code !== subject.code ? rawAnchor : null;
    // 남이 시선을 옮겼으면 앵커는 유령이다(내가 떠난 자리가 아니다) — 종목이 실제로 바뀐 순간에만 지운다
    // (마운트에서 지우면 프리셋 전환에 앵커가 날아간다 — sessionUi 를 쓴 이유가 그거다).
    const prevCode = useRef(subject?.code ?? null);
    useEffect(() => {
        const c = subject?.code ?? null;
        if (prevCode.current === c) return;
        prevCode.current = c;
        if (lastFocusOrigin !== originId) setSessionUi("themeRank", "origin", undefined);
    }, [subject?.code, lastFocusOrigin, originId, setSessionUi]);

    /**
     * 점 클릭 = 그 종목으로 이동. **동료(teal)만 집힌다** — 회색 점까지 열었더니 오클릭이 잦았다
     * (2026-09-07 실사용). 규칙은 "보이는 대로": 렌즈가 켜져 있으면 그 테마 멤버만 동료라, 회색으로
     * 내려앉은 다른 테마 동료도 안 집힌다(집으려면 렌즈를 끄면 된다 — 화면과 손이 어긋나지 않게).
     * 시각은 전역 하나다(focus.time) — setCode 가 time 을 유지하므로 "같은 시각의 순위 평면에서 옆
     * 종목으로"는 공짜다(옛 sessionUi 스크럽 이월의 후계). 단 하루 선택(focus.time=null)이면 표시 중이던
     * 기본 분을 **실체화**해서 간다 — 안 하면 새 종목의 기본 사다리(그 종목의 첫 타점)로 시각이 튄다.
     */
    const navigate = (code: string): void => {
        if (!subject || code === subject.code || !peerThemes.has(code)) return;
        // 앵커는 처음 떠날 때만 찍는다 — 연쇄로 몇 다리를 건너도 출발점은 하나.
        if (!anchor) setSessionUi("themeRank", "origin", { code: subject.code, date: subject.date, time: focusTime });
        setHover(null); // 옮겨간 평면에 옛 종목 툴팁이 남지 않게(마우스가 멈춰 있으면 정정될 기회가 없다)
        if (focusTime === null && minute !== null) setFocus({ date: subject.date, code, time: fmtHms(minute) }, originId);
        else setCode(code, originId);
    };

    // ── 컷선 드래그(위 SVG 층이 포인터 소유 — 캔버스는 포인터를 안 받는다). 연동 행 없으면 손짓도 없다.
    const dragRef = useRef<"rate" | "amount" | null>(null);
    const downRef = useRef<{ x: number; y: number } | null>(null); // 클릭 판정용 누른 자리(끌렸으면 클릭이 아니다)
    // 팬 — 확대 중 빈 곳 좌드래그. 시작 시점의 도메인을 들고 가서 이동량을 절대로 셈한다(누적 오차 없음).
    const panRef = useRef<{ x: number; y: number; dom: ZoomDom } | null>(null);
    const cutX = scales.x(eff.zoneAmountN); // 세로선(거래대금 컷)
    const cutY = scales.y(eff.zoneRateN); // 가로선(등락률 컷)
    // 확대로 컷이 도메인 밖이면 선과 **배지를 통째로 숨긴다** — 가장자리에 클램프된 배지를 잘못 잡으면
    // 손 뗄 때 저장된 N/M 이 도메인 안 값으로 덮인다(조건 파괴). 밖의 컷은 헤더 스텝퍼로만 다듬는다.
    // 단 **드래그 중인 축은 예외** — 안 그러면 드래그하다 커서가 상자를 벗어나는 순간 잡고 있던 배지가
    // 눈앞에서 사라진 채 커밋되고, 그 뒤 그림에서 되잡을 손이 없다(드래그 중엔 pointermove 마다
    // setPreview 재렌더가 돌아 이 값이 따라온다).
    const cutXVisible = dragRef.current === "amount" || (cutX >= box.left && cutX <= box.left + box.width);
    const cutYVisible = dragRef.current === "rate" || (cutY >= box.top && cutY <= box.top + box.height);
    /**
     * 컷선의 **손잡이 = 라벨 배지**(2026-09-07 사용자 확정). 선 전체를 잡던 옛 판정(선에서 7px)은
     * 산점 위를 가로지르는 띠 두 개를 클릭 불가 지대로 만들어, 그 위의 점을 못 집었다.
     * 배지는 그림 밖(아래·오른쪽 끝)에 있어 점과 겹치지 않는다 — 손짓 둘이 자리를 안 다툰다.
     * 이 자리 셈이 **판정과 렌더의 단일 출처**다: 아래 JSX 가 같은 값으로 배지를 그린다.
     */
    // 배지는 그림 **밖**(아래·오른쪽 여백)에 앉는다 — 점과 자리를 다투지 않게. 다만 축 방향으로는
    // 상자 범위 안에 머물러야 잡힌다(컷이 끝으로 가면 여백 밖으로 나가 손이 안 닿는다).
    const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));
    const cutLabels = {
        amount: { x: clamp(cutX - LBL_W / 2, box.left, box.left + box.width - LBL_W), y: box.top + box.height + 3 },
        rate: { x: box.left + box.width + 4, y: clamp(cutY - LBL_H / 2, box.top, box.top + box.height - LBL_H) },
    };
    const inLabel = (x: number, y: number, l: { x: number; y: number }): boolean =>
        x >= l.x - LBL_PAD && x <= l.x + LBL_W + LBL_PAD && y >= l.y - LBL_PAD && y <= l.y + LBL_H + LBL_PAD;
    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (e.button !== 0) { downRef.current = null; return; } // 우클릭·휠클릭은 드래그도 클릭도 아니다
        // (버리지 않으면 SVG 밖에서 뗀 좌클릭의 자리가 남아 다음 우클릭이 그 자리 클릭으로 오인된다)
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        downRef.current = { x, y };
        if (linkedParams !== null) {
            const target = cutXVisible && inLabel(x, y, cutLabels.amount) ? "amount" : cutYVisible && inLabel(x, y, cutLabels.rate) ? "rate" : null;
            if (target) {
                dragRef.current = target;
                e.currentTarget.setPointerCapture(e.pointerId);
                return;
            }
        }
        // 확대 중이면 빈 곳 누름 = 팬 후보. 클릭(무이동)이면 up 의 슬롭 판정이 그대로 점 클릭으로 살린다.
        if (zoom !== null) {
            panRef.current = { x, y, dom: zoom };
            e.currentTarget.setPointerCapture(e.pointerId);
        }
    };
    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
        const rect = e.currentTarget.getBoundingClientRect();
        const drag = dragRef.current;
        if (drag) {
            if (drag === "amount") setPreview((p) => ({ ...p, zoneAmountN: ordAtX(e.clientX - rect.left) }));
            else setPreview((p) => ({ ...p, zoneRateN: ordAtY(e.clientY - rect.top) }));
            return;
        }
        const pan = panRef.current;
        if (pan) {
            const dx = e.clientX - rect.left - pan.x;
            const dy = e.clientY - rect.top - pan.y;
            const span = pan.dom.x1 - pan.dom.x0;
            const x0 = clampDom0(pan.dom.x0 - (dx / Math.max(box.width, 1)) * span, span);
            const y0 = clampDom0(pan.dom.y0 - (dy / Math.max(box.height, 1)) * span, span);
            setSessionUi("themeRank", "zoom", { date: pan.dom.date, x0, x1: x0 + span, y0, y1: y0 + span });
        }
    };
    /**
     * 휠 = 커서 중심 확대/축소(그림 상자 안에서만). 전부 보이는 배율에 닿으면 줌 자체를 해제한다.
     *
     * ⚠ useOverlayZoom(d3-zoom) 을 안 쓴 이유: 이 SVG 는 포인터 제스처(컷 배지 드래그·점 클릭·팬)를
     * 이미 직접 소유하는데, d3-zoom 은 mousedown 을 stopImmediatePropagation 으로 삼켜 그 셋이 다
     * 죽는다(useOverlayZoom 머리 주석). 저 훅이 손수짜기를 말리는 근거였던 휠 delta 단위 정규화도
     * 여기선 **부호만 읽는 고정 계단(1.25×)** 이라 통째로 비켜간다 — 크기를 안 쓰니 단위가 없다.
     * norm 패널이 폐기한 "본문 더블클릭 리셋"도 여기선 **빈 곳 한정 + 확대 중 한정**이라 오발이 없다.
     */
    const onWheel = (e: React.WheelEvent<SVGSVGElement>): void => {
        if (!subject || maxRank <= ZOOM_MIN_SPAN + 1) return; // 유니버스가 손바닥만 하면 줌이 무의미하다
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        if (px < box.left || px > box.left + box.width || py < box.top || py > box.top + box.height) return;
        const f = e.deltaY < 0 ? 1 / 1.25 : 1.25;
        const next = Math.max(domSpan * f, ZOOM_MIN_SPAN);
        if (next >= maxRank - 1) {
            if (zoom !== null) setSessionUi("themeRank", "zoom", undefined);
            return;
        }
        const ux = (px - box.left) / Math.max(box.width, 1);
        const uy = (py - box.top) / Math.max(box.height, 1);
        const x0 = clampDom0(dom.x0 + ux * domSpan - ux * next, next);
        const y0 = clampDom0(dom.y0 + uy * domSpan - uy * next, next);
        setSessionUi("themeRank", "zoom", { date: subject.date, x0, x1: x0 + next, y0, y1: y0 + next });
    };
    /** 빈 곳 더블클릭 = 원위치. 점 위는 제외 — 그 자리는 이미 클릭(동료 이동)의 손짓이다. */
    const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>): void => {
        if (zoom === null) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (nearestAt(e.clientX - rect.left, e.clientY - rect.top) !== null) return;
        setSessionUi("themeRank", "zoom", undefined);
    };
    const commitDrag = (e: React.PointerEvent<SVGSVGElement>): void => {
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
    // 손 뗄 때 = 컷선 커밋 **또는** 점 클릭(둘은 배타다 — 컷선을 잡았으면 그 손은 클릭이 아니다).
    // 팬이었어도 슬롭 넘게 끌렸으면 아래 판정이 클릭을 스스로 접는다.
    const onPointerUp = (e: React.PointerEvent<SVGSVGElement>): void => {
        const down = downRef.current;
        downRef.current = null;
        panRef.current = null;
        if (dragRef.current) {
            commitDrag(e);
            return;
        }
        if (!down) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (Math.abs(x - down.x) > CLICK_SLOP || Math.abs(y - down.y) > CLICK_SLOP) return; // 끌린 손은 클릭이 아니다
        const hit = nearestAt(x, y);
        if (hit) navigate(hit.code); // 동료가 아니면 navigate 가 스스로 접는다(집기 판정은 한 곳)
    };
    // 터치·제스처 가로채기로 up 이 안 올 때 — 드래그는 접어 커밋하고(Rail 규약), 클릭으로는 오인하지 않는다.
    const onPointerCancel = (e: React.PointerEvent<SVGSVGElement>): void => {
        downRef.current = null;
        panRef.current = null;
        if (dragRef.current) commitDrag(e);
    };

    // ── 타임라인 재료 — 트랙(분당 서수, 시선/날짜당 한 번)과 띠 필터(컷 드래그마다 O(분))를 가른다.
    // 띠는 연동 행의 존 기준이므로 연동 없을 땐 트랙 자체를 안 굽는다(~390분 × 정렬 — 공짜가 아니다).
    const hasLink = linkedParams !== null;
    const track = useMemo(
        () => (hasLink && stocks && subject && minuteRange ? subjectOrdinalTrack(stocks, subject.date, subject.code, minuteRange) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hasLink, stocks, subject?.code, subject?.date, minuteRange],
    );
    // 의존성은 **원시값**(zone 은 렌더마다 새 객체 — layers 메모와 같은 함정, 호버 move 마다 재계산·재렌더가 된다).
    const segments = useMemo(
        () => (track && minuteRange && zone !== null ? bandSegmentsOf(track, minuteRange.lo, minuteRange.hi, zone.rateN, zone.amountN) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [track, minuteRange, zone === null, zone?.rateN, zone?.amountN],
    );
    // 타점의 분들 — ▼ 마커(클릭 = 점프, 옛 ↺ 의 후계).
    const pointMinutes = useMemo(
        () => chartPoints.map((t) => {
            const [h, m] = t.split(":");
            return Number(h) * 60 + Number(m);
        }),
        [chartPoints],
    );

    // ── 호버 — 위 SVG 층에서 가까운 점 선형 스캔(수백 개 — 공짜).
    const [hover, setHover] = useState<{ x: number; y: number; code: string; rate: number; amount: number } | null>(null);
    const onHoverMove = (e: React.PointerEvent<SVGSVGElement>): void => {
        if (dragRef.current || panRef.current) { setHover(null); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = nearestAt(x, y);
        setHover(hit ? { x, y, ...hit } : null);
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
                {/* 확대 배지 — 배율 표시 겸 원위치 버튼(빈 곳 더블클릭과 같은 일). 확대 중에만 선다. */}
                {zoom !== null && (
                    <button onClick={() => setSessionUi("themeRank", "zoom", undefined)}
                        title="확대 중 — 클릭하면 원위치(그림 빈 곳 더블클릭과 같다)"
                        style={backBtn}>
                        {(Math.max(maxRank - 1, 1) / domSpan).toFixed(1)}×
                    </button>
                )}
                {/* 되돌아가기 — 산점에서 점을 눌러 떠난 출발점. 방문기록(Alt+W/S)과 달리 몇 다리를 건너도 한 번에 온다. */}
                {anchor && (
                    <button onClick={() => setFocus({ date: anchor.date, code: anchor.code, time: anchor.time }, originId)}
                        title="이 패널에서 점을 눌러 떠나기 전 종목으로 돌아간다"
                        style={backBtn}>
                        ← {nameOf(anchor.code)}
                    </button>
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
            {(themeStages.length > 0 || subjectThemes.length > 0 || (subject !== null && themesStatus !== "ready")) && (
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
                    {/* 오른쪽 = 시선 종목의 테마(렌즈·진단). 왼쪽 조건 칩과 뜻이 다르다 — 저긴 '무엇을 편집 중',
                        여긴 '무엇을 보는 중'. 조건 행이 없어도 이 줄은 선다(갈라 보기는 조건과 무관하다). */}
                    {(subjectThemes.length > 0 || (subject !== null && themesStatus !== "ready")) && (
                        <ThemeLensStrip themes={subjectThemes} lens={lens} verdicts={verdicts} colorOf={themeColors} status={themesStatus}
                            onPick={(t) => setSessionUi("themeRank", "lens", t ?? undefined)} />
                    )}
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
                        {linkedParams !== null && (() => {
                            // 존 사각 = 서수 [1..컷] 영역을 그림 상자로 오려낸 것 — 줌 도메인 밖으로 안 넘치게.
                            const zx0 = clamp(scales.x(1), box.left, box.left + box.width);
                            const zy0 = clamp(scales.y(1), box.top, box.top + box.height);
                            const zx1 = clamp(cutX, box.left, box.left + box.width);
                            const zy1 = clamp(cutY, box.top, box.top + box.height);
                            return <rect x={zx0} y={zy0} width={Math.max(0, zx1 - zx0)} height={Math.max(0, zy1 - zy0)} fill="var(--accent-soft)" opacity={0.7} />;
                        })()}
                        {/* 눈금·격자 — 무관 종목 회색 층을 지운 자리(2026-09-07). 점이 성길 때 좌표를 읽을 유일한 근거다.
                            x 눈금 글자는 상자 **안** 바닥에 붙인다 — 축 아래는 컷선 라벨(손잡이)이 이미 쓰고 있다. */}
                        {ticks.x.map((t) => (
                            <g key={`x${t}`}>
                                <line x1={scales.x(t)} y1={box.top} x2={scales.x(t)} y2={box.top + box.height} stroke="var(--border-subtle)" />
                                <text x={scales.x(t)} y={box.top + box.height - 4} textAnchor="middle" style={axisText}>{t}</text>
                            </g>
                        ))}
                        {ticks.y.map((t) => (
                            <g key={`y${t}`}>
                                <line x1={box.left} y1={scales.y(t)} x2={box.left + box.width} y2={scales.y(t)} stroke="var(--border-subtle)" />
                                <text x={box.left - 6} y={scales.y(t) + 3} textAnchor="end" style={axisText}>{t}</text>
                            </g>
                        ))}
                        <line x1={box.left} y1={box.top} x2={box.left} y2={box.top + box.height} stroke="var(--border-strong)" />
                        <line x1={box.left} y1={box.top + box.height} x2={box.left + box.width} y2={box.top + box.height} stroke="var(--border-strong)" />
                        <text x={box.left - 28} y={box.top + box.height / 2} textAnchor="middle" style={axisText} transform={`rotate(-90 ${box.left - 28} ${box.top + box.height / 2})`}>등락률 순위 ↓</text>
                        <text x={box.left + box.width / 2} y={size.h - 8} textAnchor="middle" style={axisText}>거래대금 순위 →</text>
                    </svg>

                    <div style={{ position: "absolute", inset: 0 }}>
                        {/* 클립은 확대 중에만 — 도메인 밖 점·꼬리가 여백(축 글자·손잡이 자리)을 밟지 않게. */}
                        <CanvasLayers layers={layers} width={size.w} height={size.h} clip={zoom !== null ? box : null} />
                    </div>

                    {/* 위 SVG — 컷선·손잡이·호버·줌(포인터 소유). 컷선은 연동 행이 있을 때만. */}
                    <svg width={size.w} height={size.h}
                        style={{ ...overSvg, cursor: hover && peerThemes.has(hover.code) ? "pointer" : zoom !== null ? "grab" : undefined }}
                        onPointerDown={onPointerDown}
                        onPointerMove={(e) => { onPointerMove(e); onHoverMove(e); }}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerCancel}
                        onPointerLeave={() => setHover(null)}
                        onWheel={onWheel}
                        onDoubleClick={onDoubleClick}>
                        {linkedParams !== null && (
                            <>
                                {/* 선은 표시만 — 잡는 곳은 아래 배지다(선을 잡게 두면 그 띠 위의 점을 못 집는다).
                                    확대로 컷이 도메인 밖이면 선·배지를 같이 접는다(위 cutXVisible 주석 — 조건 파괴 방지). */}
                                {cutXVisible && (
                                    <line x1={cutX} y1={box.top} x2={cutX} y2={box.top + box.height} stroke={FILTER} strokeWidth={1.5} strokeDasharray="5 3" />
                                )}
                                {cutYVisible && (
                                    <line x1={box.left} y1={cutY} x2={box.left + box.width} y2={cutY} stroke={FILTER} strokeWidth={1.5} strokeDasharray="5 3" />
                                )}
                                <g style={{ fontSize: 10, fill: "#fff", fontVariantNumeric: "tabular-nums" }}>
                                    {cutXVisible && (
                                        <g style={{ cursor: "ew-resize" }}>
                                            <title>끌어서 거래대금 컷 옮기기(한 위씩은 위 손잡이 줄의 ±)</title>
                                            <rect x={cutLabels.amount.x} y={cutLabels.amount.y} width={LBL_W} height={LBL_H} rx={3} fill={FILTER} />
                                            <text x={cutLabels.amount.x + LBL_W / 2} y={cutLabels.amount.y + 11} textAnchor="middle">대금 {eff.zoneAmountN}</text>
                                        </g>
                                    )}
                                    {cutYVisible && (
                                        <g style={{ cursor: "ns-resize" }}>
                                            <title>끌어서 등락률 컷 옮기기(한 위씩은 위 손잡이 줄의 ±)</title>
                                            <rect x={cutLabels.rate.x} y={cutLabels.rate.y} width={LBL_W} height={LBL_H} rx={3} fill={FILTER} />
                                            <text x={cutLabels.rate.x + LBL_W / 2} y={cutLabels.rate.y + 11} textAnchor="middle">등락 {eff.zoneRateN}</text>
                                        </g>
                                    )}
                                </g>
                            </>
                        )}
                        {hover && (() => {
                            // 자리는 순수 셈(tooltipBox) — 경계에서 플립·클램프, 폭은 글자에서.
                            // 겹친 동료는 링 하나로 둘째 테마까지만 말한다 — 나머지는 여기서 전부 편다.
                            const ts = peerThemes.get(hover.code);
                            const text = `${nameOf(hover.code)} · 등락 ${hover.rate}위 · 대금 ${hover.amount}위${ts ? ` · ${ts.join("·")} · 클릭 = 이동` : ""}`;
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

            {/* footer = 시각 타임라인 + 꼬리 설정 — 조건 폼은 없다(조건은 보드 행·컷선이 전부다).
                띠 = 시선 종목의 존 재적(연동 행 N/M 기준, 끊김 = 이탈/결손) · ▼ = 타점(클릭 = 점프) ·
                옅은 하늘 띠 = 꼬리 창(지금−최대오프셋). 스크럽 = setTime — 전역 시각의 큰 손잡이다
                (Taskbar TimeControl 과 같은 채널의 다른 손). 차트 표식·복기 보드·뉴스가 같이 움직인다. */}
            {subject && section && minuteRange && (
                <div style={footer}>
                    <span style={{ ...cond, flexShrink: 0 }}>시각</span>
                    <TimelineBar lo={minuteRange.lo} hi={minuteRange.hi} minute={minute}
                        pointMinutes={pointMinutes} segments={segments}
                        trailFrom={trailMinutes.length > 0 ? trailMinutes[0] : null}
                        // 동등값 가드 — TimelineBar 는 pointermove 마다 부르는데(분 안 바뀌어도), setTime 은
                        // 같은 값이어도 새 focus 객체를 만들어 전역 재렌더를 일으킨다(Taskbar range 는 onChange 라 무풍).
                        onScrub={(m) => { const t = fmtHms(m); if (useWorkbench.getState().focus.time !== t) setTime(t); }} />
                    <TrailControl />
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
const backBtn: CSSProperties = { fontSize: 11, color: "var(--accent-primary)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--accent-primary)", borderRadius: 8, padding: "0 6px", background: "var(--accent-soft)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 };
const chipsRow: CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderBottom: "1px solid var(--border-subtle)", overflowX: "auto", flexShrink: 0 };
// border 는 낱개 속성으로 — 활성 칩이 borderColor 만 덮는데, 축약(border)과 섞이면 React 가 경고한다.
const chipBtn: CSSProperties = { fontSize: 10.5, color: "var(--text-secondary)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--border-default)", borderRadius: 8, padding: "1px 8px", background: "transparent", cursor: "pointer", whiteSpace: "nowrap" };
const cond: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };
