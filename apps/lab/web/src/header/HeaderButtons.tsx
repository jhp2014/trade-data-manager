// 판 버튼 둘 — ⓘ(정보 판)·슬라이더(컨트롤 판). dockview 그룹 탭 줄 오른쪽에 서고 **활성 패널의 것**을 연다
// (그룹당 한 벌이면 된다). 선언이 없는 패널에서는 버튼을 숨기지 않고 흐린다 — 자리가 움직이면 안 된다.
import { TriggerPopover } from "../ui/popover/TriggerPopover.js";
import { useHeaderDecl } from "./registry.js";
import { ControlBoard } from "./ControlBoard.js";
import { InfoBoard } from "./InfoBoard.js";

export function HeaderButtons({ panelId }: { panelId: string | undefined }): JSX.Element {
    const decl = useHeaderDecl(panelId);
    const hasInfo = decl?.info.some((i) => i.transient !== true) ?? false;
    const hasControls = (decl?.controls.length ?? 0) > 0;
    return (
        <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 6px", gap: 2 }}>
            <TriggerPopover
                width={320}
                trigger={(open, toggle) => (
                    <button className="icon-btn" disabled={!hasInfo} onClick={toggle} title="정보 — 이 패널의 값 전부 보기 · 어디에 보일지 고르기" style={{ padding: "0 4px", color: open ? "var(--text-primary)" : undefined }}>
                        <InfoIcon />
                    </button>
                )}
            >
                {() => (panelId !== undefined ? <InfoBoard panelId={panelId} /> : null)}
            </TriggerPopover>
            <TriggerPopover
                width={320}
                trigger={(open, toggle) => (
                    <button className="icon-btn" disabled={!hasControls} onClick={toggle} title="컨트롤 — 이 패널의 컨트롤 전부 · 헤더 줄에 꺼내 두기" style={{ padding: "0 4px", color: open ? "var(--text-primary)" : undefined }}>
                        <SlidersIcon />
                    </button>
                )}
            >
                {() => (panelId !== undefined ? <ControlBoard panelId={panelId} /> : null)}
            </TriggerPopover>
        </div>
    );
}

function InfoIcon(): JSX.Element {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </svg>
    );
}

function SlidersIcon(): JSX.Element {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6h8M16 6h4" />
            <circle cx="14" cy="6" r="2" />
            <path d="M4 12h2M10 12h10" />
            <circle cx="8" cy="12" r="2" />
            <path d="M4 18h10M18 18h2" />
            <circle cx="16" cy="18" r="2" />
        </svg>
    );
}
