// 값 하나를 **손을 멈춘 뒤에** 따라오게 하는 훅.
//
// 편집이 곧 저장이 된 뒤로(2026-09-20) 조건을 한 글자 만질 때마다 저장물이 바뀌고, 그걸 구독하는
// 패널이 즉시 재평가된다 — 하루 우주의 평가 한 번이 **0.25~0.47초**(2026-09-22 실측)이고
// 그 앞에 `/day-replay` 13MB 조회가 붙는다. 한 글자마다 그걸 돌릴 이유가 없다.
// 그래서 **저장은 즉시, 평가는 손을 멈춘 뒤**로 나눈다(decisions 「집합 편성 — 묶음은 곧 이름 붙은
// 집합」: 편집 버퍼를 되살리는 대신 평가만 늦춘다).
//
// ⚠ 첫 값은 **안 늦춘다** — 패널을 열자마자 빈 화면을 보여 주면 "조건에 다 걸렸다"로 읽힌다.
import { useEffect, useRef, useState } from "react";

/**
 * 평가가 손을 따라오는 간격 — 손을 떼면 바로 따라올 만큼 짧게.
 *
 * ⚠ **이건 이제 종단(`useFilterFunnel`) 전용이다**(2026-09-21). 하루 평가는 박자가 아니라
 * **세대**로 늦는다(`useCommitted` — 「계산」을 눌러야 돈다). 손을 멈춘 뒤 한 번도 여전히
 * 자동이라, 시작을 사람이 정하려면 디바운스로는 안 된다.
 * 한 기계 안에서는 여전히 **평가 맥락 전부가 이 한 값**으로 늦어야 한다 — 박자가 갈리면
 * 식과 저장물이 어긋난 채 평가된다.
 */
export const EVAL_DEBOUNCE_MS = 250;

export function useDebounced<T>(value: T, ms: number): T {
    const [slow, setSlow] = useState(value);
    const first = useRef(true);
    useEffect(() => {
        if (first.current) { first.current = false; setSlow(value); return; }
        const t = setTimeout(() => setSlow(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return slow;
}
