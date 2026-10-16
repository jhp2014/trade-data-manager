// 화면 공용 부품 — 가운데 안내 · 숫자 입력칸. 패널 머리 줄은 header/(선언 → PanelFrame 이 그린다)로 갔다.
import { useEffect, useState, type ReactNode } from "react";

/** 작은 테두리 버튼 모양 — 줄 안의 [덮어쓰기]·[삭제]와 그 자리 확인 줄의 [지우기]·[취소]가 같이 쓴다. */
export const smallButton: React.CSSProperties = { padding: "0 6px", border: "1px solid var(--border)", borderRadius: 3, background: "var(--surface)", cursor: "pointer", fontSize: 11 };

/** 본문 가운데 안내 문구. */
export function Center({ children }: { children: ReactNode }): JSX.Element {
    return <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 12 }}>{children}</div>;
}

/** 정수 입력칸 — Enter·포커스 이탈에 확정. 숫자가 아니면 그대로 둔다. 범위 자르기·반올림은 받는 쪽이 하고, 칸은 그 결과를 보인다. */
export function NumberField({ value, onCommit, width = 40, title }: { value: number; onCommit: (v: number) => void; width?: number; title?: string }): JSX.Element {
    const [draft, setDraft] = useState(String(value));
    useEffect(() => setDraft(String(value)), [value]);
    // 확정 뒤엔 칸을 늘 지금 값으로 되돌린다 — 받는 쪽이 범위로 자르거나 반올림해 값이 그대로면 effect 가 안 돌아
    // 친 글자("5000")가 남는다. 값이 실제로 바뀌면 effect 가 새 값으로 다시 덮는다.
    const commit = (): void => {
        const n = Number(draft.trim());
        if (draft.trim() !== "" && Number.isFinite(n) && n !== value) onCommit(n);
        setDraft(String(value));
    };
    return (
        <input
            value={draft}
            title={title}
            inputMode="numeric"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                // 친 글자가 있으면 Esc 는 되돌리기만 — 먹어서 판·창이 닫히지 않게(판 스택은 먹힌 Esc 를 넘긴다).
                // 되돌릴 게 없으면 그대로 흘려 판·창이 닫힌다(첫 Esc = 되돌리기, 둘째 = 닫기).
                if (e.key === "Escape" && draft !== String(value)) {
                    e.preventDefault();
                    setDraft(String(value));
                }
            }}
            className="tabular"
            style={{ width, padding: "0 4px", border: "1px solid var(--border)", borderRadius: 3, fontSize: 11, textAlign: "right" }}
        />
    );
}
