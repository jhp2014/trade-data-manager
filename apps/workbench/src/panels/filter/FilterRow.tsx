// 조건 한 줄 — 이 줄에서 **값을 고치지는 않는다**: 이름을 누르면 그 조건의 편집면으로 데려간다
// (레일은 필터 레일 패널, 테마는 테마 순위 패널, 그룹은 그 자리 팝오버). 편집 판이 목록과 편집면
// 두 곳이면 같은 조건을 두 문법으로 만지게 된다 — 그게 옛 필터 UI 가 두 곳이라 생긴 문제와 같은 종류다.
//
// ⚠ **줄은 요약 한 줄이 전부다**(2026-09-19 깔때기 진단 은퇴). 5칸 막대·"새로 죽임"·"장식" 표·칸 짚기와
// 끌어서 순서 바꾸기가 통째로 빠졌다 — "이 필터가 무엇을 죽였나"는 값이 없고, 대체재가 이미 손짓으로
// 있다(끄기 ◉/○ → 집합 건수 변화). 순서도 같이 죽었다: 하루 엔진이 술어를 비용 오름차순으로 스스로
// 정렬하므로(cellset/engine.ts) 사람이 정한 순서는 서술 전용이었다. 규칙 전문은 decisions.md
// 「집합 편성 재설계」.
import { FAIL } from "../../styles/palette.js";
import { kindLabel } from "./label.js";
import { stageKind, type FilterStage } from "./stage.js";
import { iconBtn } from "./ui.js";

export function FilterRow({
    no, stage, label, dead, deficiency, cellFields, neg, linked, linkedLabel, onLinkedClick,
    onOpen, onToggle, onNegate, onRemove,
}: {
    no: number;
    stage: FilterStage;
    label: string;
    dead: boolean;
    /** 이 잎이 부정돼 있나 — 부정은 식의 것이지 조건의 것이 아니라 밖에서 받는다. */
    neg?: boolean;
    onNegate?: () => void;
    /**
     * 이 우주에서 **결손**인 이유들(빈 배열 = 온전히 평가된다). 죽은 참조(dead)와 **다른 표식**이어야
     * 한다 — 죽음은 고쳐야 할 것이고, 결손은 사실이다(재료가 생기면 문법 변경 없이 켜진다).
     */
    deficiency?: string[];
    /** 셀 술어의 그 자리 편집 줄(하루 우주) — 전용 편집 판이 없는 종류라 줄 안에서 만진다. */
    cellFields?: React.ReactNode;
    /** 전용 패널이 지금 이 행을 비추는 중(테마) — 어디를 만지면 이 줄이 바뀌는지 알린다. */
    linked?: boolean;
    /** 테마 행 전용 — 연동된 조건판 라벨(미연동이면 "미연동"). 클릭 = 연동 메뉴(pull 의 유일한 손잡이). */
    linkedLabel?: string;
    onLinkedClick?: (e: React.MouseEvent) => void;
    /** 이름 클릭 — 그 종류의 편집면으로(좌표는 그 자리에 여는 팝오버가 쓴다). */
    onOpen: (e: React.MouseEvent) => void;
    /** 없으면 그 손잡이를 안 그린다 — 집합 편성의 아랫줄은 **값만** 맡으므로 안 넘긴다. */
    onToggle?: () => void;
    onRemove?: () => void;
}): JSX.Element {
    return (
        <div
            style={{
                padding: "2px 6px 3px",
                borderBottom: "1px solid var(--border-subtle)",
                // 흐리게는 **꺼짐**의 표기다(그것 하나뿐 — 옛 "장식" 흐리기는 함께 사라졌다).
                opacity: stage.enabled ? 1 : 0.4,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ flexShrink: 0, fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{no}</span>
                <span style={{ flexShrink: 0, fontSize: 9.5, color: "var(--text-tertiary)", border: "1px solid var(--border-default)", borderRadius: 3, padding: "0 4px" }}>
                    {kindLabel(stageKind(stage))}
                </span>
                {neg === true && (
                    <span title="이 조건의 부정 — 결손은 되살아나지 않습니다(모름의 부정은 모름)"
                        style={{ flexShrink: 0, fontSize: 11, color: FAIL }}>¬</span>
                )}
                <button onClick={onOpen} title={`${label} — 클릭 = 이 조건의 편집면으로`}
                    style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "none", background: "transparent", padding: 0, font: "inherit", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: dead ? FAIL : "var(--text-primary)", textAlign: "left" }}>
                    {label}
                </button>
                {deficiency !== undefined && deficiency.length > 0 && (
                    <span title={`이 우주에서 평가할 수 없는 조건입니다 — ${deficiency.join(" / ")}`}
                        style={{ flexShrink: 0, fontSize: 9.5, color: "var(--text-tertiary)", border: "1px dashed var(--border-strong)", borderRadius: 3, padding: "0 4px" }}>
                        결손
                    </span>
                )}
                <span style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                    {linkedLabel !== undefined ? (
                        <button onClick={onLinkedClick}
                            title={linkedLabel === "미연동" ? "연동할 조건판 고르기 — 연동해야 컷선·카운트가 선다" : "연동된 조건판 — 클릭하면 연동 변경/해제 메뉴"}
                            style={{ fontSize: 9.5, color: linkedLabel === "미연동" ? "var(--text-tertiary)" : "var(--accent-primary)", border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                            {linkedLabel === "미연동" ? "○ 미연동" : `◆ ${linkedLabel}`}
                        </button>
                    ) : linked === true && (
                        <span title="전용 패널이 이 행을 비추는 중 — 거기서 만지면 이 줄이 바뀝니다"
                            style={{ fontSize: 9.5, color: "var(--accent-primary)" }}>◆ 연동</span>
                    )}
                    {/* ⚠ 끄기·부정·지우기는 **여기 없다**(2026-09-22) — 칩 우클릭 전용이다. 아랫줄은
                        **값**만 맡는다: 같은 일이 두 자리에 있으면 옛 "필터 UI 가 두 곳" 함정이다.
                        (손잡이를 옵셔널로 받아 두는 이유는 다른 소비자가 아직 있을 수 있어서다.) */}
                    {onToggle !== undefined && (
                        <button onClick={onToggle} title={stage.enabled ? "이 조건 끄기(빼고 보기)" : "다시 켜기"} style={iconBtn}>{stage.enabled ? "◉" : "○"}</button>
                    )}
                    {onNegate !== undefined && (
                        <button onClick={onNegate} title={neg === true ? "부정 해제" : "이 조건 부정(¬)"}
                            style={{ ...iconBtn, color: neg === true ? FAIL : undefined }}>¬</button>
                    )}
                    {onRemove !== undefined && (
                        <button onClick={onRemove} title="이 조건 지우기" style={{ ...iconBtn, color: FAIL }}>✕</button>
                    )}
                </span>
            </div>

            {cellFields}
        </div>
    );
}
