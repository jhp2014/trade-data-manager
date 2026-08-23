// 정규화 겹치기의 **떠 있는 창** — 뭉친 라벨의 멤버 목록(뱃지 팝오버).
// (옛 그룹 메뉴는 골격 은퇴와 함께 제거 — 라벨 우클릭의 뜻이 "고정 토글"로 바뀌었다.)
import { useMemo } from "react";
import type { OverlayLine } from "./overlay.js";
import { AnchoredPopover, MenuItem, MenuLabel } from "../../ui/Dialog.js";
import { shortDate } from "../../lib/date.js";

export interface OverlayMenusProps {
    badge: { x: number; y: number; members: string[] } | null;
    onCloseBadge: () => void;
    byKey: ReadonlyMap<string, OverlayLine>;
    /** 목록 행 점의 색 — 그림의 그 선과 같은 색(목록↔그림을 잇는 유일한 것). */
    groupColorOf: (key: string) => string;
    nameOf: (code: string) => string;
    onLabelClick: (s: OverlayLine, ev: { ctrlKey: boolean; metaKey: boolean }) => void;
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
                <AnchoredPopover anchor={badge} onClose={p.onCloseBadge} minWidth={190} padding={0} placement="beside" offset={6}>
                    <MenuLabel>{badge.members.length}개</MenuLabel>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                        {badgeRows.map((s) => (
                            <div key={s.key} onMouseEnter={() => p.setHovered(s.key)} onMouseLeave={() => p.setHovered(null)}>
                                {/* ⚠ 닫기 전에 호버를 **손으로** 푼다 — 목록이 사라지면 이 행은 언마운트라
                                    mouseleave 가 영영 안 온다(라벨에서 겪은 것과 같은 부류의 누수).
                                    거기선 노드를 안 부수는 게 답이지만, 여기선 닫는 게 목적이라 풀어 주는 게 답이다. */}
                                <MenuItem onClick={() => { p.onLabelClick(s, { ctrlKey: false, metaKey: false }); p.setHovered(null); p.onCloseBadge(); }}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 3, background: p.groupColorOf(s.key), flexShrink: 0 }} />
                                        <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{shortDate(s.date)}</span>
                                        <span>{p.nameOf(s.stockCode)}</span>
                                        {s.kind === "point" && <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{s.time.slice(0, 5)}</span>}
                                    </span>
                                </MenuItem>
                            </div>
                        ))}
                    </div>
                </AnchoredPopover>
            )}
        </>
    );
}
