// 탐색 후보(probe) — 수동 분류 우선 구조 개편(2026-09-17, decisions.md 「구조 개편」)의 입구 계산.
//
// **후보는 진실이 아니다** — 타점의 진실은 그룹 배정된 캔들 좌표(group_members_point)고, 이 목록은
// 사람이 하루를 빠르게 순회하며 분류할 "볼 자리"의 제안일 뿐이다. 그래서 이 값은 어디에도 저장되지
// 않고(로컬 노브 + 읽기 시점 파생), 로직이 바뀌어도 기존 라벨은 흔들리지 않는다.
//
// 어휘 주의: "후보(candidate)"는 이미 세 뜻(PointCandidateDef·후보 하루·격자 후보 캔들)으로 점유돼
// 있어 **probe** 를 쓴다(배럴 export * 충돌 방지 겸).
//
// 순수 함수 + 주입 콜백 — 서수/존 순위(rankSectionOf·themeStatsOf)와 격자 Point(useAutoPoints)는
// 기존 단일 출처를 콜백으로 주입받고, 여기는 판정 규칙만 든다. 재계산기를 새로 쓰면 그 순간
// "같은 화면에서 숫자가 둘"이 된다(서수 출처 단일화 불변식의 연장).
//
// 값의 기준은 UN 한 벌이다 — rate·minuteHigh(% 시계열)와 trailingHighs.un 이 전부 "전일 종가 대비 %"
// 라 같은 공간에서 비교된다(복기 필터 "매물대 내부" 술어의 전례). krx 열은 여기서 안 본다.
import { minuteOfDayOf, type MinuteDerived } from "../replay/dayReplay.js";

/** 후보를 발화시킨 로직 태그 — 한 (종목,분)에 여러 로직이 걸리면 한 항목에 태그가 쌓인다. */
export type ProbeTag = "grid" | "surge" | "priorHigh" | "zoneRise";

/**
 * 로직 노브 — 전부 클라 로컬 설정(진실이 아니므로 저장물 공유·버전 규약 없음). 평평한 스칼라만
 * (persistedField/panelUi 로 그대로 영속되게).
 */
export interface ProbeParams {
    /** ① 격자 파생 Point(기준선 有 차트) — 현행 판정 재사용(gridMinutesOf 주입). */
    gridOn: boolean;
    /** ② 등락률 ≥ surgeRatePct(%) 상태에서 세션 누적 대금이 surgeAmountEok(억)에 처음 도달한 분(하루 1회). */
    surgeOn: boolean;
    surgeRatePct: number;
    surgeAmountEok: number;
    /** ③ 직전 priorHighDays 거래일 고가(trailingHighs.un[1..W])를 분봉 고가가 처음 넘는 분(하루 1회).
     *  ⚠ index 0 = **당일** 전체 고가라 반드시 1부터 자른다(포함하면 영영 거짓). */
    priorHighOn: boolean;
    priorHighDays: number;
    /** ④ 테마 존 내 순위가 상승(직전 관찰 대비 개선 또는 존 재진입)하며 zoneMaxRank 이내인 분. */
    zoneOn: boolean;
    zoneMaxRank: number;
    /** 공통 하한(억) — **관찰 시작선**이다: 세션 누적 대금이 이 미만인 분은 로직 ②③④가 관찰·발화하지
     *  않고, 하한을 넘은 뒤 첫 충족 분에서 발화한다(누적은 단조증가라 "한 번 넘으면 계속"). 소거가
     *  아니라 지연이다 — 발화 분만 걸러 태그를 영구 소거하면 하한 > 로직 임계 조합에서 그 로직이
     *  통째로 침묵한다. **단 ①(격자)만 예외로 지연이 아니라 제외다** — 격자 Point 는 좌표가 고정이라
     *  뒤로 밀 자리가 없고, 하한 미달 좌표는 목록에서 빠진다. 0 = 없음. */
    minCumAmountEok: number;
}

export const DEFAULT_PROBE_PARAMS: ProbeParams = {
    gridOn: true,
    surgeOn: true,
    surgeRatePct: 5,
    surgeAmountEok: 100, // 근거 약함 — 첫 실측(하루 후보 건수) 후 조정 전제(계획 문서)
    priorHighOn: true,
    priorHighDays: 20,
    zoneOn: false, // ④ 는 분당 단면 전량 계산이라 기본 꺼짐(켤 때만 굽는다)
    zoneMaxRank: 3,
    minCumAmountEok: 0,
};

/** 후보 한 줄 — 시각(자정기준 분) + 발화 태그 + 그 분의 표시값. 결손은 null(지어내지 않는다). */
export interface ProbeHit {
    code: string;
    min: number;
    tags: ProbeTag[];
    /** 그 분의 등락률 %(UN). */
    ratePct: number | null;
    /** 그 분의 세션 누적 거래대금(원). */
    cumAmount: number | null;
    /** zoneRise 발화 시의 존 순위/승자 테마(다중 테마는 best=min). 다른 태그만이면 null. */
    zoneRank: number | null;
    zoneTheme: string | null;
}

/** 입력 종목 모양 — 쓰는 필드만 Pick(rankSection 의 SectionStock 과 같은 수법: 와이어 ReplayStock 이 그대로 들어온다). */
export type ProbeStock = Pick<MinuteDerived, "code" | "times" | "rate" | "cumAmount" | "minuteHigh" | "trailingHighs">;

/** 주입 콜백 — 기존 단일 출처의 어댑터(머리 주석). 계산 규칙을 여기로 들이지 말 것. */
export interface ProbeDeps {
    /** 격자 파생 Point 의 시각(분) 목록 — 없으면 빈 배열. (클라: useAutoPoints/defDerived) */
    gridMinutesOf(code: string): readonly number[];
    /** 그 분의 존 순위(소속 테마 중 best)와 승자 테마 — 존 밖·테마 없음·결손 = null.
     *  (클라: sectionSeries 캐시 + themeStrength.themeStatsOf) */
    zoneRankAt(code: string, min: number): { rank: number; theme: string } | null;
}

const KRW_PER_EOK = 100_000_000;

/**
 * 하루의 탐색 후보 — 종목별 자기 분봉 타임라인 단일 패스(로직 ②③④) + 격자 Point 합류(①).
 * 같은 (code,min)은 한 항목에 태그가 쌓이고, 정렬은 분 오름차순 → 코드 오름차순(결정론).
 * ~270종목 × ~720분이라 ms 급이다(④ 만 단면 계산이 실려 첫 호출이 무겁다 — 기본 꺼짐).
 */
export function probesOfDay(stocks: readonly ProbeStock[], deps: ProbeDeps, params: ProbeParams): ProbeHit[] {
    const minCumWon = params.minCumAmountEok > 0 ? params.minCumAmountEok * KRW_PER_EOK : 0;
    const byKey = new Map<string, ProbeHit>();

    const push = (s: ProbeStock, min: number, i: number | null, tag: ProbeTag, zone?: { rank: number; theme: string }): void => {
        const key = `${s.code}|${min}`;
        let hit = byKey.get(key);
        if (!hit) {
            hit = {
                code: s.code,
                min,
                tags: [],
                ratePct: i !== null ? s.rate[i] : null,
                cumAmount: i !== null ? s.cumAmount[i] : null,
                zoneRank: null,
                zoneTheme: null,
            };
            byKey.set(key, hit);
        }
        if (!hit.tags.includes(tag)) hit.tags.push(tag);
        if (zone && (hit.zoneRank === null || zone.rank < hit.zoneRank)) {
            hit.zoneRank = zone.rank;
            hit.zoneTheme = zone.theme;
        }
    };

    for (const s of stocks) {
        const n = s.times.length;
        if (n === 0) continue;

        // 분 → 인덱스(격자 Point 합류·공통 하한 판정용). dense 타임라인이라 사실상 연속이지만 가정하지 않는다.
        const idxOfMin = new Map<number, number>();

        // ③ 의 자 — 직전 W 거래일 고가 최대(%). index 0(당일)은 반드시 제외. 창이 비면 결손(신규 상장 등).
        let priorHigh: number | null = null;
        if (params.priorHighOn) {
            const w = s.trailingHighs.un.slice(1, Math.max(1, Math.floor(params.priorHighDays)) + 1);
            if (w.length > 0) priorHigh = Math.max(...w);
        }

        let surgeFired = false;
        let priorFired = false;
        let prevZoneRank: number | null = null;

        for (let i = 0; i < n; i++) {
            const min = minuteOfDayOf(s.times[i]);
            idxOfMin.set(min, i);
            // 하한 = 관찰 시작선(ProbeParams 주석) — 미달 분은 관찰 자체를 미룬다(fired 플래그를 여기서
            // 세우면 "하한 > 로직 임계" 조합에서 태그가 영구 소거된다. 발화 없는 소거 금지).
            if (s.cumAmount[i] < minCumWon) continue;

            if (params.surgeOn && !surgeFired && s.rate[i] >= params.surgeRatePct && s.cumAmount[i] >= params.surgeAmountEok * KRW_PER_EOK) {
                surgeFired = true;
                push(s, min, i, "surge");
            }
            if (priorHigh !== null && !priorFired && s.minuteHigh[i] > priorHigh) {
                priorFired = true;
                push(s, min, i, "priorHigh");
            }
            if (params.zoneOn) {
                const z = deps.zoneRankAt(s.code, min);
                // 상승 = 직전 관찰 대비 개선(존 재진입 포함). 존 이탈은 prev 를 지워 재진입이 다시 발화한다.
                if (z && z.rank <= params.zoneMaxRank && (prevZoneRank === null || z.rank < prevZoneRank)) {
                    push(s, min, i, "zoneRise", z);
                }
                prevZoneRank = z?.rank ?? null;
            }
        }

        if (params.gridOn) {
            for (const min of deps.gridMinutesOf(s.code)) {
                const i = idxOfMin.get(min) ?? null;
                // 격자 분이 dense 타임라인 밖일 일은 없지만, 있다면 값 결손으로 정직하게 싣는다.
                if (i !== null && s.cumAmount[i] < minCumWon) continue;
                push(s, min, i, "grid");
            }
        }
    }

    const out = [...byKey.values()];
    out.sort((a, b) => a.min - b.min || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    return out;
}
