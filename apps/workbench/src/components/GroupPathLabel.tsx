// 그룹 이름 + 조상 경로 — `대형주 › 반도체 › **소부장**`.
//
// 이름만으로는 뜻이 안 서는 경우가 있다: 같은 이름이 두 부모 밑에 있으면 어느 쪽인지 알 수 없고,
// 팔레트에서 고를 때 그게 그대로 잘못 건 조건이 된다. 그래서 **폭이 있는 자리**(필터 보드·팔레트·
// 타점 정보)는 경로를 함께 그린다. 좁은 자리는 이름만 쓰고 전체 경로는 툴팁으로 준다.
//
// 강조는 하나뿐이다 — **현재 그룹만** 그룹색·굵게, 조상은 tertiary·작게. 조상까지 색을 주면 어느 게
// 지금 걸린 조건인지가 안 보인다(색이 셋이면 셋 다 조건처럼 읽힌다).
import type { CSSProperties } from "react";

const SEP = "›";

export function GroupPathLabel({ ancestors, name, color, strike = false, size = 10.5 }: {
    /** 먼 조상이 앞. 빈 배열이면 이름만 그린다. */
    ancestors: readonly string[];
    name: string;
    /** 현재 그룹의 색(그룹색). */
    color: string;
    strike?: boolean;
    size?: number;
}): JSX.Element {
    const faint: CSSProperties = {
        color: "var(--text-tertiary)", fontWeight: 400, fontSize: size - 1.5,
        // 경로가 길면 **앞에서부터** 줄어든다 — 현재 그룹은 절대 안 잘린다.
        minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    };
    return (
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2, minWidth: 0 }}>
            {ancestors.length > 0 && (
                <span style={faint}>
                    {ancestors.join(` ${SEP} `)} {SEP}
                </span>
            )}
            <span style={{ flexShrink: 0, color, fontWeight: 600, fontSize: size, textDecoration: strike ? "line-through" : "none" }}>
                {name}
            </span>
        </span>
    );
}
