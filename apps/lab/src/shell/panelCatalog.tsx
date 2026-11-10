import type { FunctionComponent, ReactNode } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { BoardPanel } from "../panels/BoardPanel.js";
import { ChartPanel } from "../panels/ChartPanel.js";
import { HtsNewsPanel } from "../panels/HtsNewsPanel.js";
import { TelegramPanel } from "../panels/TelegramPanel.js";
import { PanelFrame } from "../header/PanelFrame.js";
import { parseSlot } from "./slots.js";
import { selectPanelPath } from "../store/paths.js";

// 패널 타입 목록 — dockview 컴포넌트 키 = base, 인스턴스 id = `${base}-${n}`.
// ⚠ base 는 저장된 배치·화면(localStorage)에 박힌다 — 바꾸거나 지우면 불러올 때 그 패널만 걷힌다(sanitize ·
//   부팅 때 대장 정리). 이름을 바꾸면 그 패널은 사라진 것으로 친다.
export interface PanelType {
    base: string;
    title: string;
    render: (panelId: string) => JSX.Element;
}

export const PANEL_TYPES: PanelType[] = [
    { base: "chart", title: "차트", render: (id) => <ChartPanel panelId={id} /> },
    // 은퇴한 base 둘 — 저장 배치에 남은 패널은 sanitize(부팅 때 대장 정리)가 조용히 걷는다:
    //   "theme"(옛 시트 테마, 2026-10-16 — /day-flow 전환으로 시트 소속 소멸)
    //   "htheme"(이력 기반 테마, 2026-10-17 — judgment 읽기 은퇴)
    // "board" 가 그 후계 — 소속 공급원은 tdm-ai 장중 복기 분류 장부(/replay/day, 그날 하루).
    { base: "board", title: "테마 보드", render: (id) => <BoardPanel panelId={id} /> },
    { base: "hts", title: "HTS뉴스", render: (id) => <HtsNewsPanel panelId={id} /> },
    { base: "telegram", title: "텔레그램", render: (id) => <TelegramPanel panelId={id} /> },
];

const BY_BASE = new Map(PANEL_TYPES.map((t) => [t.base, t]));

export function panelType(base: string): PanelType | undefined {
    return BY_BASE.get(base);
}

/** 패널 이름 — 늘 번호를 붙인다("차트 (1)"). 1번만 번호가 없으면 2번과 나란히 놓였을 때 비대칭이다. */
export function slotTitle(panelId: string): string {
    const slot = parseSlot(panelId);
    const t = slot && BY_BASE.get(slot.base);
    return slot && t ? `${t.title} (${slot.n})` : panelId;
}

/**
 * 모든 패널은 PanelFrame(헤더 줄·바닥 줄·오버레이 칩)에 감싸인다 — 패널은 헤더 선언만 등록하고(usePanelHeader),
 * 머리 줄은 틀이 그린다. 선언이 없는 패널은 본문뿐인 틀이다. 그 바깥 PanelHost 가 누름을 받아 그 패널의 경로를 활성으로.
 */
export function panelComponents(): Record<string, FunctionComponent<IDockviewPanelProps>> {
    const out: Record<string, FunctionComponent<IDockviewPanelProps>> = {};
    for (const t of PANEL_TYPES)
        out[t.base] = (props) => (
            <PanelHost panelId={props.api.id}>
                <PanelFrame panelId={props.api.id}>{t.render(props.api.id)}</PanelFrame>
            </PanelHost>
        );
    return out;
}

/** 패널 본문을 누르면(어느 버튼이든, 캡처 단계 — 본문 요소가 전파를 끊어도) 그 패널이 보는 경로가 활성. */
export function PanelHost({ panelId, children }: { panelId: string; children: ReactNode }): JSX.Element {
    return (
        <div style={{ height: "100%" }} onPointerDownCapture={() => selectPanelPath(panelId)}>
            {children}
        </div>
    );
}
