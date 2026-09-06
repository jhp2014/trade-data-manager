// 숫자 입력칸(blur/Enter 커밋) — 정의층(PointDefHead)·시뮬 패널이 같은 커밋 규약을 쓴다.
// PointDefHead 지역 컴포넌트였다가 2026-09-06 공용화(원자적 이동 — 사본 두 벌 금지).
import { useEffect, useState } from "react";

export function NumField({ label, suffix, value, min, onCommit, title, normalize }: {
    label: string;
    suffix: string;
    value: number;
    min?: number;
    onCommit: (v: number) => void;
    title?: string;
    /** 커밋 전 값 정규화(게이트 = Math.round, 시뮬 = parseTradeSimParams 경유). 슬라이스 파서와 같은
     *  규칙이어야 한다 — 없으면 "50.4" 커밋이 저장값을 안 바꿀 때(반올림 50 = 기존 50) 입력칸에
     *  초안이 잔상으로 남는다. */
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
