// 값 하나를 **손을 멈춘 뒤에** 따라오게 하는 훅.
//
// 편집이 곧 저장이 된 뒤로(2026-09-20) 조건을 한 글자 만질 때마다 저장물이 바뀌고, 그걸 구독하는
// 패널이 즉시 재평가된다 — 하루 우주에서 존 순위 조건이 켜져 있으면 그 대가가 **5.7초**다.
// 그래서 **저장은 즉시, 평가는 손을 멈춘 뒤**로 나눈다(decisions 「집합 편성 — 묶음은 곧 이름 붙은
// 집합」: 편집 버퍼를 되살리는 대신 평가만 늦춘다).
//
// ⚠ 첫 값은 **안 늦춘다** — 패널을 열자마자 빈 화면을 보여 주면 "조건에 다 걸렸다"로 읽힌다.
import { useEffect, useRef, useState } from "react";

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
