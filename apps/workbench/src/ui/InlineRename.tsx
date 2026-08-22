import { useRef } from "react";

/**
 * 인라인 이름 편집 입력 — Enter = 확정, Esc = 취소, 포커스 이탈 = 확정.
 *
 * 함정 하나를 한 곳에서 막는다: Esc 로 입력을 언마운트하면 브라우저가 **blur 를 먼저 쏜다**(포커스된
 * 요소 제거). blur 가 확정이면 Esc 가 취소가 아니라 커밋이 된다 — 집합 이름변경에서 실제로 났다(팝오버의
 * document Esc 리스너가 판을 닫으며 input 이 사라짐). 그래서 Esc 는 직접 언마운트하지 않고 escRef 를 세운 채
 * blur 를 유도하고, blur 가 escRef 를 보고 취소/확정을 가른다. 부모는 onCommit/onCancel 에서만 상태를 바꾼다.
 *
 * Esc 는 전파를 끊는다 — 편집 취소가 곧 팝오버 닫기가 되면 "한 손짓에 두 결과"다.
 * 비제어(defaultValue) — 편집 중 draft 를 바깥이 알 이유가 없다.
 */
export function InlineRename({ initial, onCommit, onCancel, style }: {
    initial: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
    style?: React.CSSProperties;
}): JSX.Element {
    const escRef = useRef(false);
    return (
        <input
            autoFocus defaultValue={initial}
            onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); escRef.current = true; e.currentTarget.blur(); }
            }}
            onBlur={(e) => {
                if (escRef.current) { escRef.current = false; onCancel(); }
                else onCommit(e.currentTarget.value.trim());
            }}
            style={style}
        />
    );
}
