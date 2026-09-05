// 타점 정의 머리 — 자동 Point 판정 정의(게이트·제외 창·병합)의 **유일한 편집 입구**.
// 조건 목록의 줄이 아니라 머리인 이유: 정의는 깔때기 단이 아니라 모수 선언이라(decisions.md), 돌리면
// 전 레일 분포가 재계산된다 — 필터와 같은 줄에 섞으면 "조건 하나 만졌는데 다른 조건 숫자가 다 변하는"
// 화면이 된다. SavedSet 저장/열기에 사본으로 실린다(집합 자립).
import { useEffect, useState } from "react";
import { APPROACH_MAX_PCT, APPROACH_MIN_PCT } from "@trade-data-manager/market/domain";
import { useWorkbench } from "../../store/workbench.js";
import { useAutoPoints } from "../../lib/PointGridsContext.js";
import { isDefaultPointDef } from "../../lib/pointDef.js";
import { openAndFocus } from "../../lib/openPanel.js";
import { POINT_DEF } from "../../styles/palette.js";
import { OUTCOME_PANEL_ID } from "../outcome/outcomePanelIds.js";
import { GateStrip } from "./GateStrip.js";

function NumField({ label, suffix, value, min, onCommit, title, normalize }: {
    label: string;
    suffix: string;
    value: number;
    min?: number;
    onCommit: (v: number) => void;
    title?: string;
    /** 커밋 전 값 정규화(게이트 = Math.round). 슬라이스 파서(parsePointDef)와 같은 규칙이어야 한다 —
     *  없으면 "50.4" 커밋이 저장값을 안 바꿀 때(반올림 50 = 기존 50) 입력칸에 초안이 잔상으로 남는다. */
    normalize?: (v: number) => number;
}): JSX.Element {
    // 커밋은 blur/Enter 에서만 — 정의는 모수 선언이라 한 번 바뀌면 전 파생(1만 Point·특징·깔때기)이
    // 재계산된다. onChange 즉시 커밋이면 "150" 타이핑이 1→15→150 세 번 계산을 물고, 지운 순간의
    // 빈 문자열이 Number("")===0 으로 게이트 0 을 커밋하는 함정까지 있다.
    const [draft, setDraft] = useState(String(value));
    useEffect(() => setDraft(String(value)), [value]);
    const commit = (): void => {
        const raw = Number(draft);
        if (draft.trim() !== "" && Number.isFinite(raw) && raw >= (min ?? 0)) {
            const v = normalize ? normalize(raw) : raw;
            onCommit(v);
            setDraft(String(v)); // 정규화가 저장값을 안 바꿔도(useEffect 미발화) 입력칸은 실값을 보인다
        } else setDraft(String(value)); // 무효 입력은 되돌린다(조용한 0 커밋 금지)
    };
    return (
        <label title={title} style={{ display: "inline-flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
            <span>{label}</span>
            <input
                type="number"
                min={min ?? 0}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                }}
                style={{
                    width: 44,
                    fontSize: 11,
                    padding: "1px 3px",
                    border: "1px solid var(--border-default)",
                    borderRadius: 3,
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                }}
            />
            <span style={{ color: "var(--text-tertiary)" }}>{suffix}</span>
        </label>
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

/** 편성 보드 머리 — 판정 노브 6(게이트 2·제외·병합·양봉·근접) + 모수 크기 + 게이트 분포 스트립 +
 *  허용 폭 T 표시 칩 + 기본값 되돌리기. 왼쪽 POINT_DEF 띠 = 모수 선언층 표식(필터 줄이 아니라는
 *  시각 구분 — T 레일 앰버 선례, decisions.md 2026-09-06). */
export function PointDefHead(): JSX.Element {
    const def = useWorkbench((s) => s.pointDef);
    const setDef = useWorkbench((s) => s.setPointDef);
    const reset = useWorkbench((s) => s.resetPointDef);
    const auto = useAutoPoints();
    // 펼침은 컴포넌트 수명(usePersistedState 단일 소유 규칙 — 영속 키 신설 금지). 접힘 기본 =
    // 레일의 "분포" 링크와 같은 문법(보드 머리가 상시 두꺼워지지 않게). 접히면 분포 memo 도 안 돈다.
    const [distOpen, setDistOpen] = useState(false);
    type NumKey = "baselineGateEok" | "renewalGateEok" | "excludeUptoMin" | "mergeRisePct" | "approachPct"; // 키 순회 타입 금지 — bullOnly·T 가 섞인다
    const patch = (k: NumKey) => (v: number) => setDef({ [k]: v });
    return (
        <div
            style={{
                margin: "4px 0 6px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
                borderLeft: `3px solid ${POINT_DEF}`,
                borderRadius: 4,
                overflow: "hidden",
            }}
            title="자동 Point 판정 정의 — 조건(필터)이 아니라 모수 선언: 바꾸면 자동 타점의 존재·위치가 바뀌어 아래 전 조건의 분포가 재계산됩니다"
        >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "3px 8px", fontSize: 11, color: "var(--text-secondary)" }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>타점 정의</span>
            <span
                title={auto.error ? `격자 로드 실패: ${auto.error.message}` : "현재 모수 — 이 정의가 낳는 자동 타점(시그널) 수. 깔때기 머리글의 '전체'는 표시 층위(하루/타점)의 수라 다른 자일 수 있음"}
                style={{ whiteSpace: "nowrap" }}
            >
                타점 <b style={{ color: POINT_DEF, fontWeight: 700 }}>{auto.isLoading ? "…" : auto.error ? "—" : auto.points.length.toLocaleString()}</b>
            </span>
            <NumField label="돌파" suffix="억" value={def.baselineGateEok} onCommit={patch("baselineGateEok")} normalize={Math.round} title="기준선 돌파 게이트(분봉 거래대금) — 정수 억" />
            <NumField label="재돌파" suffix="억" value={def.renewalGateEok} onCommit={patch("renewalGateEok")} normalize={Math.round} title="마디 갱신 게이트 — 정수 억" />
            <NumField label="제외~" suffix="분" value={def.excludeUptoMin} onCommit={patch("excludeUptoMin")} title="이 분(자정기준) 이하 캔들은 Point 자격 없음 — 0 = 프리마켓·시초 포함(기본)" />
            <NumField label="병합" suffix="%" value={def.mergeRisePct} onCommit={patch("mergeRisePct")} title="직전 저점 대비 상승폭이 이보다 작은 마디는 레벨에서 병합(잔 갱신 무시) — 0 = 병합 없음" />
            <NumField
                label="근접"
                suffix="%"
                value={def.approachPct}
                onCommit={patch("approachPct")}
                normalize={(v) => Math.min(APPROACH_MAX_PCT, Math.max(APPROACH_MIN_PCT, v))} // 파서와 같은 클램프 — "0.7" 커밋이 0.5 로 잘릴 때 초안 잔상 방지
                title="기준 밴드 마진 — 전고점·마디·기준선 아래 이 % 안에 든 접근 캔들부터 갱신 영역으로 판정(0 = 정확 돌파만, 최대 0.5 = 굽는 하한)"
            />
            <button
                onClick={() => setDef({ bullOnly: !def.bullOnly })}
                title="양봉(종가>시가) 캔들만 Point 자격 — 격자의 캔들 사실에서 파생하는 읽기 노브(끄는 데 재계산만, 재굽기 없음)"
                style={chipStyle(def.bullOnly)}
            >
                양봉만
            </button>
            <button
                onClick={() => setDistOpen((v) => !v)}
                title={distOpen ? "게이트 분포 접기" : "게이트 분포 펼치기 — 레벨당 최대 자격 대금(로그). 게이트를 어디까지 조이면 몇이 소멸하는지 드래그 전에 보입니다"}
                style={distOpen ? { ...chipStyle(false), color: POINT_DEF, textDecoration: "underline" } : chipStyle(false)}
            >
                분포
            </button>
            {/* 허용 폭 T — 정의의 일부지만 **편집면은 결과 패널의 T 레일 하나**다(분포를 보며 정해야 하는 값).
                여기 두는 이유: 정의는 보드 머리에서 항상 보인다 — 안 그러면 결과 패널이 닫힌 채 T 가
                결과 값·차트 표식을 조용히 지배한다. 클릭 = 그 편집면으로. */}
            <button
                onClick={() => openAndFocus(OUTCOME_PANEL_ID)}
                title="결과 걷기 허용 폭 — 기본 허용 T1(연장 고점·저가·차트 표식의 기준)과 Δ 관찰 폭 T2. 편집은 결과 패널의 T 레일에서"
                style={chipStyle(false)}
            >
                허용 T1 {def.toleranceT1Pct}% · Δ~{def.toleranceT2Pct}%
            </button>
            {!isDefaultPointDef(def) && (
                <button
                    onClick={reset}
                    style={{ fontSize: 11, padding: "0 6px", border: "1px solid var(--border-default)", borderRadius: 3, color: "var(--text-secondary)" }}
                >
                    기본값
                </button>
            )}
        </div>
        {distOpen && <GateStrip />}
        </div>
    );
}
