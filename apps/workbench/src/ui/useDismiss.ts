// 떠 있는 UI(팝오버·컨텍스트 메뉴)의 해제 규칙 한 벌 — 바깥 mousedown + Esc.
// 예전엔 팝오버마다 이 useEffect 를 각자 재현했고, 그 바람에 어떤 메뉴는 Esc 로 닫히고
// 어떤 메뉴는 안 닫히는 불일치가 있었다. 규칙은 여기 하나.
//
// **mousedown 은 캡처 단계로 듣는다**(겪은 버그): d3-zoom(골격 본문)은 stopImmediatePropagation,
// 차트·보드·시트의 여러 요소는 stopPropagation 으로 mousedown 을 삼킨다. 버블로 들으면 그런 영역을
// 눌렀을 때 document 까지 안 올라와 팝오버가 안 닫혔다. 캡처는 타깃의 어떤 핸들러보다 먼저 돌아
// 누가 삼키든 상관없다 — "바깥을 누르면 닫힌다"가 영역마다 갈리지 않게 하는 근본 자리.
import { useEffect, useRef, type RefObject } from "react";

/**
 * @param ref     떠 있는 요소(이 안의 클릭은 유지)
 * @param onClose 해제 콜백 — 매 렌더 새 함수여도 되게 ref 로 잡아둔다(리스너 재등록 안 함)
 * @param enabled false 면 미등록(닫힌 상태에서 리스너를 안 달기 위함)
 *
 * 리스너 등록을 한 매크로태스크 미룬다: 이 UI 를 **연 그 클릭**이 아직 전파 중일 수 있어,
 * 즉시 등록하면 자기를 연 클릭이 곧바로 자기를 닫는다.
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void, enabled = true): void {
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        if (!enabled) return;
        const onDown = (e: MouseEvent): void => {
            if (!ref.current?.contains(e.target as Node)) closeRef.current();
        };
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") closeRef.current();
        };
        const id = setTimeout(() => document.addEventListener("mousedown", onDown, true), 0);
        document.addEventListener("keydown", onKey);
        return () => {
            clearTimeout(id);
            document.removeEventListener("mousedown", onDown, true);
            document.removeEventListener("keydown", onKey);
        };
    }, [ref, enabled]);
}
