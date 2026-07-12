import { useState } from "react";

// 종목명 — 클릭하면 종목코드를 클립보드에 복사(HTS 붙여넣기 연동). 잠깐 "복사됨" 피드백.
// 차트 헤더·작업표시줄 공용. 코드 없으면 비활성.
export function StockNameCopy({ code, name, style }: { code: string; name?: string | null; style?: React.CSSProperties }): JSX.Element {
    const [copied, setCopied] = useState(false);
    const label = name ?? code ?? "—";
    return (
        <button
            onClick={() => {
                if (!code) return;
                void navigator.clipboard?.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1000);
            }}
            title={code ? `클릭: 종목코드 복사 (${code})` : undefined}
            style={{ border: "none", background: "none", cursor: code ? "pointer" : "default", color: "inherit", font: "inherit", padding: 0, ...style }}
        >
            {copied ? "복사됨 ✓" : label}
        </button>
    );
}
