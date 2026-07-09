import { create } from "zustand";
import { type HypothesisFilterExpr, type PointAttr, type BoardFilterExpr, type BoardFilterMode, type BoardFilterGroup, defaultParams } from "@trade-data-manager/market/domain";
import { kstToday } from "../lib/date.js";

// 연동버스 = 2계층(레이아웃 라이브러리보다 이게 설계 본질):
//  - Focus(커서, scalar): date·code·time. 차트·주석 패널이 축별 selector 로 구독.
//  - Scope(렌즈, 집합): theme. 리스트형 패널 필터(차트 안 건드림).
// 무효화규칙: date 최상위. 이 슬라이스는 클라에 유니버스 멤버십이 없어 code 유효성 판정은 보류하고,
// date 변경시 time 을 리셋한다. code 변경시엔 time 을 항상 유지한다(같은시각 횡적비교).

export type ChartPriceMode = "krx" | "un"; // 분봉 등락률 기준 시장(UN=통합, KRX)
export type NewsSearchEngine = "naver" | "google"; // HTS 뉴스 제목 클릭 시 웹 검색 엔진(네이버=제목+날짜, 구글=제목만)

export interface Focus {
    date: string; // YYYY-MM-DD
    code: string; // 종목코드
    time: string | null; // HH:MM:SS, 분봉 마커. null = 마커 없음
}

export interface Scope {
    // 리스트 필터 렌즈(방송축). null = 미적용. theme 은 시트 멤버십(현재 rich).
    theme: string | null;
}

// 검색 컨텍스트(Focus와 독립된 2번째 스칼라 축). 일봉 봉 클릭 = "작업공간(Focus)을 안 옮기고
// (종목, 그 날짜)만 뉴스에서 조회". null = 검색 모드 아님(뉴스 패널이 Focus 를 따라감).
// 종목이 바뀌면(setCode/setFocus 로 code 변경) 자동 해제 → Focus 복귀. 나중에 N개 명명 컨텍스트로 일반화될 씨앗.
export interface Search {
    code: string;
    date: string; // YYYY-MM-DD
}

// 보드 설정 — 전역 설정 모달(사이드바)이 편집, 각 보드가 구독. 패널별 gear 대신 전역 1개.
export interface ThemeBoardSettings {
    showIndividuals: boolean;
    showUnclassified: boolean;
    // 종목 배제 필터는 설정이 아니라 별도 "이슈 필터" 패널(store.boardFilter, DNF·그룹별 dim/hide)로 이관.
}
export interface ReplayBoardSettings {
    amountN: number; // 거래대금 top-N
    rateN: number; // 등락률 top-N
}
// 차트 이동·줌 설정 — a/d(±1봉)·shift+a/d(±jumpBars)·f(줌 토글). 봉 수는 사용자 조절.
export interface ChartSettings {
    jumpBars: number; // shift+a/d 이동 봉 수
    minuteZoomBars: number; // f 줌인 분봉 봉 수(현재 시각 중심)
    dailyZoomBars: number; // f 줌인 일봉 봉 수
    dailyZoomOutBars: number; // f 줌아웃 일봉 봉 수(~1년)
}

interface WorkbenchState {
    focus: Focus;
    scope: Scope;
    search: Search | null; // 검색 모드 컨텍스트(null = Focus 따라감)
    // 선택된 복기 타점 — (A) "현재 타점에 연결된 가설" 판정 기준. focus.time(리플레이/차트 드리프트로 휘발)과 분리한다.
    // goToPoint(타점 클릭)에서만 세팅 → 시간만 움직이면 유지, 다른 타점으로 이동해야 바뀜. 종목/날짜 바뀌면 해제.
    activePoint: { code: string; date: string; time: string } | null;
    // f 줌(일봉+분봉 전역). anchor=줌 시작 시각 unix초(분봉 중심), null=미줌. 두 차트 패널이 함께 구독 → 같이 확대/축소.
    chartZoom: { anchor: number | null } | null;
    chartPriceMode: ChartPriceMode; // 뷰 설정(축 아님) — 분봉 % 기준 시장
    newsSearchEngine: NewsSearchEngine; // HTS 뉴스 제목 검색 엔진(전역 토글)
    themeBoardSettings: ThemeBoardSettings;
    replaySettings: ReplayBoardSettings;
    chartSettings: ChartSettings;
    reviewTypePresets: string[]; // 타점 셋업 유형 프리셋(숫자키 1~9). 클라 config.
    selectedHypothesisId: string | null; // 가설 선택 축 — 리스트↔그래프 하이라이트 동기화.
    // 가설 필터 draft(DNF: AND그룹들의 OR). 어느 surface(그래프·목록)든 addFilterLeaf 로 채운다.
    // 활성(비어있지 않은 그룹 ≥1)이면 작업셋이 월별→전 기간 필터 모드로 전환(모드 플래그 없이 활성여부가 곧 모드).
    filterDraft: HypothesisFilterExpr;
    // 속성 패싯 선택(2단계 드릴다운). 값 배열(null=미분류). 임시라 저장 안 함. 필터 지우기/불러오기 시 리셋.
    facetSelected: Record<PointAttr, (string | null)[]>;
    // 이슈보드 배제 필터(DNF, 그룹별 dim/hide). 술어 = domain 레지스트리. localStorage 영속.
    boardFilter: BoardFilterExpr;
    // 마지막 Focus 변경의 출처(패널 id). 패널이 "내가 바꿨나(self) vs 남이 바꿨나(external)"를 구분해
    // 자기 자신은 제자리, 남에 의한 변경은 스크롤/동기화하는 데 쓴다. origin 미전달 = null(= 외부 취급).
    lastFocusOrigin: string | null;
    // Focus 액션 — 무효화규칙을 액션 안에 강제한다(패널이 규칙을 재현하지 않게). origin 은 선택적 출처 태그.
    setDate: (date: string, origin?: string) => void;
    setCode: (code: string, origin?: string) => void;
    setTime: (time: string | null, origin?: string) => void;
    setFocus: (next: { date: string; code: string; time: string | null }, origin?: string) => void; // review point 원자적 세팅
    goToPoint: (point: { date: string; code: string; time: string }, origin?: string) => void; // 타점 이동 = focus + activePoint 원자 세팅
    // Scope 액션 — 각 축 독립 토글(차트 안 건드림).
    setTheme: (theme: string | null) => void;
    clearScope: () => void;
    // 검색 모드 — 봉 클릭이 세팅, ✕ 로 해제(null). 종목 바뀌면 setCode/setFocus 가 자동 해제.
    setSearch: (search: Search | null) => void;
    // 뷰 설정
    setChartPriceMode: (mode: ChartPriceMode) => void;
    toggleChartZoom: () => void; // f — 현재 시각 중심 확대 ↔ 축소(전역, 두 차트 동시)
    setNewsSearchEngine: (engine: NewsSearchEngine) => void;
    // 보드 설정(전역 모달이 편집)
    setThemeBoardSettings: (patch: Partial<ThemeBoardSettings>) => void;
    setReplaySettings: (patch: Partial<ReplayBoardSettings>) => void;
    setChartSettings: (patch: Partial<ChartSettings>) => void;
    setReviewTypePreset: (index: number, value: string) => void;
    setSelectedHypothesis: (id: string | null) => void;
    // 가설 필터 편집 — 어느 surface든 같은 액션. 기본 OR: addFilterLeaf 는 새 OR 그룹(있으면 그 자리 순환). AND=드래그로 합침.
    addFilterLeaf: (hypothesisId: string) => void;
    moveLeafToGroup: (fromGroupIndex: number, hypothesisId: string, target: number | "new") => void; // 드래그: 그룹으로=AND / "new"=OR 분리
    removeFilterLeaf: (groupIndex: number, hypothesisId: string) => void;
    toggleFilterNegate: (groupIndex: number, hypothesisId: string) => void;
    removeFilterGroup: (groupIndex: number) => void;
    clearFilter: () => void;
    setFilterExpr: (expr: HypothesisFilterExpr) => void; // 저장 필터 불러오기
    toggleFacet: (attr: PointAttr, value: string | null) => void;
    // 이슈보드 필터 편집 — ＋조건/＋OR그룹·파라미터·그룹 mode. 매 변경 localStorage 저장.
    addBoardGroup: (kind: string) => void;
    addBoardPredicate: (groupIndex: number, kind: string) => void;
    setBoardPredicateKind: (groupIndex: number, predIndex: number, kind: string) => void;
    setBoardPredicateParam: (groupIndex: number, predIndex: number, key: string, value: number) => void;
    removeBoardPredicate: (groupIndex: number, predIndex: number) => void;
    setBoardGroupMode: (groupIndex: number, mode: BoardFilterMode) => void;
    removeBoardGroup: (groupIndex: number) => void;
    clearBoardFilter: () => void;
}

// 이슈보드 필터 — localStorage 영속(그래프위치 선례). 깊은 복사로 불변 편집.
const BOARD_FILTER_KEY = "wb.boardFilter";
function loadBoardFilter(): BoardFilterExpr {
    try {
        const raw = localStorage.getItem(BOARD_FILTER_KEY);
        if (raw) {
            const o: unknown = JSON.parse(raw);
            if (o && typeof o === "object" && Array.isArray((o as BoardFilterExpr).groups)) return o as BoardFilterExpr;
        }
    } catch {
        /* noop */
    }
    return { groups: [] };
}
function persistBoardFilter(expr: BoardFilterExpr): void {
    try {
        localStorage.setItem(BOARD_FILTER_KEY, JSON.stringify(expr));
    } catch {
        /* noop */
    }
}
const cloneBoardGroups = (expr: BoardFilterExpr): BoardFilterGroup[] =>
    expr.groups.map((g) => ({ mode: g.mode, predicates: g.predicates.map((p) => ({ kind: p.kind, params: { ...p.params } })) }));
function updateBoardFilter(expr: BoardFilterExpr, fn: (groups: BoardFilterGroup[]) => void): { boardFilter: BoardFilterExpr } {
    const groups = cloneBoardGroups(expr);
    fn(groups);
    const next = { groups };
    persistBoardFilter(next);
    return { boardFilter: next };
}

// 필터 그룹 깊은 복사(불변 편집용).
const cloneGroups = (expr: HypothesisFilterExpr) => expr.groups.map((g) => g.map((l) => ({ ...l })));
const EMPTY_FACETS = (): Record<PointAttr, (string | null)[]> => ({ outcome: [], type: [] });

const today = kstToday();

// 타점 셋업 유형 프리셋 — 숫자키 1~9. 값·의미는 사용자 config → localStorage 영속(outcome 선례).
const PRESETS_KEY = "wb.reviewTypePresets";
function loadReviewTypePresets(): string[] {
    const out = Array<string>(9).fill("");
    try {
        const raw = localStorage.getItem(PRESETS_KEY);
        if (raw) {
            const arr: unknown = JSON.parse(raw);
            if (Array.isArray(arr)) for (let i = 0; i < 9; i++) if (typeof arr[i] === "string") out[i] = arr[i] as string;
        }
    } catch {
        /* localStorage 없음/파싱 실패 → 빈 프리셋 */
    }
    return out;
}

export const useWorkbench = create<WorkbenchState>((set) => ({
    focus: { date: today, code: "", time: null },
    scope: { theme: null },
    search: null,
    activePoint: null,
    chartZoom: null,
    chartPriceMode: "un",
    newsSearchEngine: "naver",
    themeBoardSettings: { showIndividuals: true, showUnclassified: false },
    replaySettings: { amountN: 80, rateN: 40 },
    chartSettings: { jumpBars: 20, minuteZoomBars: 200, dailyZoomBars: 60, dailyZoomOutBars: 250 },
    reviewTypePresets: loadReviewTypePresets(),
    selectedHypothesisId: null,
    filterDraft: { groups: [] },
    facetSelected: EMPTY_FACETS(),
    boardFilter: loadBoardFilter(),
    lastFocusOrigin: null,

    // date 최상위 무효화: time 리셋 + scope 리셋(테마는 그날 것이라 날짜 넘어가면 stale) + activePoint 해제(타점 날짜 stale).
    setDate: (date, origin) =>
        set((s) => ({ focus: { ...s.focus, date, time: null }, scope: { theme: null }, activePoint: null, chartZoom: null, lastFocusOrigin: origin ?? null })),
    // code 변경 시 time 유지(같은시각 횡적비교) + 검색/activePoint 자동 해제(종목 바뀌면 타점 stale). 같은 종목이면 유지.
    setCode: (code, origin) =>
        set((s) => ({ focus: { ...s.focus, code }, search: code !== s.focus.code ? null : s.search, activePoint: code !== s.focus.code ? null : s.activePoint, lastFocusOrigin: origin ?? null })),
    // 시간만 이동(리플레이/차트 드리프트) = activePoint 유지 → 연결 표시(A) 안 흔들림.
    setTime: (time, origin) => set((s) => ({ focus: { ...s.focus, time }, lastFocusOrigin: origin ?? null })),
    setFocus: ({ date, code, time }, origin) =>
        set((s) => ({ focus: { ...s.focus, date, code, time }, search: code !== s.focus.code ? null : s.search, activePoint: code !== s.focus.code ? null : s.activePoint, chartZoom: null, lastFocusOrigin: origin ?? null })),
    // 타점 이동 = focus + activePoint 원자 세팅(다른 타점 선택 시에만 A 바뀜).
    goToPoint: ({ date, code, time }, origin) =>
        set((s) => ({ focus: { ...s.focus, date, code, time }, activePoint: { code, date, time }, search: code !== s.focus.code ? null : s.search, chartZoom: null, lastFocusOrigin: origin ?? null })),

    setTheme: (theme) => set((s) => ({ scope: { ...s.scope, theme } })),
    clearScope: () => set(() => ({ scope: { theme: null } })),
    setSearch: (search) => set(() => ({ search })),
    setChartPriceMode: (mode) => set(() => ({ chartPriceMode: mode })),
    // f 줌 토글 — 켤 때 현재 시각(focus.time)을 anchor(unix초)로 캡처. 시간 없으면 마지막 봉 기준(null).
    toggleChartZoom: () =>
        set((s) => ({ chartZoom: s.chartZoom ? null : { anchor: s.focus.time ? Math.floor(Date.parse(`${s.focus.date}T${s.focus.time}+09:00`) / 1000) : null } })),
    setNewsSearchEngine: (engine) => set(() => ({ newsSearchEngine: engine })),
    setThemeBoardSettings: (patch) => set((s) => ({ themeBoardSettings: { ...s.themeBoardSettings, ...patch } })),
    setReplaySettings: (patch) => set((s) => ({ replaySettings: { ...s.replaySettings, ...patch } })),
    setChartSettings: (patch) => set((s) => ({ chartSettings: { ...s.chartSettings, ...patch } })),
    setReviewTypePreset: (index, value) =>
        set((s) => {
            const next = s.reviewTypePresets.slice();
            next[index] = value;
            try {
                localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
            } catch {
                /* 영속 실패 무시 */
            }
            return { reviewTypePresets: next };
        }),
    setSelectedHypothesis: (id) => set(() => ({ selectedHypothesisId: id })),

    // 기본 OR: 없으면 새 OR 그룹, 이미 있으면 그 자리에서 순환(포함→제외→삭제, 우클릭 반복). AND 는 드래그로.
    addFilterLeaf: (hypothesisId) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            for (let gi = 0; gi < groups.length; gi++) {
                const li = groups[gi].findIndex((l) => l.hypothesisId === hypothesisId);
                if (li >= 0) {
                    if (!groups[gi][li].negated) groups[gi][li].negated = true;
                    else {
                        groups[gi].splice(li, 1);
                        if (groups[gi].length === 0) groups.splice(gi, 1);
                    }
                    return { filterDraft: { groups } };
                }
            }
            groups.push([{ hypothesisId, negated: false }]);
            return { filterDraft: { groups } };
        }),
    // 드래그 이동 — 다른 그룹으로=AND 합침 / "new"=새 OR 그룹으로 분리. 빈 그룹은 정리, 대상 그룹에 이미 있으면 중복 안 만듦.
    moveLeafToGroup: (fromGroupIndex, hypothesisId, target) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            const from = groups[fromGroupIndex];
            const li = from?.findIndex((l) => l.hypothesisId === hypothesisId) ?? -1;
            if (!from || li < 0) return {};
            if (target !== "new" && target === fromGroupIndex) return {}; // 자기 그룹 = no-op
            const [leaf] = from.splice(li, 1);
            if (target === "new") {
                groups.push([leaf]);
            } else {
                const to = groups[target];
                if (!to) {
                    from.splice(li, 0, leaf); // 대상 없음 → 되돌림
                    return {};
                }
                if (!to.some((l) => l.hypothesisId === leaf.hypothesisId)) to.push(leaf);
            }
            for (let i = groups.length - 1; i >= 0; i--) if (groups[i].length === 0) groups.splice(i, 1);
            return { filterDraft: { groups } };
        }),
    removeFilterLeaf: (groupIndex, hypothesisId) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            if (!groups[groupIndex]) return {};
            groups[groupIndex] = groups[groupIndex].filter((l) => l.hypothesisId !== hypothesisId);
            if (groups[groupIndex].length === 0) groups.splice(groupIndex, 1);
            return { filterDraft: { groups } };
        }),
    toggleFilterNegate: (groupIndex, hypothesisId) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            const leaf = groups[groupIndex]?.find((l) => l.hypothesisId === hypothesisId);
            if (!leaf) return {};
            leaf.negated = !leaf.negated;
            return { filterDraft: { groups } };
        }),
    removeFilterGroup: (groupIndex) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            groups.splice(groupIndex, 1);
            return { filterDraft: { groups } };
        }),
    clearFilter: () => set(() => ({ filterDraft: { groups: [] }, facetSelected: EMPTY_FACETS() })),
    setFilterExpr: (expr) => set(() => ({ filterDraft: { groups: expr.groups.map((g) => g.map((l) => ({ ...l }))) }, facetSelected: EMPTY_FACETS() })),
    toggleFacet: (attr, value) =>
        set((s) => {
            const cur = s.facetSelected[attr];
            const next = cur.some((v) => v === value) ? cur.filter((v) => v !== value) : [...cur, value];
            return { facetSelected: { ...s.facetSelected, [attr]: next } };
        }),

    // 이슈보드 필터 편집 — 새 그룹=dim 기본, 술어 추가 시 domain 기본 파라미터.
    addBoardGroup: (kind) => set((s) => updateBoardFilter(s.boardFilter, (g) => g.push({ predicates: [{ kind, params: defaultParams(kind) }], mode: "dim" }))),
    addBoardPredicate: (gi, kind) => set((s) => updateBoardFilter(s.boardFilter, (g) => { g[gi]?.predicates.push({ kind, params: defaultParams(kind) }); })),
    setBoardPredicateKind: (gi, pi, kind) => set((s) => updateBoardFilter(s.boardFilter, (g) => { const p = g[gi]?.predicates[pi]; if (p) { p.kind = kind; p.params = defaultParams(kind); } })),
    setBoardPredicateParam: (gi, pi, key, value) => set((s) => updateBoardFilter(s.boardFilter, (g) => { const p = g[gi]?.predicates[pi]; if (p) p.params[key] = value; })),
    removeBoardPredicate: (gi, pi) => set((s) => updateBoardFilter(s.boardFilter, (g) => { if (!g[gi]) return; g[gi].predicates.splice(pi, 1); if (g[gi].predicates.length === 0) g.splice(gi, 1); })),
    setBoardGroupMode: (gi, mode) => set((s) => updateBoardFilter(s.boardFilter, (g) => { if (g[gi]) g[gi].mode = mode; })),
    removeBoardGroup: (gi) => set((s) => updateBoardFilter(s.boardFilter, (g) => { g.splice(gi, 1); })),
    clearBoardFilter: () => set(() => { const next = { groups: [] }; persistBoardFilter(next); return { boardFilter: next }; }),
}));
