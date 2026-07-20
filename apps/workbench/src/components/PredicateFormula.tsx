// 술어 수식 렌더 — 보드 배제 필터와 유니버스 알람 규칙 빌더가 공유(같은 core 레지스트리, 같은 표기).
// 토큰: 문자열=그대로 / {p:key}=숫자 파라미터(편집=인라인 입력) / {o:key}=옵션 파라미터(편집=클릭 순환,
// ParamSpec.options 라벨 사용 — market·side·window 등). 수식 미정의 술어는 제목+파라미터 폴백.
import { boardPredicateDef, type BoardPredicateDef, type BoardPredicateInstance } from "@trade-data-manager/market/domain";
import { NumberField } from "../ui/controls.js";

export type FormulaTok = string | { p: string } | { o: string };

export const FORMULAS: Record<string, FormulaTok[]> = {
    // 매물대 — 부등식 `N일 고가% − tol% [op] 당일 고가%`. side 가 연산자(>=내부·이탈 / ≤=돌파·근접).
    newHighFar: [{ p: "window" }, "일 고가% − ", { p: "tol" }, "% ", { o: "side" }, " 당일 고가%", { o: "market" }],
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
        // nowrap + hidden — 폭이 좁아지면 줄바꿈 대신 짤린다(레이아웃이 무너지지 않게, 사용자 피드백).
        <span className="tabular" style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", overflow: "hidden", gap: 1, minWidth: 0 }}>
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
                // 폭 = 자릿수 따라(스피너 여유 포함) — 고정폭이면 tvMin(수만 억) 같은 값이 짤린다.
                const width = Math.max(44, String(val).length * 8.5 + 22);
                return edit ? (
                    <NumberField key={i} value={val} min={spec?.min} max={spec?.max} step={spec?.step} onChange={(e) => onParam(t.p, Number(e.target.value))} style={{ width, border: "none", background: "var(--bg-tertiary)", borderRadius: 4, color: "var(--accent-primary)", fontWeight: 600, textAlign: "center", padding: "0 3px" }} />
                ) : (
                    <span key={i} style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{val}</span>
                );
            })}
        </span>
    );
}

/**
 * 술어 한 줄 — `· [종류▾] 수식 …그리고 [✕]`. 필터 보드·유니버스 규칙 빌더 공용(사용자 피드백 반영):
 * 앞에 점(리스트), "그리고"는 **윗줄 끝**(AND 연결이 자연스럽게 읽히게), 폭 부족 시 줄바꿈 대신 짤림.
 */
export function PredicateRow({ p, edit, last, kinds, onKind, onParam, onRemove }: {
    p: BoardPredicateInstance;
    edit: boolean;
    last: boolean; // 마지막 줄이면 뒤 "그리고" 생략
    kinds: string[]; // 종류 순환 후보(팔레트)
    onKind: (nextKind: string) => void;
    onParam: (key: string, v: number) => void;
    onRemove?: () => void; // undefined = 제거 불가(마지막 하나)
}): JSX.Element {
    const def = boardPredicateDef(p.kind);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" }}>
            <span style={{ flexShrink: 0, color: "var(--text-tertiary)", fontSize: 11 }}>·</span>
            {edit && (
                <button
                    onClick={() => { const i = kinds.indexOf(p.kind); onKind(kinds[(i + 1) % kinds.length]); }}
                    title="클릭: 다음 조건 종류"
                    style={{ border: "none", background: "none", color: "var(--text-secondary)", cursor: "pointer", font: "inherit", fontSize: 11.5, padding: 0, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2 }}
                >
                    {def?.title ?? p.kind}<span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>▾</span>
                </button>
            )}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                <PredicateFormula p={p} def={def} edit={edit} onParam={onParam} />
            </span>
            {!last && <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-tertiary)" }}>그리고</span>}
            {edit && onRemove && <button onClick={onRemove} title="이 조건 제거" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 13, padding: 0, flexShrink: 0, font: "inherit", marginLeft: "auto" }}>✕</button>}
        </div>
    );
}

/** 조건(AND) 추가 — 점선 + 박스(watchlist 종목 추가와 같은 문법, "그리고" 텍스트 버튼 대체). */
export function AddPredicateBox({ onAdd }: { onAdd: () => void }): JSX.Element {
    return (
        <button
            onClick={onAdd}
            title="조건 추가(그리고 — AND)"
            style={{ marginTop: 5, width: "100%", border: "1px dashed var(--border-default)", borderRadius: 6, background: "transparent", color: "var(--text-secondary)", padding: "3px 8px", cursor: "pointer", font: "inherit", fontSize: 12 }}
        >
            ＋
        </button>
    );
}
