import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 팝오버 내용의 이름표 — 바깥 클릭 판정이 "다른 팝오버 안"을 바깥으로 세지 않으려고 쓴다(중첩). */
const LAYER_ATTR = "data-header-popover";

// 패널 헤더에서 **아래로** 열리는 앵커 팝오버 — Popover(작업표시줄 전용, 위로 열림)와 방향·닫힘 규칙이 다르다.
// 기본은 **바깥 클릭으로 닫히지 않는다**: 필터 조율처럼 팝오버를 열어둔 채 뒤의 보드를 클릭해 결과
// (흐리게/숨김)를 확인하는 워크플로가 본론이라, 거기서는 바깥 클릭 닫힘이 그 자체로 사고다.
// 닫기 = Esc · 트리거 재클릭 · children 의 close. **메뉴처럼 읽고 고르고 끝나는 판은 `closeOnOutside`** 로
// 옵트인한다(컨트롤 더보기 판이 그렇다) — 열어 둔 채 뒤를 만질 이유가 없는 판이라 규칙이 반대다.
// 내용은 document.body 로 portal — 헤더가 overflow 스크롤이라 그냥 두면 잘린다(Popover 와 같은 이유).
export function HeaderPopover({
    width,
    align = "end",
    closeOnOutside = false,
    trigger,
    children,
}: {
    /** 팝오버 고정 폭(px) — 뷰포트 가장자리 클램프 계산에 쓴다. */
    width: number;
    /** 앵커의 어느 모서리에 맞출지. 기본 "end"(우측) — 헤더 우측 컨트롤이 대다수라서. 좌측 컨트롤은 "start". */
    align?: "start" | "end";
    /** 바깥을 누르면 닫는다(기본 false — 위 주석의 이유). */
    closeOnOutside?: boolean;
    trigger: (open: boolean, toggle: () => void) => ReactNode;
    children: (close: () => void) => ReactNode;
}): JSX.Element {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    // 트리거 위치 추적 — 아래로 열림(anchor bottom 아래 6px), 우측 모서리 정렬 + 뷰포트 클램프.
    // 헤더는 가로 스크롤 영역이라 scroll(capture) 도 들어야 앵커를 따라간다.
    useLayoutEffect(() => {
        if (!open) return;
        const place = (): void => {
            const el = anchorRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const left = Math.max(8, Math.min(align === "start" ? r.left : r.right - width, window.innerWidth - width - 8));
            setPos({ top: r.bottom + 6, left });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open, width, align]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);

    /**
     * 바깥 클릭 닫기(옵트인) — **캡처 단계**로 듣는다. 그래프 위에서는 d3 가 mousedown 을 삼켜
     * 버블링으로는 안 오기 때문이다(옛 팝오버들이 그림 위에서만 안 닫히던 이유가 그거였다).
     *
     * "바깥"에서 두 가지를 뺀다: 앵커 자신(트리거 재클릭은 트리거의 토글이 처리한다 — 여기서 먼저
     * 닫으면 곧바로 다시 열려 한 번 눌러 아무 일도 안 일어난 것처럼 보인다)과, **다른 팝오버의 내용**
     * (더보기 판 안에서 택1 판을 여는 중첩이 실제로 있다 — 자식 판을 눌렀다고 부모가 닫히면 값을 못 고른다).
     */
    useEffect(() => {
        if (!open || !closeOnOutside) return;
        const onDown = (e: MouseEvent): void => {
            const t = e.target;
            const el = t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
            if (anchorRef.current && el && anchorRef.current.contains(el)) return;
            if (el?.closest(`[${LAYER_ATTR}]`)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDown, true);
        return () => document.removeEventListener("mousedown", onDown, true);
    }, [open, closeOnOutside]);

    return (
        <div ref={anchorRef} style={{ display: "inline-flex", flexShrink: 0 }}>
            {trigger(open, () => setOpen((v) => !v))}
            {open &&
                pos &&
                createPortal(
                    <div
                        {...{ [LAYER_ATTR]: "" }}
                        style={{
                            position: "fixed",
                            top: pos.top,
                            left: pos.left,
                            width,
                            maxHeight: Math.max(200, window.innerHeight - pos.top - 12),
                            display: "flex",
                            flexDirection: "column",
                            zIndex: 300,
                            background: "var(--bg-primary)",
                            border: "1px solid var(--border-default)",
                            borderRadius: 8,
                            boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
                            overflow: "hidden",
                        }}
                    >
                        {children(() => setOpen(false))}
                    </div>,
                    document.body,
                )}
        </div>
    );
}
