// 급타점 패널 — **"짧은 시간에 급한 재돌파가 몇 번 지나갔나"를 긋는 판**. 규칙: decisions.md 「급타점 수 축」.
//
// 결과 패널의 형제다: 같은 칩 스트립·연동 거울(hotLink)·깔때기 직결(그으면 그 자리에서 편성의 행이 된다).
// 갈리는 건 전제가 **스칼라 하나가 아니라 쌍**이라는 것 — 그래서 위에 레일이 하나가 아니라 둘이다.
//
// 위 두 줄(W·r)은 **필터가 아니다** — 모수를 안 거르고 아래 줄의 값을 바꾸는 전제라 색을 가른다
// (앰버 = LEG_HIGH, 결과 T 레일과 같은 규약. 조건 빨강 FILTER 금지). 그 둘이 실제로 무엇을 합의했는지는
// **기울기 하한 r/W** 한 줄이 말한다 — 노브 둘을 따로 보면 안 보이는 값이라 화면에 적는다.
//
// 편집면이 여기 하나인 것은 우연이 아니다: 같은 값에 축 술어(axisValue)를 거는 두 번째 경로가 생기면
// 그 조건은 부품 평가에서 재료가 없어 조용히 전부 미배치가 된다 — 그래서 필터 레일 패널은 급타점 축을
// 목록에서 뺀다(RailPanel `railAxes`).
import { useMemo } from "react";
import { PanelHeader } from "../../components/ControlChrome.js";
import { useAutoPoints, useHotCounts, useHotPairs } from "../../lib/PointGridsContext.js";
import {
    HOT_R_MAX, HOT_R_MIN, HOT_R_STEP, HOT_W_MAX, HOT_W_MIN, HOT_W_STEP, hotSlopeFloor,
} from "../../lib/hotPoints.js";
import { chartKeyOf, pointKeyOf } from "../../lib/pointKey.js";
import { useSubject } from "../../lib/subject.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { LEG_HIGH } from "../../styles/palette.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { HOT_REVEAL, rowIdOfKey, useBoardReveal, useRevealConsumer } from "../filter/boardReveal.js";
import { Note } from "../filter/grain.js";
import { predicateOfKind, stagesFor, type RailKey } from "../filter/stageBinding.js";
import { OutcomeMetricRail } from "../outcome/OutcomeRails.js";
import { DefRail } from "../pointdef/DefRail.js";
import { hotParamsOf, useLinkedHot } from "./hotLink.js";

/** 급타점 수는 정수 개수다 — 결과 레일의 등락률 표기(+4.2%)를 그대로 쓰면 뜻이 어긋난다. */
const fmtCount = (v: number): string => `${Math.round(v)}개`;

const linear = (min: number, max: number) => ({
    toFrac: (v: number): number => (v - min) / (max - min),
    fromFrac: (f: number, step: number): number => Math.round((min + f * (max - min)) / step) * step,
});
const wScale = linear(HOT_W_MIN, HOT_W_MAX);
const rScale = linear(HOT_R_MIN, HOT_R_MAX);

export function HotPointsPanel(): JSX.Element {
    const { hotStages, linkedId, setLinked, display, setDisplay, conflictAt } = useLinkedHot();
    const countsAt = useHotCounts();
    const pairs = useHotPairs();
    const auto = useAutoPoints();
    const counts = countsAt(display.w, display.r);
    const stages = useWorkbench(selectFilterStages);
    const applyRail = useWorkbench((s) => s.applyFilterRail);
    const v = useFunnel();

    // 마커·멤버 오버레이 — 결과 패널과 같은 계약(subject 판정·viewOf). 전부 타점 층위다.
    const subject = useSubject();
    const markerKey = subject === null ? null
        : subject.time !== null ? pointKeyOf(subject.code, subject.date, subject.time)
            : chartKeyOf(subject.code, subject.date);

    const selectedView = v.viewOf(null);
    const filtersOn = stages.some((st) => st.enabled !== false && st.predicates.length > 0);
    const pointerOn = useWorkbench((s) => s.selectedSetRef !== null || s.funnelSelection !== null) || filtersOn;
    const memberKeys = useMemo<ReadonlySet<string> | null>(
        () => (pointerOn && selectedView.isFiltering && !selectedView.broken
            ? new Set(selectedView.viewedPointRefs.map((p) => pointKeyOf(p.stockCode, p.date, p.time)))
            : null),
        [pointerOn, selectedView],
    );

    // 되짚기 — 보드 목록의 급타점 줄에서 온 신호(편집면이 달라 결과와 키를 가른다).
    const { reveal, markHandled } = useRevealConsumer(HOT_REVEAL);
    const { registerRow, flash } = useBoardReveal(reveal, stages, { onHandled: markHandled });

    // 값 분포 요약 — 값이 사실상 3칸(0/1/2/3+)이라 머리글이 그 셋을 그대로 센다.
    const summary = useMemo(() => {
        let zero = 0, one = 0, many = 0;
        for (const n of counts.byKey.values()) {
            if (n === 0) zero++;
            else if (n === 1) one++;
            else many++;
        }
        return { zero, one, many, total: counts.byKey.size };
    }, [counts]);

    const key: RailKey = { kind: "hotPoints", w: display.w, r: display.r };
    const stage = stagesFor(stages, key)[0];
    const rowId = rowIdOfKey(key);
    const slope = hotSlopeFloor(display.w, display.r);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>급타점</span>
                <span title="모수 = 시그널 전부. 값 = 창 W 안에서 완결된 연속 타점 쌍 중 종가 상승률이 r 이상인 쌍의 개수 — 결손이 없다(첫 돌파는 0)"
                    style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }} className="tabular">
                    {summary.total.toLocaleString()} · 0개 {summary.zero.toLocaleString()}
                    {" · "}1개 {summary.one.toLocaleString()}
                    {" · "}2개+ {summary.many.toLocaleString()}
                </span>
                <span title="그은 컷은 곧바로 집합 편성의 조건이 된다 — 필터 레일 패널과 같은 직결" style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>
                    긋는 순간 조건
                </span>
            </PanelHeader>

            {/* 칩 스트립 = 급타점 조건 목록의 파생 뷰(결과 패널과 같은 관용구) — 클릭 = 연동 전환.
                연동된 칩의 (W,r) 이 곧 표시 값이고 아래 줄들이 그 단면을 그린다. "탐색" = 연동 해제. */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", borderBottom: "1px solid var(--border-subtle)", overflowX: "auto", whiteSpace: "nowrap" }} className="no-scrollbar">
                <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", flexShrink: 0 }}>조건</span>
                <button onClick={() => setLinked(null)} title="연동 해제 — 조건에 매이지 않은 탐색 값으로 둘러본다(그으면 그 (W,r) 의 조건이 생긴다)"
                    style={chip(linkedId === null)}>탐색 {display.w}분/{display.r}%</button>
                {hotStages.map((st) => {
                    const p = hotParamsOf(st);
                    return (
                        <button key={st.id} onClick={() => setLinked(st.id)}
                            title={`${p?.w}분/${p?.r}% — 클릭하면 이 조건의 값으로 판을 맞춥니다${st.enabled === false ? " (보드에서 꺼둔 조건)" : ""}`}
                            style={{ ...chip(linkedId === st.id), opacity: st.enabled === false ? 0.5 : 1 }}>
                            {p?.w}분/{p?.r}%
                        </button>
                    );
                })}
                {hotStages.length === 0 && <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>아직 없음 — 아래 개수 줄을 그으면 이 (W,r) 의 조건이 섭니다</span>}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 0" }}>
                {auto.points.length === 0 && <Note>자동 시그널이 아직 없습니다 — 격자 로딩 중이거나 정의 게이트가 전부 걸렀습니다</Note>}

                {/* 전제 두 줄 — 모수를 안 거른다(앰버). 분포는 **노브 무관**인 전 연속 쌍이라 드래그 중에도 안 흔들린다. */}
                <DefRail
                    label="창 W" unit="연속 타점 쌍의 소요 분" accent={LEG_HIGH}
                    toFrac={wScale.toFrac} fromFrac={(f) => wScale.fromFrac(f, HOT_W_STEP)}
                    fmt={(x) => `${x}분`} minLabel={`${HOT_W_MIN}분`} maxLabel={`${HOT_W_MAX}분`}
                    values={pairs.spans} mode="upper" from={HOT_W_MIN} to={display.w}
                    note={(inside, outside) => ({
                        text: `창 안 ${inside.toLocaleString()} · 밖 ${outside.toLocaleString()}`,
                        title: "이 창 안에서 완결된 쌍만 세어집니다 — 창을 좁히는 것이 곧 기울기 임계를 올리는 것입니다",
                    })}
                    onCommit={({ to }) => setDisplay(to, display.r)}
                    title="창 W — 쌍의 두 점이 모두 이 안에 들어와야 세어집니다"
                />
                <DefRail
                    label="상승률 r" unit="연속 타점 쌍의 종가 상승률" accent={LEG_HIGH}
                    toFrac={rScale.toFrac} fromFrac={(f) => rScale.fromFrac(f, HOT_R_STEP)}
                    fmt={(x) => `${x}%`} minLabel={`${HOT_R_MIN}%`} maxLabel={`${HOT_R_MAX}%`}
                    values={pairs.rises} mode="lower" from={display.r} to={HOT_R_MAX}
                    note={(inside, outside) => ({
                        text: `급함 ${inside.toLocaleString()} · 아님 ${outside.toLocaleString()}`,
                        title: "이 상승률 이상인 쌍만 '급하다'로 셉니다 — 격자 zigzag 임계가 2% 라 그보다 충분히 위여야 실패 재도전이 안 섞입니다",
                    })}
                    onCommit={({ from }) => setDisplay(display.w, from)}
                    title="상승률 r — 이 값 이상 오른 쌍만 세어집니다"
                />
                <div style={{ padding: "1px 0 5px 60px", fontSize: 10, color: conflictAt !== null ? "var(--warning)" : "var(--text-tertiary)" }} className="tabular">
                    {conflictAt !== null
                        ? `${conflictAt.w}분/${conflictAt.r}% 에 같은 조건이 이미 있습니다`
                        : `기울기 하한 ${slope.toFixed(2)}%/분${linkedId === null ? " · 탐색(조건 아님)" : " · 연동 조건의 값"}`}
                </div>

                {/* 값 줄 — 여기만 필터다(빨강 컷). 그으면 (W × r) 자리의 조건이 선다. */}
                <div ref={registerRow(rowId)} title="창 W 안에서 완결된 연속 타점 쌍 중 상승률 ≥ r 인 쌍의 개수 — 클수록 '기회가 여러 번 지나간 뒤'입니다"
                    style={{ opacity: stage && !stage.enabled ? 0.5 : 1, background: flash === rowId ? "var(--accent-soft)" : "transparent", transition: "background .35s ease" }}>
                    <OutcomeMetricRail
                        name="급타점 수"
                        values={counts.byKey as Map<string, number>}
                        ranges={predicateOfKind(stages, key, "hotPoints")?.ranges ?? []}
                        markerKey={markerKey}
                        memberKeys={memberKeys}
                        fmtValue={fmtCount}
                        onChange={(ranges) => applyRail(key, ranges ? { kind: "hotPoints", w: display.w, r: display.r, ranges } : null)}
                    />
                </div>
                <div style={{ height: 8 }} />
            </div>
        </div>
    );
}

/** 칩 — 결과 패널과 같은 앰버 결(머리글은 관리소가 아니라 입구라 조건 빨강을 안 쓴다). */
const chip = (on: boolean): React.CSSProperties => ({
    fontSize: 10, padding: "0 6px", borderRadius: 8, cursor: "pointer",
    border: `1px solid ${on ? LEG_HIGH : "var(--border-default)"}`,
    color: on ? LEG_HIGH : "var(--text-secondary)",
    background: on ? "var(--warning-soft)" : "transparent",
    fontWeight: on ? 700 : 400,
});
