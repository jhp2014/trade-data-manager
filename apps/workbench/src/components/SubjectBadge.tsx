// 머리글 배지 — subject(지금 선택)가 이 패널에 **안 그려져 있을 때만** 그 이유를 말한다.
//
// 규칙(사용자 확정): 못 그리는 subject 를 위해 본문에 자리를 만들지 않는다 — 시트가 활성 타점을
// 상단에 억지로 고정하던 방식의 반대다. 대신 머리글 한 줄이 "필터 밖"과 "재료 없음"을 갈라 말한다.
// shown 이면 아무것도 안 그린다(잘 보이고 있는 걸 다시 말하면 배지가 상시 장식이 된다).
//
// absent 의 문구는 패널이 정한다 — 재료가 무엇인지(타점·골격·전일종가)는 패널마다 다르다.
import { shortDate } from "../lib/date.js";
import type { Subject, SubjectStatus } from "../lib/subject.js";
import { FILTER } from "../styles/palette.js";

export function SubjectBadge({ subject, status, name, absentLabel }: {
    subject: Subject | null;
    status: SubjectStatus;
    /** 종목명(없으면 코드 그대로). */
    name?: string;
    /** absent 일 때의 문구 — "타점 없음" · "골격 없음" 등 패널의 재료 이름으로. */
    absentLabel: string;
}): JSX.Element | null {
    if (!subject || status === "shown") return null;
    const filtered = status === "filtered";
    const reason = filtered ? "필터 밖" : absentLabel;
    const color = filtered ? FILTER : "var(--text-tertiary)";
    return (
        <span
            title={filtered
                ? "지금 선택이 이 패널의 필터 조건에서 빠져 있습니다(재료는 있음) — 필터를 풀면 보입니다"
                : `지금 선택을 이 패널이 그릴 재료가 없습니다(${absentLabel}) — 필터 탓이 아닙니다`}
            style={{
                display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
                fontSize: 10.5, padding: "1px 7px", borderRadius: 4,
                border: `1px solid ${filtered ? FILTER : "var(--border-default)"}`, color, whiteSpace: "nowrap",
            }}>
            <span style={{ color: "var(--text-tertiary)" }}>선택</span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}>{name ?? subject.code}</span>
            <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                {shortDate(subject.date)}{subject.time !== null ? ` ${subject.time.slice(0, 5)}` : ""}
            </span>
            <span style={{ fontWeight: 700 }}>{reason}</span>
        </span>
    );
}
