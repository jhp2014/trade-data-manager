"use client";

import { useEffect, useState } from "react";

/**
 * value 의 변경을 delay(ms) 만큼 지연시켜 반환.
 *
 * 입력값이 자주 바뀌는 상황에서 마지막 변경 이후 일정 시간이 지난 시점의
 * 값만 외부에 노출하고 싶을 때 사용한다.
 *
 * Stock Chart 입력 미리보기에서 사용자 타이핑 중 매 키 입력마다 파싱 결과가
 * 깜빡이지 않도록 300ms 지연을 주는 용도로 도입.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
}
