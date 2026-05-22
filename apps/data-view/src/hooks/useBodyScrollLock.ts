"use client";

import { useEffect } from "react";

/**
 * body scroll 잠금을 "스택" 방식으로 관리한다.
 *
 * 문제:
 *   ChartModal 과 PeerListModal 두 모달이 동시에 떠 있을 수 있는데,
 *   각자 `document.body.style.overflow = "hidden"` / 복원을 수행하면
 *   먼저 닫히는 쪽이 원래값을 복원해버려, 아직 열린 모달이 있어도
 *   body scroll 이 풀리는 버그가 생긴다.
 *
 * 해결:
 *   모듈 스코프에서 lock 카운트를 관리한다.
 *     - 첫 lock 시 원래 overflow 값을 저장하고 "hidden" 적용
 *     - 마지막 lock 해제 시에만 원래 값으로 복원
 */

let lockCount = 0;
let originalOverflow: string | null = null;

function acquire() {
    if (typeof document === "undefined") return;
    if (lockCount === 0) {
        originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
    }
    lockCount++;
}

function release() {
    if (typeof document === "undefined") return;
    if (lockCount <= 0) return;
    lockCount--;
    if (lockCount === 0) {
        document.body.style.overflow = originalOverflow ?? "";
        originalOverflow = null;
    }
}

export function useBodyScrollLock(enabled: boolean): void {
    useEffect(() => {
        if (!enabled) return;
        acquire();
        return () => release();
    }, [enabled]);
}
