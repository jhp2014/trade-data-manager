import { useCallback, useEffect, useRef, useState } from "react";

export type ActionStatus = { ok: boolean; message: string };

/**
 * 모달 액션의 busy/status 상태와 try/catch/finally 흐름을 캡슐화한다.
 *
 * run(fn) 은 실행 전 busy=true·status=null 로 두고, 결과에 따라 status 를 세팅한다.
 * - fn 이 문자열을 반환하면 { ok: true, message } 로 세팅.
 * - fn 이 { ok, message } 를 반환하면 그 값으로 세팅(부분 성공 등).
 * - fn 이 아무것도 반환하지 않으면 status 를 건드리지 않는다(성공 시 닫히는 모달용).
 * - fn 이 throw 하면 { ok: false, message: err.message } 로 세팅.
 *
 * setStatus 는 사전 검증(빈 입력 등) 메시지를 직접 띄울 때 쓴다.
 * 언마운트 후 setState 를 피하도록 mounted 가드를 둔다(성공 시 onClose 패턴 대응).
 */
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ActionStatus | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const run = useCallback(
    async (fn: () => Promise<string | ActionStatus | void>) => {
      setBusy(true);
      setStatus(null);
      try {
        const result = await fn();
        if (!mountedRef.current) return;
        if (typeof result === "string") setStatus({ ok: true, message: result });
        else if (result) setStatus(result);
      } catch (err) {
        if (mountedRef.current) {
          setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [],
  );

  return { busy, status, setStatus, run };
}
