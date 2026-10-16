// 화면 관리 — 지금 배치를 이름 붙여 저장하고, 불러오고, Ctrl+번호를 짝짓는다. 설정 창의 「화면」 칸.
// (예전엔 작업표시줄의 「화면 ▾」 판이었다.) 되돌릴 수 없는 손짓(덮어쓰기·삭제·기본 배치)은 그 자리 확인 줄(ui/ConfirmBar)로 묻는다.
import { useState } from "react";
import type { DockviewApi } from "dockview-react";
import { SCREEN_KEYS, keyOf, useScreens, type ScreenKey } from "../store/screens.js";
import { buildDefaultLayout, captureScreen } from "./layout.js";
import { defaultScreenName, openScreen } from "./screenActions.js";
import { useConfirm } from "../ui/ConfirmBar.js";
import { smallButton as smallBtn } from "../ui/chrome.js";

const barBtn: React.CSSProperties = { padding: "1px 8px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" };

/** 화면 저장·불러오기·이름·번호·덮어쓰기·삭제 + 기본 배치로 되돌리기. onDone = 화면을 바꿨을 때(설정 창을 닫는다). */
export function ScreenManager({ api, onDone }: { api: DockviewApi; onDone: () => void }): JSX.Element {
    const screens = useScreens((st) => st.screens);
    const keys = useScreens((st) => st.keys);
    const activeId = useScreens((st) => st.activeId);
    const { add, overwrite, rename, remove, setKey } = useScreens.getState();
    const [name, setName] = useState("");
    const [editing, setEditing] = useState<string | null>(null);
    /** 확인 줄 자리 — 그 줄(화면 id) 또는 "reset". */
    const { ask, bar: confirmBar } = useConfirm();

    const saveNew = (): void => {
        add(name.trim() || defaultScreenName(screens), captureScreen(api));
        setName("");
    };

    return (
        <>
            <div style={{ display: "flex", gap: 6, padding: 4 }}>
                <input
                    value={name}
                    placeholder={`새 화면 이름 (비우면 「${defaultScreenName(screens)}」)`}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveNew()}
                    style={{ flex: 1, padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 3, fontSize: 12 }}
                />
                <button onClick={saveNew} style={barBtn}>
                    지금 화면 저장
                </button>
            </div>
            {screens.length > 0 && <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />}
            {screens.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", borderRadius: 4, background: s.id === activeId ? "var(--hover)" : undefined }}>
                    {confirmBar(s.id) ?? (
                        <>
                            {editing === s.id ? (
                                <input
                                    autoFocus
                                    defaultValue={s.name}
                                    onBlur={(e) => {
                                        if (e.target.value.trim()) rename(s.id, e.target.value.trim());
                                        setEditing(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                        // Esc 는 편집 취소만 — 창(설정)까지 닫히지 않게 먹는다.
                                        if (e.key === "Escape") {
                                            e.preventDefault();
                                            setEditing(null);
                                        }
                                    }}
                                    style={{ flex: 1, padding: "1px 4px", border: "1px solid var(--border)", borderRadius: 3, fontSize: 12 }}
                                />
                            ) : (
                                <button
                                    onClick={() => {
                                        openScreen(api, s);
                                        onDone();
                                    }}
                                    onDoubleClick={() => setEditing(s.id)}
                                    title="불러오기 (더블클릭 = 이름 바꾸기)"
                                    style={{ flex: 1, textAlign: "left", border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: s.id === activeId ? 700 : 400, padding: "1px 2px" }}
                                >
                                    {s.name}
                                </button>
                            )}
                            <select
                                value={keyOf(keys, s.id) ?? ""}
                                onChange={(e) => setKey(s.id, (e.target.value || null) as ScreenKey | null)}
                                title="Ctrl+번호로 부르기"
                                className="tabular"
                                style={{ fontSize: 11, padding: "0 2px", border: "1px solid var(--border)", borderRadius: 3, background: "var(--surface)" }}
                            >
                                <option value="">번호 없음</option>
                                {SCREEN_KEYS.map((k) => (
                                    <option key={k} value={k}>
                                        Ctrl+{k}
                                        {keys[k] && keys[k] !== s.id ? " (옮김)" : ""}
                                    </option>
                                ))}
                            </select>
                            <button
                                title="지금 화면으로 덮어쓰기"
                                onClick={() => ask(s.id, `「${s.name}」을 지금 화면으로 덮어쓸까요?`, "덮어쓰기", () => overwrite(s.id, captureScreen(api)))}
                                style={smallBtn}
                            >
                                덮어쓰기
                            </button>
                            <button title="이름 바꾸기" onClick={() => setEditing(s.id)} style={smallBtn}>
                                이름
                            </button>
                            <button title="삭제" onClick={() => ask(s.id, `화면 「${s.name}」을 지울까요?`, "지우기", () => remove(s.id))} style={smallBtn}>
                                삭제
                            </button>
                        </>
                    )}
                </div>
            ))}
            <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
            {confirmBar("reset") ?? (
                <button
                    onClick={() =>
                        ask("reset", "기본 배치로 되돌릴까요? 지금 배치에만 있던 패널은 최소화로 남습니다.", "되돌리기", () => {
                            buildDefaultLayout(api);
                            useScreens.getState().setActive(null);
                            onDone();
                        })
                    }
                    style={{ ...smallBtn, margin: 4 }}
                >
                    기본 배치로 되돌리기
                </button>
            )}
        </>
    );
}
