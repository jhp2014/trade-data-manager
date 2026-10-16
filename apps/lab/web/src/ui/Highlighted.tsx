// 검색어 강조 글 — 맞은 조각만 <mark> 로 칠한다. HTS뉴스 제목·텔레그램 본문이 같이 쓴다.
import { Fragment } from "react";
import { splitHits } from "../lib/text.js";

export function Highlighted({ text, re }: { text: string; re: RegExp | null }): JSX.Element {
    return (
        <>
            {splitHits(text, re).map((p, i) =>
                p.hit ? (
                    <mark key={i} style={{ background: "var(--accent-soft)", color: "var(--accent-hover)", fontWeight: 600, padding: 0 }}>
                        {p.text}
                    </mark>
                ) : (
                    <Fragment key={i}>{p.text}</Fragment>
                ),
            )}
        </>
    );
}
