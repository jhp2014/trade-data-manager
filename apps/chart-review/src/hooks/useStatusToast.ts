"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UseStatusToastResult = {
  /** 현재 토스트 메시지(없으면 null). */
  status: string | null;
  /** 메시지를 띄우고 timeoutMs 후 자동으로 지운다(연속 호출 시 타이머 갱신). */
  showStatus: (message: string) => void;
};

/**
 * 짧게 떴다 사라지는 상태 토스트. set + N초 후 초기화 패턴을 한 곳에 모은다.
 * 연속 호출 시 직전 타이머를 정리해 마지막 메시지 기준으로 다시 카운트한다.
 */
export function useStatusToast(timeoutMs = 2000): UseStatusToastResult {
  const [status, setStatus] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = useCallback(
    (message: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setStatus(message);
      timerRef.current = setTimeout(() => {
        setStatus(null);
        timerRef.current = null;
      }, timeoutMs);
    },
    [timeoutMs],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { status, showStatus };
}
