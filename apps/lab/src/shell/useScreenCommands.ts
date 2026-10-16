// Ctrl+1~9 — 번호를 짝지은 화면마다 단축키를 레지스트리에 얹는다(짝 없는 번호는 등록하지 않아 브라우저 몫으로 남는다).
// 화면·번호가 바뀌면 다시 얹는다 — 도움말에 지금 짝지은 화면 이름이 보인다.
import { useEffect } from "react";
import type { DockviewApi } from "dockview-react";
import { keyedScreens, useScreens } from "../store/screens.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { openScreen } from "./screenActions.js";

export function useScreenCommands(api: DockviewApi | null): void {
    const screens = useScreens((st) => st.screens);
    const keys = useScreens((st) => st.keys);
    useEffect(() => {
        if (!api) return;
        const { register, unregister } = useKeymapDynamic.getState();
        const ids: string[] = [];
        for (const { key: k, screen } of keyedScreens(screens, keys)) {
            const id = `screen.open.${k}`;
            register({ id, title: `화면 — ${screen.name}`, category: "화면", keys: `ctrl+${k}`, run: () => openScreen(api, screen) });
            ids.push(id);
        }
        return () => ids.forEach(unregister);
    }, [api, screens, keys]);
}
