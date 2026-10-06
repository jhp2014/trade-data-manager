// 「테마 선 차트」 판(옛 존 추세 — 내부 id zone-trend 불변) — 단면의 "어떻게 왔나": 시선 종목의
// 테마 멤버 ∩ 존을 하루 등락률 지그재그 선으로. View 전용(판정·편집 없음). 존은 「존 ▾」 복사
// (시장 단면과 같은 목록 — ZoneMenu 공용), 멤버십은 현재 분 기준(그 분에 존을 만족하는 테마 동료의
// 과거 궤적). y = 자동 맞춤(시선 하루 기준) + 수동(휠·팬·더블클릭 복귀 — (종목,날짜) 낟알이라
// 다른 종목에선 자동, 제자리로 돌아오면 부활), x = 시작~현재 분 +10분. 규칙 = decisions.md 「테마 선 차트 판」.
import { useEffect, useId, useMemo, useState } from "react";
import { usePanelHeader } from "../../components/header/registry.js";
import { useDock } from "../../store/dock.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { useWorkbench } from "../../store/workbench.js";
import { useSubject } from "../../lib/subject.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { formatValue } from "../../lib/format.js";
import { usePointGrids } from "../../lib/PointGridsContext.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { chainSourceRowsOf } from "../breakout/useChainOverlay.js";
import { ZoneMenu } from "../themeRank/ZoneMenu.js";
import { parseScopeZone } from "../themeRank/zoneSources.js";
import { useDisplayMinute } from "../themeRank/displayMinute.js";
import { fmtHms, fmtMin } from "../themeRank/useThemePlane.js";
import { ZoneTrendView } from "./ZoneTrendView.js";
import { autoYViewOf, DEFAULT_Y_VIEW, hoverDetailOf, trendSampleAt, zoneTrendModelOf } from "./zoneTrendModel.js";
import { X_TAIL_MIN, type XView, type YView } from "./zoneTrendLayers.js";

/** 축약 임계 선택지(가산 %p) — 세그먼트. 본론은 2(격자와 같은 수) · 1 은 자세히, 3·5 는 성긴 질감. */
const PCT_CHOICES = [1, 2, 3, 5] as const;

export function ZoneTrendPanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    const { nameOf } = useStockNamesDict();
    const subject = useSubject();
    const setCode = useWorkbench((s) => s.setCode);
    const setFocus = useWorkbench((s) => s.setFocus);
    const focusTime = useWorkbench((s) => s.focus.time);
    const originId = useId();

    // ── 그날 스냅샷·표시 분 — 시장 단면과 **같은 자**(displayMinute 한 벌·같은 클램프 규칙).
    const snapQ = useDaySnapshot(subject?.date ?? null);
    const stocks = snapQ.data?.stocks;
    const { minuteRange, minute } = useDisplayMinute(stocks, subject, focusTime);

    // ── 설정 — 인스턴스 영속(⧉ 복제 시 사본이 같이 간다): 존 사본 + 축약 임계.
    const [zoneRaw, setZone] = usePanelUi<unknown>(panelId, "zone", null);
    const zone = useMemo(() => parseScopeZone(zoneRaw), [zoneRaw]);
    const [pctRaw, setPct] = usePanelUi<unknown>(panelId, "zigzagPct", 2);
    const pct = typeof pctRaw === "number" && Number.isFinite(pctRaw) && pctRaw > 0 ? pctRaw : 2;

    // ── 모델 — 시선-파생 의존성은 원시값(code·date)만(스크럽 틱마다 하루치를 다시 굽지 않게 — 기존 불변식).
    const model = useMemo(() => {
        if (!stocks || !subject || minute === null) return null;
        return zoneTrendModelOf({ stocks, date: subject.date, minute, zone, thresholdPt: pct, subjectCode: subject.code });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stocks, subject?.date, subject?.code, minute, zone, pct]);

    // ── 손짓 상태 — 판이 쥔다(controlled view — 썸네일 확장 시 칸끼리 동기의 전제).
    const [hovered, setHovered] = useState<string | null>(null);
    const [crosshair, setCrosshair] = useState<number | null>(null);

    // ── hover 상세(캔들·대금 마커·밴드·사슬) — 사슬·밴드의 정의는 보는 집합의 「돌파」 줄
    // (기본 차트 사슬 층과 같은 출처 chainSourceRowsOf, 줄이 여럿이면 첫 줄 — 패널별 선택은 필요해지면).
    // 기준선은 격자 번들(/point-grids) — 앵커 차트가 아니면 null(기준선 밴드만 없다).
    const { slowExpr, slowSets } = useFunnel();
    const chainPred = useMemo(() => chainSourceRowsOf(slowExpr, slowSets)[0]?.pred ?? null, [slowExpr, slowSets]);
    const pointGrids = usePointGrids();
    const hoverDetail = useMemo(() => {
        if (hovered === null || !stocks || !subject || minute === null || model === null) return null;
        // 유령 가드 — 포인터를 둔 채 스크럽으로 그 종목이 모수에서 빠지면, 화면에 선이 없는 종목의
        // 캔들이 남는다(리뷰 지적). 지금 그려진 선(시선·멤버)만 상세를 가진다.
        if (hovered !== subject.code && !model.members.some((m) => m.code === hovered)) return null;
        // 기준선 재료(격자 번들) 로딩 중엔 사슬·밴드를 **보류**하고 캔들만 — 기준선 없이 계산하면
        // 기본 차트 사슬 층("같은 출처·같은 계산")과 그 사이 동안 사슬이 다르다(리뷰 지적).
        const gridsReady = pointGrids.byDate !== null;
        const knobs = chainPred !== null && gridsReady ? { zigzagPct: chainPred.zigzagPct, bandPct: chainPred.bandPct } : null;
        const baseline = gridsReady ? pointGrids.gridOf(hovered, subject.date)?.base ?? null : null;
        return hoverDetailOf(stocks, hovered, minute, knobs, baseline);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hovered, stocks, subject?.date, subject?.code, minute, model, chainPred, pointGrids.byDate]);

    // ── y 창 — 자동 맞춤 [min(−3,최저−3), 최고+3] 기본, 수동값은 세션 + (종목,날짜) 낟알: 다른
    // 종목에선 자동("변경할 때마다 그에 맞는 스케일" — 2026-10-06 사용자 확정), 제자리 복귀면 부활.
    const setSessionUi = useWorkbench((s) => s.setSessionUi);
    const rawY = useWorkbench((s) => s.sessionUi[panelId]?.["ydom"]) as (YView & { code: string; date: string }) | undefined;
    const autoY = useMemo(
        () => (stocks && subject ? autoYViewOf(stocks, subject.code) : DEFAULT_Y_VIEW),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [stocks, subject?.code],
    );
    // 참조 안정 — 수동값이 켜진 동안 렌더마다 새 객체면 View 의 scales memo 가 깨져 포인터 이동마다
    // 멤버 ops 가 재계산된다(box memo 와 같은 이유).
    const yView = useMemo(
        () => (rawY !== undefined && subject !== null && rawY.code === subject.code && rawY.date === subject.date
            ? { lo: rawY.lo, hi: rawY.hi }
            : autoY),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rawY, autoY, subject?.code, subject?.date],
    );
    const setYView = (v: YView | null): void => {
        if (!subject) return;
        setSessionUi(panelId, "ydom", v === null ? undefined : { ...v, code: subject.code, date: subject.date });
    };

    // ── x(시간) 창 — 자동 [세션 시작, 현재 분 + 꼬리](스크럽 따라 자람), 수동은 ydom 과 같은
    // (종목,날짜) 낟알(차트처럼 끌어 본 구간은 그 종목에 머무는 동안 유지, 떠나면 자동 복귀).
    const rawX = useWorkbench((s) => s.sessionUi[panelId]?.["xdom"]) as (XView & { code: string; date: string }) | undefined;
    const autoX = useMemo<XView>(
        () => (minuteRange !== null && minute !== null
            ? { lo: minuteRange.lo, hi: minute + X_TAIL_MIN }
            : { lo: 540, hi: 540 + X_TAIL_MIN }),
        [minuteRange, minute],
    );
    const xView = useMemo(
        () => (rawX !== undefined && subject !== null && rawX.code === subject.code && rawX.date === subject.date
            ? { lo: rawX.lo, hi: rawX.hi }
            : autoX),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rawX, autoX, subject?.code, subject?.date],
    );
    const setXView = (v: XView | null): void => {
        if (!subject) return;
        setSessionUi(panelId, "xdom", v === null ? undefined : { ...v, code: subject.code, date: subject.date });
    };

    /** 선 클릭 = 그 종목으로 시선 이동(정규화 판 라벨 클릭 관례). 하루 선택이면 표시 분을 실체화한다. */
    const navigate = (code: string): void => {
        if (!subject || code === subject.code) return;
        if (focusTime === null && minute !== null) setFocus({ date: subject.date, code, time: fmtHms(minute) }, originId);
        else setCode(code, originId);
    };

    /** hover 칩 — 크로스헤어 분의 **실값**(선은 축약이라 선 위 값과 다를 수 있다 — decisions). */
    const chipTextOf = (code: string, m: number): string => {
        const s = stocks ? trendSampleAt(stocks, code, m) : null;
        const amount = s?.amount != null ? formatValue(s.amount / 1e8, { suffix: "억", decimals: s.amount < 1e9 ? 1 : 0, signed: false }) : "—";
        const rate = s !== null ? formatValue(s.rate, { suffix: "%", decimals: 1, signed: true }) : "—";
        return `${nameOf(code)} ${fmtMin(m)} · 등락 ${rate} · 분대금 ${amount} · 클릭 = 이동`;
    };

    // 탭 제목 = 카탈로그 이름 그대로(시장 단면과 같은 정규화).
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    // ── 헤더 선언 — 정보/컨트롤 분리(규약). 존은 정보(출처)와 컨트롤(판)로 중복 선언한다.
    usePanelHeader(panelId, {
        info: [
            {
                id: "subject", name: "주체", tabular: true, defaultPlace: "tab",
                help: "시선 종목·날짜·표시 분(전역 시선 직결) — 하늘색 선이 이 종목이다",
                text: () => (subject ? `${nameOf(subject.code)} · ${subject.date}${minute !== null ? ` ${fmtMin(minute)}` : ""}` : null),
            },
            {
                id: "zone", name: "존 출처", tone: "accent",
                help: zone
                    ? `모수 = 시선 테마 멤버 ∩ 「${zone.from}」의 존 사본(원본을 고쳐도 안 따라간다) — 현재 분 기준 과거 궤적`
                    : "존이 없다 — 컨트롤 판의 「존」에서 걸린 테마 조건의 존 값을 복사하면 테마 동료 선이 선다",
                text: () => (zone ? `존: ${zone.from}` : null),
            },
            {
                id: "members", name: "멤버 수", tabular: true,
                help: "현재 분에 존을 만족하는 시선 테마 동료 수(시선 겸직 포함)",
                text: () => (model !== null && zone !== null ? `멤버 ${model.memberCount}` : null),
            },
        ],
        controls: [
            {
                kind: "popover", id: "zone", name: "존 선택", label: zone !== null ? zone.from : "존", width: 360, nav: true,
                on: zone !== null, activeColor: "var(--accent-primary)",
                help: "걸린 테마 조건에서 존 값을 복사해 이 판의 모수로 쓴다(판정 없음 — 조건은 일별 타점 [생성])",
                renderPopover: (close) => <ZoneMenu zone={zone} onPick={(z) => { setZone(z); close(); }} />,
            },
            {
                kind: "choice", id: "zigzag", name: "축약 임계",
                help: "선의 지그재그 축약 임계(가산 %p) — 뷰 전용 축약이라 구운 격자의 마디와 미세하게 다를 수 있다",
                values: PCT_CHOICES.map((v) => ({ v: String(v), label: `${v}%` })),
                value: String(pct),
                set: (v) => setPct(Number(v)),
            },
        ],
    });

    return (
        <div style={wrap}>
            {!subject && <div style={empty}>차트·시트에서 종목을 짚으면 그 하루의 테마 선 차트가 선다</div>}
            {subject && snapQ.isError && <div style={{ ...empty, color: "var(--rise)" }}>복기 파생 로드 실패 — {(snapQ.error as Error).message}</div>}
            {subject && snapQ.isLoading && <div style={empty}>그날 복기 파생을 당기는 중…</div>}
            {subject && !snapQ.isError && !snapQ.isLoading && (model === null || minuteRange === null || minute === null) && (
                <div style={empty}>그날 분봉 파생이 없다 — 미수집이거나 오늘(수집 전)이다</div>
            )}
            {subject && model !== null && minuteRange !== null && minute !== null && (
                <>
                    {zone === null && (
                        <div style={notice}>존이 없다 — 컨트롤 「존」에서 복사하면 테마 동료 선이 선다(지금은 시선 선만)</div>
                    )}
                    <ZoneTrendView model={model} minuteRange={minuteRange} minute={minute}
                        xView={xView} onXView={setXView}
                        yView={yView} onYView={setYView}
                        hovered={hovered} onHover={setHovered} hoverDetail={hoverDetail}
                        crosshair={crosshair} onCrosshair={setCrosshair}
                        onPick={navigate} chipTextOf={chipTextOf} />
                </>
            )}
        </div>
    );
}

const wrap: React.CSSProperties = { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" };
const empty: React.CSSProperties = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 12 };
const notice: React.CSSProperties = { padding: "3px 10px", fontSize: 11, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 };
