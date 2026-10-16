// 패널 테스트용 틀 — 셸이 하는 것처럼 패널을 PanelFrame 에 감싸고, 탭 줄 오른쪽의 판 버튼도 같이 세운다.
// 패널의 정보·컨트롤은 이제 패널이 아니라 이 틀이 그린다(패널은 선언만 한다).
import type { ReactNode } from "react";
import { fireEvent, within } from "@testing-library/react";
import { HeaderButtons } from "../header/HeaderButtons.js";
import { PanelFrame } from "../header/PanelFrame.js";
import { useHeaderLedger } from "../header/ledger.js";

export function Framed({ panelId, children }: { panelId: string; children: ReactNode }): JSX.Element {
    return (
        <div data-testid={`frame-${panelId}`}>
            <HeaderButtons panelId={panelId} />
            <PanelFrame panelId={panelId}>{children}</PanelFrame>
        </div>
    );
}

const frameOf = (panelId: string): HTMLElement => document.querySelector<HTMLElement>(`[data-testid="frame-${panelId}"]`)!;

/** 그 패널의 컨트롤 판을 연다(판은 body 에 뜬다). */
export function openControls(panelId: string): void {
    fireEvent.click(within(frameOf(panelId)).getByTitle(/^컨트롤/));
}

/** 그 패널의 헤더 줄 — 없으면 null. */
export function headerLine(panelId: string): HTMLElement | null {
    return frameOf(panelId).querySelector<HTMLElement>('[data-header-line="line"]');
}

/** 판에서 그 컨트롤의 핀을 눌러 헤더 줄로 꺼낸다(판이 열려 있어야 한다). */
export function pinToLine(controlId: string): void {
    fireEvent.click(document.querySelector<HTMLElement>(`[data-board-row="${controlId}"] [aria-label="헤더 줄로 꺼내기"]`)!);
}

export function resetHeaderLedger(): void {
    useHeaderLedger.setState({ layout: {} });
}
