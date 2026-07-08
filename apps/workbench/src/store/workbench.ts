import { create } from "zustand";
import { type HypothesisFilterExpr, type PointAttr } from "@trade-data-manager/market/domain";
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
    filterOn: boolean;
    filterHighGte: number; // 고가 등락률 %
    filterAmountEok: number; // 거래대금 억
    filterCombine: "and" | "or";
    filterMode: "dim" | "hide";
    // 신고가 근접 필터(추가 AND 조건, day-summary folding 의 trailingHighs 필요). 당일이 창 최고가의 tol% 이내여야 표시.
    filterNewHigh: boolean;
    filterNewHighWindow: number; // 거래일 창
    filterNewHighTolerance: number; // 최고가 대비 허용 갭 %
}
export interface ReplayBoardSettings {
    amountN: number; // 거래대금 top-N
    rateN: number; // 등락률 top-N
}

interface WorkbenchState {
    focus: Focus;
    scope: Scope;
    search: Search | null; // 검색 모드 컨텍스트(null = Focus 따라감)
    chartPriceMode: ChartPriceMode; // 뷰 설정(축 아님) — 분봉 % 기준 시장
    newsSearchEngine: NewsSearchEngine; // HTS 뉴스 제목 검색 엔진(전역 토글)
    themeBoardSettings: ThemeBoardSettings;
    replaySettings: ReplayBoardSettings;
    reviewTypePresets: string[]; // 타점 셋업 유형 프리셋(숫자키 1~9). 클라 config.
    selectedHypothesisId: string | null; // 가설 선택 축 — 리스트↔그래프 하이라이트 동기화.
    // 가설 필터 draft(DNF: AND그룹들의 OR). 어느 surface(그래프·목록)든 addFilterLeaf 로 채운다.
    // 활성(비어있지 않은 그룹 ≥1)이면 작업셋이 월별→전 기간 필터 모드로 전환(모드 플래그 없이 활성여부가 곧 모드).
    filterDraft: HypothesisFilterExpr;
    // 속성 패싯 선택(2단계 드릴다운). 값 배열(null=미분류). 임시라 저장 안 함. 필터 지우기/불러오기 시 리셋.
    facetSelected: Record<PointAttr, (string | null)[]>;
    // 마지막 Focus 변경의 출처(패널 id). 패널이 "내가 바꿨나(self) vs 남이 바꿨나(external)"를 구분해
    // 자기 자신은 제자리, 남에 의한 변경은 스크롤/동기화하는 데 쓴다. origin 미전달 = null(= 외부 취급).
    lastFocusOrigin: string | null;
    // Focus 액션 — 무효화규칙을 액션 안에 강제한다(패널이 규칙을 재현하지 않게). origin 은 선택적 출처 태그.
    setDate: (date: string, origin?: string) => void;
    setCode: (code: string, origin?: string) => void;
    setTime: (time: string | null, origin?: string) => void;
    setFocus: (next: { date: string; code: string; time: string | null }, origin?: string) => void; // review point 원자적 세팅
    // Scope 액션 — 각 축 독립 토글(차트 안 건드림).
    setTheme: (theme: string | null) => void;
    clearScope: () => void;
    // 검색 모드 — 봉 클릭이 세팅, ✕ 로 해제(null). 종목 바뀌면 setCode/setFocus 가 자동 해제.
    setSearch: (search: Search | null) => void;
    // 뷰 설정
    setChartPriceMode: (mode: ChartPriceMode) => void;
    setNewsSearchEngine: (engine: NewsSearchEngine) => void;
    // 보드 설정(전역 모달이 편집)
    setThemeBoardSettings: (patch: Partial<ThemeBoardSettings>) => void;
    setReplaySettings: (patch: Partial<ReplayBoardSettings>) => void;
    setReviewTypePreset: (index: number, value: string) => void;
    setSelectedHypothesis: (id: string | null) => void;
    // 가설 필터 편집 — 어느 surface든 같은 액션 호출(제스처↔메커니즘 분리). addFilterLeaf 는 마지막 그룹에 추가/부정/제거 순환.
    addFilterLeaf: (hypothesisId: string) => void;
    addFilterGroup: () => void;
    removeFilterLeaf: (groupIndex: number, hypothesisId: string) => void;
    toggleFilterNegate: (groupIndex: number, hypothesisId: string) => void;
    removeFilterGroup: (groupIndex: number) => void;
    clearFilter: () => void;
    setFilterExpr: (expr: HypothesisFilterExpr) => void; // 저장 필터 불러오기
    toggleFacet: (attr: PointAttr, value: string | null) => void;
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
    chartPriceMode: "un",
    newsSearchEngine: "naver",
    themeBoardSettings: { showIndividuals: true, showUnclassified: false, filterOn: false, filterHighGte: 10, filterAmountEok: 100, filterCombine: "and", filterMode: "dim", filterNewHigh: false, filterNewHighWindow: 20, filterNewHighTolerance: 2 },
    replaySettings: { amountN: 80, rateN: 40 },
    reviewTypePresets: loadReviewTypePresets(),
    selectedHypothesisId: null,
    filterDraft: { groups: [] },
    facetSelected: EMPTY_FACETS(),
    lastFocusOrigin: null,

    // date 최상위 무효화: time 리셋 + scope 리셋(테마는 그날 것이라 날짜 넘어가면 stale).
    setDate: (date, origin) =>
        set((s) => ({ focus: { ...s.focus, date, time: null }, scope: { theme: null }, lastFocusOrigin: origin ?? null })),
    // code 변경 시 time 유지(같은시각 횡적비교) + 검색 모드 자동 해제(종목 바뀌면 Focus 복귀). 같은 종목이면 검색 유지.
    setCode: (code, origin) =>
        set((s) => ({ focus: { ...s.focus, code }, search: code !== s.focus.code ? null : s.search, lastFocusOrigin: origin ?? null })),
    setTime: (time, origin) => set((s) => ({ focus: { ...s.focus, time }, lastFocusOrigin: origin ?? null })),
    setFocus: ({ date, code, time }, origin) =>
        set((s) => ({ focus: { ...s.focus, date, code, time }, search: code !== s.focus.code ? null : s.search, lastFocusOrigin: origin ?? null })),

    setTheme: (theme) => set((s) => ({ scope: { ...s.scope, theme } })),
    clearScope: () => set(() => ({ scope: { theme: null } })),
    setSearch: (search) => set(() => ({ search })),
    setChartPriceMode: (mode) => set(() => ({ chartPriceMode: mode })),
    setNewsSearchEngine: (engine) => set(() => ({ newsSearchEngine: engine })),
    setThemeBoardSettings: (patch) => set((s) => ({ themeBoardSettings: { ...s.themeBoardSettings, ...patch } })),
    setReplaySettings: (patch) => set((s) => ({ replaySettings: { ...s.replaySettings, ...patch } })),
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

    // 마지막 그룹에 리프 추가 → 이미 있으면 양성→부정→제거 순환(우클릭 반복). 그룹 없으면 새로 만든다.
    addFilterLeaf: (hypothesisId) =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            if (groups.length === 0) groups.push([]);
            const last = groups[groups.length - 1];
            const i = last.findIndex((l) => l.hypothesisId === hypothesisId);
            if (i < 0) last.push({ hypothesisId, negated: false });
            else if (!last[i].negated) last[i].negated = true;
            else last.splice(i, 1);
            return { filterDraft: { groups } };
        }),
    // 새 OR 그룹 시작(마지막이 비어있지 않을 때만 — 빈 그룹 남발 방지).
    addFilterGroup: () =>
        set((s) => {
            const groups = cloneGroups(s.filterDraft);
            if (groups.length === 0 || groups[groups.length - 1].length > 0) groups.push([]);
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
}));
