// 모음 버튼 둘 — ⓘ(정보 판)·조절 슬라이더(컨트롤 판). dockview 그룹 헤더 우측(옛 플로팅 토글 자리)에
// 서고, **활성 패널의 것**을 연다(컨트롤은 어차피 활성 패널 대상이라 그룹당 한 벌이면 된다).
// 등록이 없는 패널에서는 버튼을 숨기지 않고 흐린다 — 자리가 움직이면 안 된다.
//
// 단축키의 판형 호출(pendingPopover)도 여기가 호스트다 — anchor 규칙 "입구가 없으면 모음 버튼":
// 단축키로 여는 판은 항상 슬라이더 버튼 밑, 같은 자리에 뜬다(근육기억).
import { useEffect, useRef } from "react";
import { FloatingSurface } from "../../ui/popover/FloatingSurface.js";
import { TriggerPopover } from "../../ui/popover/TriggerPopover.js";
import { useHeaderDecl, useHeaderRegistry } from "./registry.js";
import { popoverContentOf, popoverWidthOf } from "./widgets.js";
import { ControlBoard } from "./ControlBoard.js";
import { InfoBoard } from "./InfoBoard.js";
import type { ControlSpec } from "./spec.js";

export function HeaderButtons({ panelId }: { panelId: string | undefined }): JSX.Element {
    const decl = useHeaderDecl(panelId);
    const hasInfo = (decl?.info.some((i) => i.available !== false && i.transient !== true)) ?? false;
    const hasControls = (decl?.controls.some((c) => c.available !== false)) ?? false;
    // 단축키 판형의 anchor — 슬라이더 버튼을 감싼 자리(TriggerPopover 는 제 anchor 를 밖에 안 내준다).
    const ctlAnchorRef = useRef<HTMLDivElement>(null);
    return (
        <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 6px", gap: 2 }}>
            <TriggerPopover width={320} trigger={(open, toggle) => (
                <button className="icon-btn" disabled={!hasInfo} onClick={toggle}
                    title="정보 — 이 판의 값 전부 보기 · 어디에 보일지 고르기"
                    style={{ padding: "0 4px", color: open ? "var(--text-primary)" : undefined }}>
                    <InfoIcon />
                </button>
            )}>
                {() => (panelId !== undefined ? <InfoBoard panelId={panelId} /> : null)}
            </TriggerPopover>
            <div ref={ctlAnchorRef} style={{ display: "inline-flex" }}>
                <TriggerPopover width={320} trigger={(open, toggle) => (
                    <button className="icon-btn" disabled={!hasControls} onClick={toggle}
                        title="컨트롤 — 이 판의 컨트롤 전부 · 단축키 배정 · 첫 줄에 올리기"
                        style={{ padding: "0 4px", color: open ? "var(--text-primary)" : undefined }}>
                        <SlidersIcon />
                    </button>
                )}>
                    {() => (panelId !== undefined ? <ControlBoard panelId={panelId} /> : null)}
                </TriggerPopover>
            </div>
            {panelId !== undefined && <ShortcutPopover panelId={panelId} anchorRef={ctlAnchorRef} />}
        </div>
    );
}

/** 단축키가 연 판 — 활성 패널의 요청(pendingPopover)만 받는다. 활성이 바뀌면 렌더가 끊겨 닫힌다. */
function ShortcutPopover({ panelId, anchorRef }: {
    panelId: string;
    anchorRef: React.RefObject<HTMLDivElement>;
}): JSX.Element | null {
    const pending = useHeaderRegistry((s) => (s.pendingPopover?.panelId === panelId ? s.pendingPopover : null));
    const decl = useHeaderDecl(panelId);
    const spec = pending === null ? undefined : decl?.controls.find((c) => c.id === pending.controlId && c.available !== false);
    // 요청한 컨트롤이 선언에 없으면(available:false 포함) 요청을 그 자리에서 버린다 — 판이 안 선 채
    // 남겨 두면 선언이 돌아오는 순간 유령처럼 열린다(ShortcutSurface 의 청소는 판이 섰을 때만 돈다).
    useEffect(() => {
        if (pending === null || spec !== undefined) return;
        const s = useHeaderRegistry.getState();
        if (s.pendingPopover?.seq === pending.seq) s.clearPopover();
    }, [pending, spec]);
    if (pending === null || spec === undefined) return null;
    // seq 를 key 로 — 같은 컨트롤 재호출도 새 판(닫힘 무장·배치 재실측이 처음부터).
    return <ShortcutSurface key={pending.seq} seq={pending.seq} spec={spec} anchorRef={anchorRef} />;
}

/**
 * 지금 살아 있는 단축키 판의 seq — 진짜 언마운트와 StrictMode 이중 effect(정리 직후 재실행)를 가른다.
 * cleanup 에서 곧장 지우면 StrictMode 가 판을 여는 즉시 죽인다(개발 서버에서만 나는 유령 버그).
 */
let aliveSeq = 0;

function ShortcutSurface({ seq, spec, anchorRef }: {
    seq: number;
    spec: ControlSpec;
    anchorRef: React.RefObject<HTMLDivElement>;
}): JSX.Element {
    const close = (): void => useHeaderRegistry.getState().clearPopover();
    // 판이 사라지는 모든 길(활성 전환·그룹 소멸)에서 요청을 청소 — 안 하면 그 패널로 돌아올 때
    // 판이 유령처럼 다시 열린다. seq 가 다르면(그새 새 요청) 남의 것이니 안 지운다.
    // 청소는 microtask 뒤에 — StrictMode 의 정리→재실행이 동기(같은 커밋)라, 재실행이 aliveSeq 를
    // 되살려 두면 "죽은 척"이 걸러진다.
    useEffect(() => {
        aliveSeq = seq;
        return () => {
            if (aliveSeq === seq) aliveSeq = -seq;
            queueMicrotask(() => {
                if (aliveSeq === seq) return; // StrictMode 재실행 — 살아 있다
                const s = useHeaderRegistry.getState();
                if (s.pendingPopover?.seq === seq) s.clearPopover();
            });
        };
    }, [seq]);
    return (
        <FloatingSurface
            anchor={{ kind: "element", ref: anchorRef }}
            place={{ side: "below", align: "end", gap: 6, shiftX: 0, overlap: false }}
            onClose={close}
            insideRefs={[anchorRef]}
            layout="column"
            width={popoverWidthOf(spec)}
            padding={0}
        >
            {popoverContentOf(spec, close)}
        </FloatingSurface>
    );
}

function InfoIcon(): JSX.Element {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </svg>
    );
}

function SlidersIcon(): JSX.Element {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6h8M16 6h4" />
            <circle cx="14" cy="6" r="2" />
            <path d="M4 12h2M10 12h10" />
            <circle cx="8" cy="12" r="2" />
            <path d="M4 18h10M18 18h2" />
            <circle cx="16" cy="18" r="2" />
        </svg>
    );
}
