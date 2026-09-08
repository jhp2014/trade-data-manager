// 타점 정의 패널 — 자동 시그널 판정 정의(게이트 2·자격 시각·근접)를 **분포를 보며 긋는** 유일한 편집면.
//
// 왜 판이 따로인가(2026-09-07): 편성 보드의 문법이 "행이 실체, 보드는 관리소, 편집은 전문 패널"이고
// (decisions.md 「깔때기 조건 UI」), 레일은 **폭이 곧 해상도**다 — 보드 머리 안에서 펼치면 게이트
// 로그 축 2.5디케이드가 200px 에 뭉개지고 그동안 조건 목록이 화면 밖으로 밀린다. 보드 머리에는
// 요약 칩만 남아 "정의는 늘 보인다"를 지키고(T 칩 선례), 클릭이 이 판을 연다.
//
// 옛 숫자칸(NumField 5)을 레일로 바꾼 이유는 필터 레일과 같다: "09:12"·"0.3%"가 몇 건을 죽이는지는
// 분포를 봐야 안다. 다만 **필터가 아니다** — 색은 POINT_DEF teal, 손짓엔 구간 추가/삭제가 없다.
import { useMemo, useState } from "react";
import { APPROACH_MAX_PCT, APPROACH_MIN_PCT, QUALIFY_MAX_MIN, QUALIFY_MIN_MIN } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../../store/workbench.js";
import { usePointGrids, useAutoPoints } from "../../lib/PointGridsContext.js";
import { buildGateDistribution, gateValueAt } from "../../lib/gateDistribution.js";
import { approachInside, buildApproachDist, buildSignalMinuteDist } from "../../lib/defDistribution.js";
import { valueToFrac } from "../../lib/computedAxis.js";
import { minutesOfDay, parseTime, timeOfMinutes } from "../../lib/date.js";
import { clamp01 } from "../../lib/num.js";
import { isDefaultPointDef, qualifyKeyOf } from "../../lib/pointDef.js";
import { openAndFocus } from "../../lib/openPanel.js";
import { NumField } from "../../components/NumField.js";
import { POINT_DEF } from "../../styles/palette.js";
import { OUTCOME_PANEL_ID } from "../outcome/outcomePanelIds.js";
import { TRADE_SIM_PANEL_ID } from "../sim/simPanelIds.js";
import { Rail } from "../filter/rail/Rail.js";
import { RangeTextEditor } from "../filter/RangeTextEditor.js";
import { DefRail } from "./DefRail.js";

const eok = (v: number): string => `${Math.round(v).toLocaleString()}억`;
/** 근접 컷의 스냅 — 도메인이 0.5% 뿐이라 0.05%p(10칸)면 손으로 잡히는 해상도가 된다. */
const APPROACH_STEP = 0.05;

// 좌표 변환은 **모듈 상수**다 — DefRail 의 분포 memo 가 `toFrac` 신원을 물어서, 렌더마다 새 화살표면
// 수천 개짜리 배열을 매 렌더 다시 센다(Rail 의 배열 신원 규율과 같은 함정).
const TIME_SPAN = QUALIFY_MAX_MIN - QUALIFY_MIN_MIN;
const timeToFrac = (v: number): number => clamp01((v - QUALIFY_MIN_MIN) / TIME_SPAN);
const timeFromFrac = (f: number): number => Math.round(QUALIFY_MIN_MIN + clamp01(f) * TIME_SPAN);
const APPROACH_SPAN = APPROACH_MAX_PCT - APPROACH_MIN_PCT;
const apprToFrac = (v: number): number => clamp01((v - APPROACH_MIN_PCT) / APPROACH_SPAN);
const apprFromFrac = (f: number): number =>
    Math.round((APPROACH_MIN_PCT + clamp01(f) * APPROACH_SPAN) / APPROACH_STEP) * APPROACH_STEP;
const apprFmt = (v: number): string => `${v.toFixed(2)}%`;
/** 자격 시각 레일의 탭 임계 — 약 1분(720분 도메인). 기본 0.008 은 5.8분이라 "시초 몇 분" 창을 삼킨다. */
const TIME_TAP_EPS = 1 / TIME_SPAN;

export function PointDefPanel(): JSX.Element {
    const def = useWorkbench((s) => s.pointDef);
    const setDef = useWorkbench((s) => s.setPointDef);
    const reset = useWorkbench((s) => s.resetPointDef);
    const grids = usePointGrids();
    const auto = useAutoPoints();
    // 정밀 입력(팝오버) — 드래그는 09:03 을 못 준다(트랙 430px 에 720분). 레일 판과 같은 편집기·같은 파서.
    const [editor, setEditor] = useState<{ x: number; y: number } | null>(null);

    // 판정 노브만 뽑아 둔다 — 통째 def 를 memo 에 물리면 T·시뮬 드래그가 전수 분포를 헛돌린다
    // (useAutoPointsValue 와 같은 규율).
    const { baselineGateEok, renewalGateEok, qualifyWindows, mergeRisePct, bullOnly, approachPct } = def;
    // 자격 창은 배열이라 memo deps 에 그대로 못 문다(파서가 커밋마다 새 신원을 만든다) — 내용 키로 문다.
    const qualifyKey = qualifyKeyOf(qualifyWindows);
    const byDate = grids.byDate;

    // 게이트 분포 — 게이트 2필드를 타입상 못 보는 계약(PointCandidateDef)이라 컷을 끌어도 불변.
    const gateDist = useMemo(
        () => (byDate ? buildGateDistribution(byDate, { qualifyWindows, mergeRisePct, bullOnly, approachPct }) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [byDate, qualifyKey, mergeRisePct, bullOnly, approachPct],
    );
    // 자격 시각 분포 — **창을 연** 정의의 시그널 시각.
    // ① 창이 이미 전부 열려 있으면(기본) 그건 useAutoPoints 가 이미 판정한 목록과 같은 물건이라
    //    시각만 뽑아 쓴다 — 전 격자 pointsOf 를 한 번 더 도는 비용이 흔한 경우에서 통째로 사라진다.
    // ② 창이 좁혀져 있을 때만 별도로 굽는다. 창 두 필드는 deps 에 **직접은** 없지만, 그 상태의
    //    `auto.points` 신원이 창에 딸려 움직이므로 창을 커밋하면 한 번 더 굽긴 한다(값은 늘 같다 —
    //    buildSignalMinuteDist 가 창을 덮어쓴다). 좁힌 상태의 커밋당 1회라 감수한다.
    const windowOpen = qualifyWindows.length === 0; // 빈 목록 = 전부 통과(이 필드의 어휘)
    const autoPoints = auto.points;
    const minuteDist = useMemo(
        () => {
            if (windowOpen) return autoPoints.map((p) => p.point.min);
            return byDate ? buildSignalMinuteDist(byDate, { baselineGateEok, renewalGateEok, qualifyWindows, mergeRisePct, bullOnly, approachPct }) : [];
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [windowOpen, autoPoints, byDate, baselineGateEok, renewalGateEok, mergeRisePct, bullOnly, approachPct],
    );
    // 근접 분포 — 근접을 타입상 못 보는 계약(QualifyWindowDef).
    const approachDist = useMemo(
        () => (byDate ? buildApproachDist(byDate, { qualifyWindows, bullOnly }) : { depths: [], strict: 0 }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [byDate, qualifyKey, bullOnly],
    );

    // Rail 의 분포는 **프랙션 목록**을 받고 배열 신원을 memo 키로 쓴다 — 렌더마다 새 배열이면 수천 개를 다시 센다.
    const minuteDistView = useMemo(() => ({ ticks: minuteDist.map(timeToFrac) }), [minuteDist]);
    // 표식 층은 **자리**(중복 없는 분)다 — 분포(행 수)와 다른 자라 갈라 만든다(Rail 의 ticks/dist 계약).
    const minuteTicks = useMemo(() => [...new Set(minuteDist)].map(timeToFrac), [minuteDist]);
    // 창 안 정산 — 빈 목록은 전부 통과(판정과 같은 규칙, core inQualifyWindow 의 짝).
    const inWindow = useMemo(
        () => (qualifyWindows.length === 0 ? minuteDist.length : minuteDist.reduce((n, m) => n + (qualifyWindows.some((w) => m >= w.from && m <= w.to) ? 1 : 0), 0)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [minuteDist, qualifyKey],
    );

    // 게이트 축은 도메인(실측 min/max)에 매여 있어 상수로 못 뺀다 — 도메인이 바뀔 때만 새로 만든다.
    const domain = gateDist?.domain ?? null;
    const gateFns = useMemo(
        () =>
            domain === null
                ? null
                : {
                      // span 0(값이 하나뿐인 도메인)은 valueToFrac 이 무조건 0.5 라 손잡이가 값과 무관하게
                      // 트랙 한가운데 선다 — 값 비교로 방향만 잡는다(옛 GateStrip 의 가드를 그대로 승계).
                      toFrac: (v: number): number =>
                          domain.max > domain.min ? valueToFrac(v, domain, "higher", "log") : v <= domain.min ? 0 : 1,
                      // 커밋값 = 그 자리의 **내림** 정수 억(round 면 잡은 칸의 일부가 소멸 쪽으로 넘어간다).
                      fromFrac: (f: number): number => Math.max(1, Math.floor(gateValueAt(f, domain))),
                  },
        [domain],
    );

    return (
        <div style={{ height: "100%", overflow: "auto", background: "var(--bg-primary)", borderLeft: `3px solid ${POINT_DEF}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "4px 8px", fontSize: 11, color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                <span
                    title={auto.error ? `격자 로드 실패: ${auto.error.message}` : "이 정의가 낳는 자동 시그널 수 — 판정 노브를 돌리면 이 수와 아래 전 조건의 분포가 함께 움직입니다"}
                    style={{ whiteSpace: "nowrap" }}
                >
                    시그널 <b style={{ color: POINT_DEF, fontWeight: 700 }}>{auto.isLoading ? "…" : auto.error ? "—" : auto.points.length.toLocaleString()}</b>
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>조건이 아니라 모수 선언 — 돌리면 시그널의 존재·위치가 바뀝니다</span>
                {!isDefaultPointDef(def) && (
                    <button onClick={reset} style={chipStyle(false)}>기본값</button>
                )}
            </div>

            {byDate === null ? (
                <div style={{ padding: 10, fontSize: 11, color: "var(--text-tertiary)" }}>
                    {grids.error ? `격자 로드 실패: ${grids.error.message}` : grids.isLoading ? "격자 로딩 중…" : "그릴 격자가 없습니다"}
                </div>
            ) : (
                <>
                    {/* 게이트 두 줄만 도메인(레벨별 최대 자격 대금)에 매여 있다 — 그릴 값이 없어도
                        자격 시각·근접은 딴 모수를 쓰므로 함께 사라지면 안 된다(편집 수단이 통째로 없어진다). */}
                    {gateDist === null || domain === null || gateFns === null ? (
                        <div style={{ padding: "6px 10px", fontSize: 10.5, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>
                            게이트 분포를 그릴 레벨이 없습니다(기준선 확정 격자 없음) — 그릴 자가 없어 돌파·재돌파는 지금 조절할 수 없습니다
                        </div>
                    ) : (
                        <>
                        <DefRail
                            label="돌파"
                            unit="자 = 레벨 0(차트당 ≤1)"
                            mode="lower"
                            from={baselineGateEok}
                            to={domain.max}
                            values={gateDist.baseline}
                            toFrac={gateFns.toFrac}
                            fromFrac={gateFns.fromFrac}
                            fmt={eok}
                            minLabel={eok(domain.min)}
                            maxLabel={`${eok(domain.max)} (로그)`}
                            note={(inside, outside) => ({
                                text: `소멸 ${outside.toLocaleString()} / 생존 ${inside.toLocaleString()}`,
                                title: "소멸 = 레벨당 최대 자격 대금 < 게이트(등가 정리 — 게이트에서만 정확한 수). 슬롯 2 재돌파는 이 그림에 없어 시그널 소멸은 이보다 많을 수 있습니다",
                            })}
                            onCommit={({ from }) => setDef({ baselineGateEok: from })}
                            title="기준선 돌파 게이트 — 이 대금 미만인 레벨은 통째로 소멸합니다(레벨당 최대 자격 대금 기준, 정수 억)"
                        />
                        <DefRail
                            label="재돌파"
                            unit="자 = 마디 레벨"
                            mode="lower"
                            from={renewalGateEok}
                            to={domain.max}
                            values={gateDist.renewal}
                            toFrac={gateFns.toFrac}
                            fromFrac={gateFns.fromFrac}
                            fmt={eok}
                            minLabel={eok(domain.min)}
                            maxLabel={`${eok(domain.max)} (로그)`}
                            note={(inside, outside) => ({
                                text: `소멸 ${outside.toLocaleString()} / 생존 ${inside.toLocaleString()}`,
                                title: "마디 갱신 게이트 — 소멸 = 그 레벨의 최대 자격 대금 < 게이트(등가 정리)",
                            })}
                            onCommit={({ from }) => setDef({ renewalGateEok: from })}
                            title="마디 갱신(재돌파) 게이트 — 정수 억"
                        />
                        </>
                    )}
                    {/* 자격 시각만 **여러 구간**이라(오전 시초 + 오후 재료처럼 떨어진 창) DefRail 이 아니라
                        필터 레일 `Rail` 을 쓴다 — 빈 트랙 드래그 = 새 구간 · ✕ = 삭제의 대수(railModel)를
                        두 벌로 만들지 않는다. 색만 teal 로 갈아 정의층임을 말한다. 구간이 없으면 = 전부 통과. */}
                    <Rail<number>
                        label="자격 시각"
                        accent={POINT_DEF}
                        note={`창 안 ${inWindow.toLocaleString()} / 밖 ${(minuteDist.length - inWindow).toLocaleString()}`}
                        noteTitle="막대·정산의 모수 = 창을 **비운** 정의로 판정한 시그널의 시각. ⚠ 게이트와 달리 등가 정리가 없다 — 창 밖 시그널이 전부 소멸하는 게 아니라 일부는 같은 레벨의 뒤 캔들로 이동하므로, 위 '시그널 N'과 값이 다를 수 있습니다"
                        tapEps={TIME_TAP_EPS}
                        defaultDistOpen
                        ranges={qualifyWindows.map((w) => ({ from: w.from, to: w.to }))}
                        toFrac={timeToFrac}
                        fromFrac={timeFromFrac}
                        fmt={timeOfMinutes}
                        minLabel={timeOfMinutes(QUALIFY_MIN_MIN)}
                        maxLabel={timeOfMinutes(QUALIFY_MAX_MIN)}
                        dist={minuteDistView}
                        ticks={minuteTicks}
                        onType={(x, y) => setEditor({ x, y })}
                        onChange={(ranges) => setDef({ qualifyWindows: ranges.map((r) => ({ from: Math.min(r.from, r.to), to: Math.max(r.from, r.to) })) })}
                    />
                    <DefRail
                        label="근접"
                        unit="자 = 밴드 진입 봉"
                        mode="upper"
                        from={APPROACH_MIN_PCT}
                        to={approachPct}
                        values={approachDist.depths}
                        toFrac={apprToFrac}
                        fromFrac={apprFromFrac}
                        fmt={apprFmt}
                        minLabel={`0% · 정확 돌파 ${approachDist.strict.toLocaleString()}건은 늘 후보`}
                        maxLabel={`${APPROACH_MAX_PCT}% (굽는 하한)`}
                        note={(inside, outside) => ({
                            text: `후보 +${inside.toLocaleString()} / 밖 ${outside.toLocaleString()}`,
                            title: "기준 밴드 마진 — 전고점·마디·기준선 아래 이 % 안에 든 접근 봉까지 갱신으로 봅니다(0 = 정확 돌파만). 막대 = 진입 봉의 깊이 분포",
                        })}
                        insideOf={approachInside}
                        onCommit={({ to }) => setDef({ approachPct: to })}
                        title="기준 밴드 마진 m' — 후보를 늘리는 노브(정확 돌파는 늘 후보라 이 분포 밖)"
                    />
                </>
            )}

            {editor && (
                <RangeTextEditor
                    anchor={editor}
                    title="자격 시각 구간"
                    hint="줄을 모두 비우고 적용하면 조건 없음(세션 전부). 여러 구간 = 그 합집합이 자격입니다"
                    allowEmptyCommit
                    placeholders={["09:00", "10:30"]}
                    parse={parseTime}
                    rows={qualifyWindows.map((w) => ({ from: timeOfMinutes(w.from), to: timeOfMinutes(w.to) }))}
                    onCommit={(pairs) =>
                        setDef({
                            qualifyWindows: pairs
                                .filter((p) => p.from !== null && p.to !== null)
                                .map((p) => ({ from: minutesOfDay(p.from!), to: minutesOfDay(p.to!) })),
                        })
                    }
                    onClose={() => setEditor(null)}
                />
            )}

            {/* 레일이 아닌 정의 — 값이 두 상태뿐이거나(양봉), 분포를 그릴 자가 아직 없거나(병합),
                편집면이 다른 판인 것들(T·시뮬). 여기 모으는 이유는 "정의가 한자리에 다 보인다"가
                이 판의 값어치라서다. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 8px", fontSize: 11, color: "var(--text-secondary)" }}>
                <button
                    onClick={() => setDef({ bullOnly: !bullOnly })}
                    title="양봉(종가>시가) 캔들만 시그널 자격 — 격자 OHLC 의 읽기 파생(재굽기 없음)"
                    style={chipStyle(bullOnly)}
                >
                    양봉만
                </button>
                <NumField label="병합" suffix="%" value={mergeRisePct} onCommit={(v) => setDef({ mergeRisePct: v })} title="직전 저점 대비 상승폭이 이보다 작은 마디는 레벨에서 병합(잔 갱신 무시) — 0 = 병합 없음" />
                <button
                    onClick={() => openAndFocus(OUTCOME_PANEL_ID)}
                    title="결과 걷기 허용 폭 — 편집은 결과 패널의 T 레일에서(분포를 보며 정하는 값이라 그 판이 편집면)"
                    style={chipStyle(false)}
                >
                    허용 T {def.toleranceT1Pct}%
                </button>
                <button
                    onClick={() => openAndFocus(TRADE_SIM_PANEL_ID)}
                    title={`트레이드 시뮬 노브(진입/손절/익절/트레일/취소) — 정의 payload 동승, 편집은 시뮬 패널에서`}
                    style={chipStyle(false)}
                >
                    시뮬 −{def.sim.entry.pct}/{def.sim.stopPct}/{def.sim.takePct}%
                </button>
            </div>
        </div>
    );
}

const chipStyle = (on: boolean): React.CSSProperties => ({
    fontSize: 11,
    padding: "0 6px",
    border: "1px solid var(--border-default)",
    borderRadius: 3,
    color: on ? "var(--accent-primary)" : "var(--text-secondary)",
    background: on ? "var(--accent-soft)" : "transparent",
    fontWeight: 600,
});
