// 넘치면 줄을 바꾸지 않고 가로로 스크롤하는 한 줄 — 보드 칩 줄과 패널 헤더 줄이 같이 쓴다.
// workbench components/ControlChrome.tsx 의 ScrollRow + lib/useHorizontalWheel.ts 를 줄여 옮겼다(끝 흐림 없음).
//
// 줄바꿈을 버린 이유: 줄이 두 줄이 되는 순간 본문 높이가 변해 차트·보드가 리사이즈로 흔들린다. 높이는 고정하고
// 넘치는 폭은 스크롤로 닿게 한다. 스크롤바를 숨겼으니 세로 휠을 가로로 돌려 주는 것까지가 한 벌이다
// (둘 중 하나만 있으면 마우스로는 넘친 부분에 닿을 길이 없다).
// ⚠ 자식은 flexShrink 0(또는 nowrap)이어야 실제로 스크롤이 생긴다 — 아니면 넘치는 대신 쭈그러든다.
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export function ScrollRow({ gap = 4, onClick, style, children, ...data }: {
    gap?: number;
    /** 이 줄의 클릭을 여기서 삼킬 때(카드 위 칩 줄 — 칩 클릭이 카드 클릭이 되면 안 된다). */
    onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
    /** 자리별 차이(패딩·바탕)만 덮는다 — 넘침 규약은 못 덮는다. */
    style?: CSSProperties;
    children: ReactNode;
    /** `data-*` 는 그대로 줄에 붙는다(테스트가 줄을 집는 손잡이). */
    [attr: `data-${string}`]: string | undefined;
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onWheel = (e: WheelEvent): void => {
            if (e.deltaY === 0 || el.scrollWidth <= el.clientWidth) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);
    return (
        <div
            ref={ref}
            onClick={onClick}
            {...data}
            className="no-scrollbar"
            // 넘침 규약은 style 뒤에 — 호출부가 실수로 덮어 다시 줄바꿈이 되는 일이 없게.
            style={{ display: "flex", alignItems: "center", gap, minWidth: 0, ...style, flexWrap: "nowrap", overflowX: "auto", overflowY: "hidden" }}
        >
            {children}
        </div>
    );
}
