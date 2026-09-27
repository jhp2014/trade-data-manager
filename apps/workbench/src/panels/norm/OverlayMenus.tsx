// 정규화 겹치기의 **떠 있는 창** — 뭉친 라벨의 멤버 목록(뱃지 팝오버).
// (옛 그룹 메뉴는 골격 은퇴와 함께 제거 — 라벨 우클릭의 뜻이 "고정 토글"로 바뀌었다.)
import { useMemo } from "react";
import type { OverlayLine } from "./overlay.js";
import { AnchoredPopover } from "../../ui/Dialog.js";
import { MENU_PAD, MenuHead, MenuItem } from "../../ui/popover/menu.js";
import { shortDate } from "../../lib/date.js";

export interface OverlayMenusProps {
    badge: { x: number; y: number; members: string[] } | null;
    onCloseBadge: () => void;
    byKey: ReadonlyMap<string, OverlayLine>;
    /** 목록 행 점의 색 — 그림의 그 선과 같은 색(목록↔그림을 잇는 유일한 것). */
    groupColorOf: (key: string) => string;
    nameOf: (code: string) => string;
    /** 목록에서 이름을 고르면 **시선 이동** — 라벨의 더블클릭과 같은 일이다(목록은 고르는 자리라 한 번이면 된다). */
    onGoTo: (s: OverlayLine) => void;
    setHovered: (key: string | null) => void;
}

export function OverlayMenus(p: OverlayMenusProps): JSX.Element {
    const { badge, byKey } = p;

    // 목록 순서 = 끝점의 % 내림차순 — 그림에서 위에 있는 선이 목록에서도 위라 눈이 안 헤맨다.
    const badgeRows = useMemo(() => {
        if (!badge) return [];
        const endY = (s: OverlayLine): number => s.points[s.points.length - 1]?.y ?? 0;
        return badge.members
            .map((k) => byKey.get(k))
            .filter((s): s is OverlayLine => !!s)
            .sort((a, b) => endY(b) - endY(a));
    }, [badge, byKey]);

    return (
        <>
            {/* 뭉친 라벨의 멤버 목록 — 행 점이 그림의 그 선과 같은 색(목록↔그림을 잇는 유일한 것). */}
            {badge && (
                <AnchoredPopover anchor={badge} onClose={p.onCloseBadge} minWidth={190} padding={MENU_PAD} placement="beside" offset={6}>
                    <MenuHead>{badge.members.length}개</MenuHead>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                        {badgeRows.map((s) => (
                            <div key={s.key} onMouseEnter={() => p.setHovered(s.key)} onMouseLeave={() => p.setHovered(null)}>
                                {/* ⚠ 닫기 전에 호버를 **손으로** 푼다 — 목록이 사라지면 이 행은 언마운트라
                                    mouseleave 가 영영 안 온다(라벨에서 겪은 것과 같은 부류의 누수).
                                    거기선 노드를 안 부수는 게 답이지만, 여기선 닫는 게 목적이라 풀어 주는 게 답이다. */}
                                {/* 인라인으로 흘린다 — inline-flex 로 싸면 이름만이 아니라 줄 통째가 말줄임 칸에서 잘린다. */}
                                <MenuItem onClick={() => { p.onGoTo(s); p.setHovered(null); p.onCloseBadge(); }}
                                    trailing={s.kind === "point" ? <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{s.time.slice(0, 5)}</span> : null}>
                                    <span style={{ display: "inline-block", verticalAlign: "middle", width: 6, height: 6, borderRadius: 3, marginRight: 6, background: p.groupColorOf(s.key) }} />
                                    <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", marginRight: 6 }}>{shortDate(s.date)}</span>
                                    {p.nameOf(s.stockCode)}
                                </MenuItem>
                            </div>
                        ))}
                    </div>
                </AnchoredPopover>
            )}
        </>
    );
}
