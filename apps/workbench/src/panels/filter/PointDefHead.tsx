// 타점 정의 머리 — 자동 Point 판정 정의(게이트·제외 창·병합)의 **유일한 편집 입구**.
// 조건 목록의 줄이 아니라 머리인 이유: 정의는 깔때기 단이 아니라 모수 선언이라(decisions.md), 돌리면
// 전 레일 분포가 재계산된다 — 필터와 같은 줄에 섞으면 "조건 하나 만졌는데 다른 조건 숫자가 다 변하는"
// 화면이 된다. SavedSet 저장/열기에 사본으로 실린다(집합 자립).
import { useWorkbench } from "../../store/workbench.js";
import { isDefaultPointDef } from "../../lib/pointDef.js";
import type { PointDefinition } from "@trade-data-manager/market/domain";

function NumField({ label, suffix, value, min, onCommit, title }: {
    label: string;
    suffix: string;
    value: number;
    min?: number;
    onCommit: (v: number) => void;
    title?: string;
}): JSX.Element {
    return (
        <label title={title} style={{ display: "inline-flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
            <span>{label}</span>
            <input
                type="number"
                min={min ?? 0}
                value={value}
                onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= (min ?? 0)) onCommit(v);
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

/** 편성 보드 머리 한 줄 — 정의 4노브 + 기본값 되돌리기(비기본일 때만). */
export function PointDefHead(): JSX.Element {
    const def = useWorkbench((s) => s.pointDef);
    const setDef = useWorkbench((s) => s.setPointDef);
    const reset = useWorkbench((s) => s.resetPointDef);
    const patch = (k: keyof PointDefinition) => (v: number) => setDef({ [k]: v });
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                padding: "3px 8px",
                margin: "4px 0 6px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                fontSize: 11,
                color: "var(--text-secondary)",
            }}
            title="자동 Point 판정 정의 — 조건(필터)이 아니라 모수 선언: 바꾸면 자동 타점의 존재·위치가 바뀌어 아래 전 조건의 분포가 재계산됩니다"
        >
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>타점 정의</span>
            <NumField label="돌파" suffix="억" value={def.baselineGateEok} onCommit={patch("baselineGateEok")} title="기준선 돌파 게이트(분봉 tvMax2)" />
            <NumField label="재돌파" suffix="억" value={def.renewalGateEok} onCommit={patch("renewalGateEok")} title="마디 갱신 게이트" />
            <NumField label="제외~" suffix="분" value={def.excludeUptoMin} onCommit={patch("excludeUptoMin")} title="이 분(자정기준) 이하 캔들은 Point 자격 없음 — 0 = 프리마켓·시초 포함(기본)" />
            <NumField label="병합" suffix="%" value={def.mergeRisePct} onCommit={patch("mergeRisePct")} title="직전 저점 대비 상승폭이 이보다 작은 마디는 레벨에서 병합(잔 갱신 무시) — 0 = 병합 없음" />
            {!isDefaultPointDef(def) && (
                <button
                    onClick={reset}
                    style={{ fontSize: 11, padding: "0 6px", border: "1px solid var(--border-default)", borderRadius: 3, color: "var(--text-secondary)" }}
                >
                    기본값
                </button>
            )}
        </div>
    );
}
