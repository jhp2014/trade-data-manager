// 화면 불러오기 손짓 — 작업표시줄 버튼·화면 메뉴·Ctrl+번호가 같이 쓴다.
import type { DockviewApi } from "dockview-react";
import { useScreens, type Screen } from "../store/screens.js";
import { loadScreen } from "./layout.js";

/** 불러오고 활성으로 표시한다. 실패하면 알린다(배치는 불러오기 전으로 되돌아가 있다). */
export function openScreen(api: DockviewApi, screen: Screen): void {
    if (loadScreen(api, screen)) useScreens.getState().setActive(screen.id);
    else window.alert(`화면 「${screen.name}」을 불러오지 못했습니다. 불러오기 전 배치로 되돌렸습니다.`);
}

/** 이름 없이 저장할 때의 이름 — 쓰지 않은 가장 작은 「화면 n」. */
export function defaultScreenName(screens: readonly { name: string }[]): string {
    const used = new Set(screens.map((s) => s.name));
    for (let n = 1; ; n++) if (!used.has(`화면 ${n}`)) return `화면 ${n}`;
}
