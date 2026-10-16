// 경로 이름표 — 경로 색 칸에 이름(A·B…). 경로 줄과 설정 창 「경로」 칸이 같이 쓴다.
import type { Path } from "../store/paths.js";

export function PathBadge({ path }: { path: Pick<Path, "id" | "color"> }): JSX.Element {
    return (
        <span style={{ display: "inline-block", minWidth: 18, textAlign: "center", padding: "0 3px", borderRadius: 3, background: path.color, color: "#fff", fontWeight: 700, fontSize: 11, lineHeight: "16px" }}>
            {path.id}
        </span>
    );
}
