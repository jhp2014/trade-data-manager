// 작업셋 계열 표현 조각 — 남은 건 Name 하나다(최근 탐색 패널이 같은 표기를 쓴다).
// 옛 MonthPicker·DateHeader·PointRow·PresenceFilterRow 는 E안 재편(2026-08-20)으로 흡수·은퇴:
//   · 월 선택 → 칩(useMonthPick 재사용, WorksetPanel ②줄)   · 날짜 머리·행 → WorksetList(가상화)
//   · 존재 필터 → WorksetFilterRow(DNF)                       · 조준 → 헤더 컨트롤 레지스트리
export function Name({ name, code, color, strong }: { name: string | null; code: string; color?: string; strong?: boolean }): JSX.Element {
    return (
        <span style={{ minWidth: 0, color: color ?? "var(--text-primary)", fontWeight: strong ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name ?? code}
        </span>
    );
}
