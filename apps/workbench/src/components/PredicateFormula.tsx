// 술어 수식 렌더 — 보드 배제 필터와 유니버스 알람 규칙 빌더가 공유(같은 core 레지스트리, 같은 표기).
// 토큰: 문자열=그대로 / {p:key}=숫자 파라미터(편집=인라인 입력) / {o:key}=옵션 파라미터(편집=클릭 순환,
// ParamSpec.options 라벨 사용 — market·side·window 등). 수식 미정의 술어는 제목+파라미터 폴백.
import type { BoardPredicateDef, BoardPredicateInstance } from "@trade-data-manager/market/domain";
import { NumberField } from "../ui/controls.js";

export type FormulaTok = string | { p: string } | { o: string };

export const FORMULAS: Record<string, FormulaTok[]> = {
    // 매물대 — side(내부/돌파)가 방향을 정한다(내부=창최고에서 tol 이상 이탈, 돌파=창최고 근접).
    newHighFar: [{ p: "window" }, "일 매물대 ", { o: "side" }, " · 갭 ", { p: "tol" }, "%", { o: "market" }],
    minAmtFew: ["분봉 ", { p: "eok" }, "억+ 대금 ≤ ", { p: "maxCount" }, "회"],
    smallAmount: ["일봉 대금 < ", { p: "ltEok" }, "억"],
    weakHigh: ["당일 고가% < ", { p: "ltPct" }, "%"],
    signal: [{ o: "window" }, " Δ등락 ≥ ", { p: "rateMin" }, "%p 그리고 Δ대금 ≥ ", { p: "tvMin" }, "억"],
    marketCap: ["시총 ≤ ", { p: "lteEok" }, "억"],
    rank: ["테마 순위 ≤ ", { p: "threshold" }, "위", { o: "market" }],
};

/** 술어 한 개의 수식 렌더 — edit=숫자 입력·옵션 순환, 아니면 순수 텍스트. */
export function PredicateFormula({ p, def, edit, onParam }: {
    p: BoardPredicateInstance;
    def?: BoardPredicateDef;
    edit: boolean;
    onParam: (key: string, v: number) => void;
}): JSX.Element {
    const toks = FORMULAS[p.kind];
    if (!toks || !def) {
        // 폴백 — 수식 미정의 술어는 제목 + "라벨 값" 나열(새 술어 추가 시에도 안 깨짐).
        return <span>{def?.title ?? p.kind}{def?.params.map((ps) => ` ${ps.label} ${p.params[ps.key] ?? ps.def}`).join("") ?? ""}</span>;
    }
    return (
        <span className="tabular" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 1, minWidth: 0 }}>
            {toks.map((t, i) => {
                if (typeof t === "string") return <span key={i} style={{ whiteSpace: "pre" }}>{t}</span>;
                const spec = def.params.find((s) => s.key === ("p" in t ? t.p : t.o));
                if ("o" in t) {
                    const options = spec?.options ?? [];
                    const cur = Number(p.params[t.o] ?? spec?.def ?? 0);
                    const label = options[cur] ?? String(cur);
                    return edit ? (
                        <button key={i} onClick={() => onParam(t.o, (cur + 1) % Math.max(options.length, 1))} title={`${spec?.label ?? t.o} 순환`} style={{ border: "none", background: "none", color: "var(--text-secondary)", fontWeight: 600, padding: "0 2px", marginLeft: 2, fontSize: 10.5, cursor: "pointer", font: "inherit", flexShrink: 0 }}>{label}</button>
                    ) : (
                        <span key={i} style={{ marginLeft: 3, fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>{label}</span>
                    );
                }
                const val = p.params[t.p] ?? spec?.def ?? 0;
                return edit ? (
                    <NumberField key={i} value={val} min={spec?.min} max={spec?.max} step={spec?.step} onChange={(e) => onParam(t.p, Number(e.target.value))} style={{ width: 44, border: "none", background: "var(--bg-tertiary)", borderRadius: 4, color: "var(--accent-primary)", fontWeight: 600, textAlign: "center", padding: "0 3px" }} />
                ) : (
                    <span key={i} style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{val}</span>
                );
            })}
        </span>
    );
}
