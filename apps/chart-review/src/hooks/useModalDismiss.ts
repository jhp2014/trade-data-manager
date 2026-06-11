import { useCallback, useEffect, useRef, type MouseEvent } from "react";

type ModalDismissOptions = {
  /** 캡처 단계에서 ESC 를 처리할지(상위 모달보다 먼저 닫을 때 true). */
  capture?: boolean;
  /** ESC 이벤트 전파를 멈출지(겹친 모달에서 상위까지 닫히지 않게). */
  stopPropagation?: boolean;
  /** false 면 ESC 핸들러를 달지 않는다(하위 피커가 열려 있을 때 등). */
  enabled?: boolean;
};

/**
 * 모달 공통 닫기 동작(ESC 키 + 오버레이 바깥 클릭)을 캡슐화한다.
 * - ESC: enabled 일 때만, capture/stopPropagation 옵션으로 겹친 모달 우선순위 제어.
 * - 오버레이 클릭: 반환한 overlayRef 를 오버레이 div 에 달고 onOverlayClick 을 onClick 에 연결하면,
 *   오버레이 자기 자신을 클릭했을 때만(=바깥 클릭) 닫힌다.
 */
export function useModalDismiss(
  onClose: () => void,
  { capture = false, stopPropagation = false, enabled = true }: ModalDismissOptions = {},
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (stopPropagation) e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, capture);
    return () => window.removeEventListener("keydown", onKey, capture);
  }, [onClose, capture, stopPropagation, enabled]);

  const overlayRef = useRef<HTMLDivElement>(null);
  const onOverlayClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  return { overlayRef, onOverlayClick };
}
