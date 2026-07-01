import { useWorkbench } from "./store/workbench.js";
import { WorkbenchShell } from "./shell/WorkbenchShell.js";

// Focus 툴바(date/code) — 이 슬라이스의 연동 증명용. 값 바꾸면 store 갱신 → ChartPanel 이 따라온다.
// 무효화규칙은 store 액션이 소유하므로 여기선 액션만 부른다.
function FocusToolbar(): JSX.Element {
    const date = useWorkbench((s) => s.focus.date);
    const code = useWorkbench((s) => s.focus.code);
    const timeLock = useWorkbench((s) => s.focus.timeLock);
    const setDate = useWorkbench((s) => s.setDate);
    const setCode = useWorkbench((s) => s.setCode);
    const setTimeLock = useWorkbench((s) => s.setTimeLock);

    return (
        <div
            style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "8px 12px",
                borderBottom: "1px solid #e2e2e2",
                font: "13px system-ui, sans-serif",
            }}
        >
            <label>
                종목{" "}
                <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim())}
                    placeholder="005930"
                    style={{ width: 90 }}
                />
            </label>
            <label>
                날짜{" "}
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label style={{ marginLeft: "auto" }}>
                <input
                    type="checkbox"
                    checked={timeLock}
                    onChange={(e) => setTimeLock(e.target.checked)}
                />{" "}
                timeLock
            </label>
        </div>
    );
}

export function App(): JSX.Element {
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
            <FocusToolbar />
            <WorkbenchShell />
        </div>
    );
}
