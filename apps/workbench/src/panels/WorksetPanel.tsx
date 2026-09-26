import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hmsToMinute, minuteToHms } from "@trade-data-manager/market/domain";
import { DAILY_GEN_PANEL_ID } from "./dailyGen/dailyPanelIds.js";
import { selectObservedSetId, selectObservedStages, useWorkbench } from "../store/workbench.js";
import { usePanelUi } from "../store/usePanelUi.js";
import { DAY_SET_OPTS, useCellSet } from "./filter/useCellSet.js";
import { isHeavyCellPredicate } from "./filter/stage.js";
import type { CellHit } from "@trade-data-manager/market/domain";
import { dayRows, stepWithin, walkableOf, type DayCell } from "./workset/rows.js";
import { useDayCrossing } from "./workset/useDayCrossing.js";
import { neighborDates } from "./workset/dayCrossing.js";
import { useDayReplayPrefetch } from "../lib/useDaySnapshot.js";
import { useQuery } from "@tanstack/react-query";
import { dataDatesQuery } from "../api/queries.js";
import { useHasDataOn } from "../lib/useSnapFocusDate.js";
import { usePublishRowNav } from "../lib/rowNav.js";
import { RowNavBadge } from "../components/RowNavBadge.js";

import { BoardCenter } from "../components/board/BoardCard.js";
import { PanelHeader } from "../components/ControlChrome.js";
import { HeaderControls, type ControlSpec } from "../components/HeaderControls.js";
import { WorksetList } from "./WorksetList.js";
import { useStockNames } from "../lib/useStockNames.js";
import { useGroups } from "../lib/GroupsContext.js";
import { useFunnel } from "./filter/FunnelContext.js";
import { setDisplayName } from "./filter/label.js";
import { PIN } from "../styles/palette.js";
import { openAndFocus } from "../lib/openPanel.js";

// 작업 대상 패널 — **그날의 좌표들**(조건이 뽑은 셀 ∪ 라벨)을 하루 단위로 걷는다.
// 2026-09-26 종단 폐기: 옛 3층 목록(월 시선·존재 필터 DNF·프리셋·렌즈/좁히기 — 전 기간 큐레이션
// 브라우징)은 은퇴했다. 부팅 하루 고정 이후 도달 불가한 죽은 가지였고, 통계는 나중에 "그룹 → 서버
// 리포트"로 돌아온다(decisions 「종단 트랙 전면 폐기」).

const EMPTY_DATES: string[] = [];
const EMPTY_HITS: CellHit[] = [];

export function WorksetPanel({ panelId }: { panelId?: string }): JSX.Element {
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
    const goToDay = useWorkbench((s) => s.goToDay);
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const savedSets = useWorkbench((s) => s.savedSets);

    const { nameOf } = useStockNames();
    const { pointGroupsOf, pathLabel } = useGroups();
    const funnel = useFunnel();

    // ── 하루·셀 우주 — 편집 중인 집합의 타입이 이 패널의 모습을 정한다(decisions 「집합」 단계 ③).
    //    종단이면 지금까지의 3층 목록 그대로, 하루면 그날의 셀 ∪ 라벨 2층 목록이 된다.
    // ⚠ 라우팅의 자는 **모드**다(2026-09-22) — 파생은 조건 0개면 종단으로 떨어진다.
    const stages = useWorkbench(selectObservedStages);
    const isDaily = useWorkbench((s) => s.filterMode) === "daily";
    const pid = panelId ?? "workset";
    const [sortMode, setSortMode] = usePanelUi<"stock" | "time">(pid, "daySort", "stock");
    const [collapsedCodes, setCollapsedCodes] = usePanelUi<string[]>(pid, "dayCollapsed", []);
    const [showLabels, setShowLabels] = usePanelUi(pid, "dayLabels", true);
    const [datePinned, setDatePinned] = usePanelUi(pid, "datePin", false);
    // 셀 평가 — 상한은 **종목 그룹째** 자른다(반토막이면 머리의 ◇ n 이 거짓말을 한다).
    // 식·저장물은 깔때기의 **늦은 한 벌**(slowExpr/slowSets) — 종단과 같은 박자여야 수가 안 갈린다.
    const cellSet = useCellSet(isDaily ? funnel.slowExpr : null, funnel.slowSets, focusDate, DAY_SET_OPTS);
    const pointMemberships = useGroups().pointMemberships;

    /**
     * 그날의 좌표들 — 조건이 뽑은 셀 ∪ **라벨**(조건이 지우지 못한다 · 조건이 비어도 선다).
     *
     * ⚠ `tooWide`(그물 50,000셀 도달) 면 **조건 층을 통째로 뺀다**. 엔진은 중단 시점까지 모은 셀을
     * 그대로 돌려주는데, 그건 "코드 오름차순 앞 종목만"이라 목록으로 세우면 조용히 편향된 표본을
     * 진짜 산출물처럼 보여 준다(순회도 그 위를 걷는다). 라벨 층은 조건과 무관하므로 남는다 —
     * 화면은 대신 그 사실을 말한다(아래 tooWide 띠).
     */
    const dayCells = useMemo<DayCell[]>(() => {
        const byKey = new Map<string, DayCell>();
        for (const h of cellSet.tooWide ? EMPTY_HITS : cellSet.hits) {
            byKey.set(`${h.code}|${h.min}`, { code: h.code, min: h.min, time: minuteToHms(h.min), hit: h, labeled: false });
        }
        if (showLabels) {
            for (const m of pointMemberships) {
                if (m.date !== focusDate) continue;
                const min = hmsToMinute(m.time);
                const k = `${m.stockCode}|${min}`;
                const prev = byKey.get(k);
                if (prev) byKey.set(k, { ...prev, labeled: true });
                else byKey.set(k, { code: m.stockCode, min, time: m.time, hit: null, labeled: true });
            }
        }
        return [...byKey.values()];
    }, [isDaily, cellSet.tooWide, cellSet.hits, showLabels, pointMemberships, focusDate]);

    const collapsedSet = useMemo(() => new Set(collapsedCodes), [collapsedCodes]);
    const toggleCollapse = useCallback((code: string) => {
        setCollapsedCodes((v) => (v.includes(code) ? v.filter((c) => c !== code) : [...v, code]));
    }, [setCollapsedCodes]);
    // 날짜가 **바뀌면** 접힘을 푼다 — 어제 접은 종목이 오늘 접혀 있으면 놓친다(decisions 규칙 ③).
    // ⚠ 마운트에서는 풀지 않는다: effect 는 첫 렌더에도 도므로 그냥 두면 프리셋 전환·새로고침마다
    //   같은 날짜인데도 저장된 접힘이 지워진다(노브를 영속시킨 뜻이 접힘에서만 사라진다).
    const lastDate = useRef(focusDate);
    useEffect(() => {
        if (lastDate.current === focusDate) return;
        lastDate.current = focusDate;
        setCollapsedCodes([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusDate]);

    // ── 집합 — **관측 집합 하나**를 읽는다(2026-09-22: 고르는 포인터가 없어졌다).
    //    렌즈 규칙은 구독 패널과 같은 한 줄 — 보는 집합이 "걸려 있으면" 렌즈다(작업셋만 다른 규칙을 두면
    //    옆 패널은 좁아졌는데 여기만 무반응인 어긋남이 생긴다).
    const observedId = useWorkbench(selectObservedSetId);
    // 이름 어휘는 집합 줄과 같은 한 벌(setDisplayName). 클릭 = 집합 편성 패널로(닫혀 있으면 연다).
    const setLabel = useMemo(() => {
        const f = savedSets.find((x) => x.id === observedId);
        return f ? setDisplayName(f, (id) => savedSets.find((x) => x.id === id)?.name ?? "(묶음)") : "(지워진 집합)";
    }, [savedSets, observedId]);
    const goToFunnelPanel = (): void => openAndFocus(DAILY_GEN_PANEL_ID);

    // ── 목록 행 — **한 배열**이 목록과 순회의 공통 원천이다(두 벌이면 접힌 행을 순회가 밟는다).
    const listRows = useMemo(
        () => dayRows(dayCells, focusDate, { sort: sortMode, collapsed: collapsedSet }),
        [dayCells, focusDate, sortMode, collapsedSet],
    );

    // ── 날짜 경계 넘기(하루 우주 전용) — 종단은 날짜가 목록 안에 있어 경계가 없다.
    // 거래일 목록은 **하루 우주에서만** 필요하다(날짜 경계 넘기의 재료) — 종단 화면이 이 왕복을 물지 않게.
    const datesQ = useQuery({ ...dataDatesQuery(), enabled: isDaily });
    /** 그 날에 데이터가 있나 — 빈 화면이 "조건 탓"인지 "휴장"인지 가르는 재료(undefined = 아직 모름). */
    const hasData = useHasDataOn(focusDate);
    const heavyCondition = useMemo(
        () => cellSet.stages.some((st) => st.counted) && stages.some((st) => st.predicates.some(isHeavyCellPredicate)),
        [cellSet.stages, stages],
    );
    const landOn = useCallback((dir: 1 | -1) => {
        // 착지 — 방향에 맞는 끝 항목으로. 행은 이 렌더의 것이라 effect 가 아니라 콜백에서 읽는다.
        const order = walkableOf(dayRows(dayCells, focusDate, { sort: sortMode, collapsed: collapsedSet }));
        const to = dir > 0 ? order[0] : order[order.length - 1];
        if (to) useWorkbench.getState().goToPoint({ date: to.date, code: to.code, time: to.time ?? "" }, "workset");
    }, [dayCells, focusDate, sortMode, collapsedSet]);
    // 이웃 날짜 재료를 미리 당긴다 — 경계 넘기가 끊기지 않게(후보 계산은 미리 하지 않는다).
    useDayReplayPrefetch(isDaily ? focusDate : null, useMemo(() => neighborDates(datesQ.data ?? EMPTY_DATES, focusDate), [datesQ.data, focusDate]));
    const crossing = useDayCrossing({
        active: isDaily,
        dates: datesQ.data ?? EMPTY_DATES,
        ready: isDaily && !cellSet.isLoading,
        // 오류는 **빈 날이 아니다** — 0건으로 읽히면 자동 스킵이 실패한 15MB 요청을 10일치 날리고
        // 시선이 열흘 떨어진 곳에 남는다. 손짓을 버리고 그 자리에 멈춘다(매달림도 함께 풀린다).
        failed: cellSet.error !== null,
        count: isDaily ? walkableOf(listRows).length : 0,
        heavy: heavyCondition,
        pinned: datePinned,
        truncated: cellSet.truncated,
        onLand: landOn,
    });


    // ── 찾아가기(조준·포커스 추종) — 가상 목록이라 ref 대신 (날짜,종목)+nonce 로 지목(WorksetList.jumpTo).
    const [jump, setJump] = useState<{ date: string; code: string; nonce: number }>({ date: "", code: "", nonce: 0 });
    const canLocate = focusCode !== null;
    useEffect(() => {
        if (!focusCode) return;
        setJump((j) => ({ date: focusDate, code: focusCode, nonce: j.nonce + 1 }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusCode, focusDate, focusTime]);

    // ── w/s 타점 순회 — 보이는 타점(필터·좁히기 통과분)만 걷는다.
    //    여기선 순회 함수만 얹는다: 키 등록은 App 한 곳이고, **누가 걷는지는 사람이 고른다**
    //    (머리글 `w/s` 배지 · `q` 순환). 규칙 본문은 lib/rowNav 머리 주석.
    // **순회 순서 = 화면 순서**다 — 목록과 같은 `listRows` 에서 나온다(별도 배열이면 접힌 행을 밟는다).
    const order = useMemo(() => walkableOf(listRows), [listRows]);
    /** 지금 날짜를 넘겨도 되나 — **넘기는 중이면 안 된다**(연타가 하루씩 밀어낸다). */
    const canCross = isDaily && !cellSet.isLoading && !cellSet.tooWide && cellSet.error === null && !crossing.seeking;
    // 순회 커서 = 지금 고른 타점(subject) — 없으면(하루 선택) 목록 끝에서 시작한다.
    const navRef = usePublishRowNav("workset");
    navRef.current = (dir): void => {
        // 커서 — 우주마다 "지금 밟고 선 것"의 정의가 다르다.
        //  · 종단: subject(= focus.time 이 **라벨 좌표일 때만** 시각을 든다 — lib/subject).
        //  · 하루: focus.time 그대로. 이 우주의 행은 라벨이 아닌 좌표(◇ 후보)가 대다수라 subject 를
        //    쓰면 커서가 늘 null 로 떨어져 **s 를 눌러도 첫 행에서 안 나간다**(옛 탐색 후보 패널은
        //    자기 커서를 따로 들어 이 문제가 없었다 — 흡수하며 되살아난 자리).
        const cur = focusTime !== null ? { code: focusCode, date: focusDate, time: focusTime } : null;
        const step = stepWithin(order, cur, dir > 0 ? 1 : -1);
        // 빈 목록(조건 0건·전부 접힘·진짜 빈 날)에서도 **날짜는 넘어가야 한다** — 안 그러면 자동 스킵이
        // 멈춘 그 빈 날에서 키보드만으로는 영영 못 빠져나간다.
        // ⚠ 단 **"빈 이유"를 가린다**: 로딩 중·tooWide·오류의 0건은 빈 날이 아니라 *아직 모르는* 날이다.
        //   가리지 않으면 계산 중에 누른 s 가 그 날을 버리고 다음 날로 밀며(연타마다 하루 + 15MB 요청),
        //   「목록이 안 그려지는 상태에선 w/s 도 멈춘다」가 깨진다.
        if (step === null) {
            if (canCross) crossing.cross(dir > 0 ? 1 : -1);
            return;
        }
        if (step.kind === "boundary") {
            // 하루 우주에서만 날짜를 넘긴다 — 종단은 날짜가 목록 안에 있어 경계가 없다.
            if (canCross) crossing.cross(step.dir);
            return;
        }
        useWorkbench.getState().goToPoint({ date: step.to.date, code: step.to.code, time: step.to.time ?? "" }, "workset");
    };

    // ── 헤더 컨트롤(레지스트리) — 좁히기는 렌즈가 설 때만 의미가 있어 그때만 나타난다.
    const controls = useMemo<ControlSpec[]>(() => [
        // ── 하루 우주의 손잡이 셋 — 종단에선 뜻이 없어 아예 안 선다(available).
        {
            kind: "toggle", id: "daySort", name: sortMode === "stock" ? "종목순" : "시간순", available: isDaily,
            help: "정렬 = 섹션 유무다. 종목순이면 종목 머리로 접히고, 시간순이면 장 흐름대로 평탄하게 선다",
            on: sortMode === "stock", set: () => setSortMode((v) => (v === "stock" ? "time" : "stock")),
        },
        {
            kind: "toggle", id: "dayLabels", name: "라벨", activeColor: PIN, available: isDaily,
            help: "◆ 라벨 좌표를 겹쳐 보기 — 조건이 지우지 못하는 층이다(끄면 조건이 뽑은 것만 남는다)",
            on: showLabels, set: () => setShowLabels((v) => !v),
        },
        {
            kind: "toggle", id: "datePin", name: "날짜 고정", available: isDaily,
            help: "목록 끝에서 w/s 가 날짜를 안 넘긴다 — '이 날만 보겠다'는 선언",
            on: datePinned, set: () => setDatePinned((v) => !v),
        },
        {
            kind: "action", id: "locate", name: "조준", disabled: !canLocate,
            help: "현재 종목 위치로 스크롤",
            run: () => setJump((j) => ({ date: focusDate, code: focusCode, nonce: j.nonce + 1 })),
        },
    ], [canLocate, focusDate, focusCode, isDaily, sortMode, setSortMode, showLabels, setShowLabels, datePinned, setDatePinned]);

    // ⚠ 훅은 **전부 게이트 위**에 있어야 한다 — 아래 early return 밑에 useMemo 를 하나라도 두면
    //    로딩 렌더에선 훅이 적고 완료 렌더에선 많아 React 가 "Rendered more hooks" 로 죽는다
    //    (첫 마운트마다 지나는 경로다 — 리뷰가 잡았다).
    const labelCount = useMemo(() => dayCells.filter((c) => c.labeled).length, [dayCells]);

    if (!isDaily) return <BoardCenter text="작업 대상은 하루 전용입니다(종단 은퇴 — 2026-09-26)" />;
    if (cellSet.isLoading) return <BoardCenter text={`${focusDate} 후보 계산중…`} />;
    if (cellSet.error) return <BoardCenter text={`후보 오류: ${cellSet.error.message}`} />;

    const deficientCount = cellSet.stages.filter((st) => !st.counted).length;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 13 }}>
            {/* ① 컨트롤 줄 — 좌측 상태 텍스트, 우측 레지스트리. */}
            <PanelHeader chrome={false} gap={6} style={{ borderBottom: "1px solid var(--border-default)" }}>
                <button onClick={goToFunnelPanel}
                    title={`지금 보는 집합: ${setLabel} — 일별 타점[조건]이 정한다(클릭 = 그 패널로)`}
                    style={{
                        flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 700, padding: "0 7px",
                        borderRadius: 9, border: "0.5px solid transparent", background: PIN, color: "#fff", whiteSpace: "nowrap",
                        maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                    {setLabel}
                </button>
                <RowNavBadge owner="workset" />
                <>
                        {/* 날짜는 **정의가 아니라 변수**다 — 전역 시선의 거울(고정하면 w/s 가 경계에서 멈춘다). */}
                        <span className="tabular" style={{ flexShrink: 0, fontSize: 11, color: "var(--text-secondary)" }}
                            title="이 목록이 평가되는 날짜 — 전역 시선(차트·복기 보드와 같은 날). w/s 로 목록 끝에 닿으면 넘어간다">
                            {focusDate}{datePinned ? " 📌" : ""}
                        </span>
                        {/* 카운터는 **갈라 적는다** — 조건이 뽑은 셀과 겹쳐 놓인 라벨은 다른 층이다. */}
                        <span className="tabular" style={{ flexShrink: 0, fontSize: 11, color: "var(--text-secondary)" }}>
                            조건 {cellSet.matched.toLocaleString("ko-KR")}
                            {labelCount > 0 && <span style={{ color: PIN }}> · ◆ {labelCount}</span>}
                        </span>
                        {cellSet.tooWide && (
                            <span className="tabular" style={{ flexShrink: 0, fontSize: 10.5, color: "var(--fall)" }}
                                title="그물(5만 셀)에 걸려 평가를 중단했다 — 중단 시점까지 모인 셀은 앞 종목에 쏠려 있어 목록에서 뺐다(라벨은 그대로). 조건판에서 조건을 조여 주세요">
                                조건이 너무 넓습니다 — {cellSet.matched.toLocaleString("ko-KR")}건 이상
                            </span>
                        )}
                        {cellSet.truncated && !cellSet.tooWide && (
                            <span className="tabular" style={{ flexShrink: 0, fontSize: 10.5, color: "var(--fall)" }}
                                title="상한을 넘어 **종목 경계에서** 잘렸다 — 남은 종목의 수는 정확하다. 조건을 조이면 전부 보인다">
                                상한 {cellSet.limit.toLocaleString("ko-KR")} 초과 — 잘림
                            </span>
                        )}
                        {deficientCount > 0 && (
                            <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)" }}
                                title="이 우주에서 평가할 수 없는 조건이 있습니다 — 그 칸은 세지 않습니다(조건판에서 이유를 봅니다)">
                                결손 칸 {deficientCount}
                            </span>
                        )}
                        {(crossing.seeking || crossing.note) && (
                            <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)" }}>
                                {crossing.seeking ? `날짜 넘기는 중…${crossing.skipped > 0 ? ` (${crossing.skipped}일 건너뜀)` : ""}` : crossing.note}
                            </span>
                        )}
                </>
                <HeaderControls controls={controls} storageKey="wb.headerPins.workset" />
            </PanelHeader>

            {listRows.length === 0 ? (
                <div style={{ padding: 10, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>
                    {/* ⚠ **빈 이유를 조건 탓으로 돌리지 않는다** — 장이 안 선 날(주말·휴장)은 조건을
                        아무리 넓혀도 0이다. 그 사실을 먼저 말한다(2026-09-20: 시선 날짜가 오늘로
                        시작하던 탓에 주말에 켜면 전부 이 화면이었고, 문구가 조건 탓을 했다). */}
                    {hasData === false
                        ? `${focusDate} 은 데이터가 없는 날입니다(휴장·미수집) — w/s 로 거래일로 넘기세요`
                        : cellSet.tooWide
                            // 머리글이 "너무 넓습니다"를 이미 말한다 — 같은 문장을 두 번 쓰지 않는다.
                            ? "조건 층을 뺐습니다(위 안내) — 이 날엔 라벨 좌표도 없습니다"
                            : "이 날에 걸린 좌표가 없습니다 — 조건판에서 조건을 넓히거나 w/s 로 날짜를 넘기세요"}
                </div>
            ) : (
                <WorksetList
                    rows={listRows}
                    focus={{ code: focusCode, date: focusDate, time: focusTime }}
                    lens={null}
                    nameOf={nameOf}
                    // 타점 행 아이콘의 낟알 = **좌표 라벨**(직접 소속만 — 표시 규칙은 day 쪽과 대칭).
                    // 하루 그룹은 종목 행 배지가 말한다(붙는 머리라 스크롤 중에도 남는다).
                    pointGroupsOf={pointGroupsOf}
                    pathOf={(id) => pathLabel(id, "(지워짐)")}
                    // goToDay — 하루를 고르는 손짓이라 시각을 **명시적으로 푼다**(time: null).
                    // 안 그러면 옛 시각이 남아 그 차트의 라벨 좌표를 우연히 가리키는 순간 하루 선택이 아니게 된다.
                    onPickDay={(e) => goToDay({ date: e.date, code: e.code })}
                    onPickPoint={(p) => goToPoint({ date: p.date, code: p.stockCode, time: p.time })}
                    onPickCell={(code, date, time) => goToPoint({ date, code, time })}
                    onToggleCollapse={toggleCollapse}
                    jumpTo={jump.code ? jump : undefined}
                />
            )}
        </div>
    );
}
