// React Query 옵션 중앙화 — 쿼리 키·queryFn·staleTime 을 한 곳에서 만든다.
// 호출부마다 옵션을 직접 적으면 같은 키에 staleTime 이 어긋나거나(예전 all-points 60s vs ∞) invalidate 키 오타가 난다.
// 역사·주석 데이터는 사실상 불변 → staleTime ∞. 편집은 mutation 이 invalidate 로 갱신하므로 자동 refetch 불필요.
// queryFn 은 react-query 의 signal 을 fetch 로 넘겨 키 변경/언마운트 시 요청을 취소한다.
import { queryOptions } from "@tanstack/react-query";
import { fetchChartBundle } from "./chart.js";
import { fetchDaySummary } from "./daySummary.js";
import { fetchDayReplay } from "./dayReplay.js";
import { fetchWatchlist, fetchUniverse } from "./alerts.js";
import { fetchLiveConditions } from "./liveConditions.js";
import { fetchTapeThemes } from "./liveTape.js";
import { fetchMirrorStatus } from "./curation.js";
import { fetchAllChartAnchors } from "./chartAnchors.js";
import { fetchAllPoints } from "./reviewPoints.js";
import { fetchComputedAxes } from "./rank.js";
import { fetchGroups, fetchGroupMemberships } from "./groups.js";
import { fetchStockMaster } from "./stocks.js";
import { fetchThemeContext } from "./themes.js";
import { fetchAllDailyComments } from "./comment.js";
import { fetchDataDates } from "./dataDates.js";
import { kstToday } from "../lib/date.js";
import { LIVE_CADENCE_MS } from "../lib/liveCadence.js";

/**
 * **curation 표식** — 읽기가 로컬 미러에서 나오는 쿼리들. 미러를 당겨오면(동기화) 이 표식이 붙은 쿼리만
 * 통째로 무효화한다. 키를 손으로 나열하지 않는 이유: 열댓 개라 새 쿼리를 하나 추가할 때 반드시 빠뜨리고,
 * 그러면 "동기화했는데 저 패널만 옛 데이터"라는 찾기 힘든 버그가 된다. 표식은 추가할 때 같이 붙는다.
 */
const CURATION = { curation: true } as const;

const IMMUTABLE = Infinity;
const META_STALE = 30 * 60_000; // 마스터 메타 — 새로 수집된 종목·날짜가 세션 내내 안 보이지 않게 30분마다 재조회 허용
const TODAY_STALE = 60_000; // 오늘 시세 — 수집(20:30 스윕) 중 빈/부분 응답이 세션 내내 굳지 않게 1분 후 재조회 허용

// 시세 역사(chart·day-summary·day-replay)는 **과거 날짜만** 불변 — 오늘은 수집이 채우는 중일 수 있다.
// (주석/가설류는 날짜 무관하게 편집형이지만 mutation 이 invalidate 하므로 ∞ 유지.)
export const histStale = (date: string): number => (date < kstToday() ? IMMUTABLE : TODAY_STALE);

// 차트 번들 — 소스(DB/브로커)는 fetchChartBundle 이 날짜로 고른다. 키가 하나라 차트 패널 2개·차트 단축키·
// 분석 오버레이가 **같은 캐시 한 벌**을 본다(중복 페치 0, 단축키가 화면과 같은 분봉 위에서 동작).
// 소비자마다 queryFn 을 달리 주면 RQ 는 먼저 마운트된 쪽을 쓰므로, 라우팅은 반드시 여기 한 곳에.
export const chartQuery = (code: string, date: string) =>
    queryOptions({ queryKey: ["chart", code, date], queryFn: ({ signal }) => fetchChartBundle(code, date, signal), enabled: code.length > 0 && date.length > 0, staleTime: histStale(date) });

// 당일 복기 파생값(분당 시계열 + 메타) — 과거만 불변(histStale), gcTime 넉넉(브라우저 ~10거래일 캐시).
// 복기보드 전용(테마보드는 day-summary folding). 시점 파생(스냅샷)은 lib/leanModel 이 담당.
export const dayReplayQuery = (date: string) =>
    queryOptions({
        queryKey: ["day-replay", date],
        queryFn: ({ signal }) => fetchDayReplay(date, signal),
        enabled: date.length > 0,
        staleTime: histStale(date),
        gcTime: 60 * 60_000,
    });

// 실시간 워치리스트(/live/watchlist) — 모니터링 패널과 실시간 차트(알람 가격선)가 **같은 키 한 벌**을 폴링.
// 옵션을 각자 적으면 refetchInterval 이 갈라질 수 있어 여기 한 곳에.
export const liveWatchlistQuery = () =>
    queryOptions({ queryKey: ["live-watchlist"], queryFn: ({ signal }) => fetchWatchlist(signal), refetchInterval: LIVE_CADENCE_MS });

// ── 실시간 엔진의 나머지 폴링들 — 옵션을 패널 안에 적지 않는다(같은 키에 다른 옵션이면 먼저 마운트된 쪽이 이긴다).
/** 유니버스(hot 종목·규칙·블랙리스트) — 규칙 편집 패널. 15초 폴링(엔진 스캐너가 바꾼다). */
export const liveUniverseQuery = () =>
    queryOptions({ queryKey: ["live-universe"], queryFn: ({ signal }) => fetchUniverse(signal), refetchInterval: 15_000 });

/** 조건검색 목록(영웅문 서버저장 CNSRLST) — 설정 모달. 엔진 미연결(503)이면 즉시 안내하려 retry 끔. */
export const liveConditionsQuery = () =>
    queryOptions({ queryKey: ["live", "conditions"], queryFn: ({ signal }) => fetchLiveConditions(signal), staleTime: 30_000, retry: false });

/** 포커스 종목의 테마 칩(테이프 패널) — 멤버십은 시트가 정본이라 가끔 바뀐다. 포커스 전환마다 재조회면 충분. */
export const tapeThemesQuery = (code: string) =>
    queryOptions({ queryKey: ["live-tape-themes", code], queryFn: ({ signal }) => fetchTapeThemes(code, signal), enabled: code !== "", refetchInterval: LIVE_CADENCE_MS * 10 });

// ── 큐레이션 미러 상태(마지막 동기화 시각) — 시각 표시가 굳지 않게 분당 재조회(바이트 몇 개짜리 로컬 조회).
export const mirrorStatusQuery = () =>
    queryOptions({ queryKey: ["mirror-status"], queryFn: ({ signal }) => fetchMirrorStatus(signal), refetchInterval: 60_000, staleTime: 60_000 });

export const daySummaryQuery = (date: string) =>
    queryOptions({ queryKey: ["day-summary", date], queryFn: ({ signal }) => fetchDaySummary(date, signal), enabled: date.length > 0, staleTime: histStale(date) , meta: CURATION });

// ── 큐레이션 복제본(테이블 낟알) — curation "테이블" 전량을 상주 캐시로 들고, 화면은 셀렉터로 접는다.
// per-chart 파생(이 차트의 앵커/타점, 이 날의 코멘트)도 서버 왕복이 아니라 이 테이블들의 셀렉터다
// (lib/useChartPoints·useDailyComment·chartAnchorHooks) — 메모리에 있는 값은 DB 왕복 금지.
// 키가 곧 테이블이라 "쓴 테이블 = 재요청할 키" 1:1 대응 — 투영 키(옛 anchored-charts)가 늘며 자라던
// 무효화 거미줄을 원리적으로 없앤다. 타점(all-points)·그룹(groups·group-members)도 같은 결의 테이블 키.
export const allAnchorsQuery = () =>
    queryOptions({ queryKey: ["all-anchors"], queryFn: ({ signal }) => fetchAllChartAnchors(signal), staleTime: IMMUTABLE , meta: CURATION });

export const allCommentsQuery = () =>
    queryOptions({ queryKey: ["all-comments"], queryFn: ({ signal }) => fetchAllDailyComments(signal), staleTime: IMMUTABLE , meta: CURATION });

export const allPointsQuery = () =>
    queryOptions({ queryKey: ["all-points"], queryFn: ({ signal }) => fetchAllPoints(signal), staleTime: IMMUTABLE , meta: CURATION });

// 순위 배치 — 축 목록 + 전 축 줄(placements). 편집형(place/unplace mutation 이 invalidate)이라 staleTime ∞.
// 계산 축(수식 축)의 타점별 수치 — **키 하나**(모든 소비자가 전축을 본다). 타점·앵커 mutation 이 무효화한다.
// 서버가 축당 파일 캐시로 증분 계산한다.
export const computedAxesQuery = () =>
    queryOptions({ queryKey: ["rank-axes-computed"], queryFn: ({ signal }) => fetchComputedAxes(signal), staleTime: IMMUTABLE , meta: CURATION });


// 그룹 — 사전 + 전 항목 멤버십. 줄 피드와 같은 이유로 **키 하나**(소비자가 모두 전체를 본다).
// 타점 캐시(review-points·all-points)와 분리 = 그룹 토글이 타점 목록 refetch 를 유발하지 않는다.
export const groupsQuery = () =>
    queryOptions({ queryKey: ["groups"], queryFn: ({ signal }) => fetchGroups(signal), staleTime: IMMUTABLE , meta: CURATION });

// 멤버십은 **한 피드**다(옛날엔 타점 부착·차트 부착 둘) — 시각 유무로 층위가 갈릴 뿐 같은 사실이라
// 캐시를 나누면 한쪽만 무효화되는 사고가 열린다.
export const groupMembershipsQuery = () =>
    queryOptions({ queryKey: ["group-members"], queryFn: ({ signal }) => fetchGroupMemberships(signal), staleTime: IMMUTABLE , meta: CURATION });

/**
 * 종목 마스터 전량(코드·이름·시장) — 이름 사전의 **단일 출처**. 키가 상수라 어느 화면에서 불러도 한 벌이다.
 *
 * 옛 코드별·코드집합별 키(`stock-meta`·`stocks-meta`)를 대체한다. 그 키들은 집합이 곧 키라서
 * `[x,y]` 를 받아 둔 캐시가 `[y,z]` 요청에 하나도 못 쓰였다 — 캐시가 합쳐지지 않는 모양이었다.
 */
export const stockMasterQuery = () =>
    queryOptions({ queryKey: ["stock-master"], queryFn: ({ signal }) => fetchStockMaster(signal), staleTime: META_STALE });

// 종목의 시트 테마+편입이슈(날짜무관·code 키). 배정 mutation 이 ["theme-context"] invalidate 로 갱신하므로 staleTime ∞.
export const themeContextQuery = (code: string) =>
    queryOptions({ queryKey: ["theme-context", code], queryFn: ({ signal }) => fetchThemeContext(code, signal), enabled: code.length > 0, staleTime: IMMUTABLE });

// 데이터 있는 거래일 목록(전역·종목무관) — data-aware 날짜피커용. 수집으로 새 날짜가 늘 수 있어 30분 stale 후 재조회 허용.
export const dataDatesQuery = () =>
    queryOptions({ queryKey: ["data-dates"], queryFn: ({ signal }) => fetchDataDates(signal), staleTime: META_STALE });
