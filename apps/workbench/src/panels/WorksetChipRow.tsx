// 작업셋 칩 줄 — **채널 하나가 한 줄**(집합·월·필터·프리셋). 네 줄이 같은 골격을 쓰는 이유는
// 왼쪽 이름 열이 세로로 맞아야 "네 개의 나란한 시선 채널"로 읽히기 때문이다(제각각이면 그냥 띠 넷이다).
//
// 줄마다 축이 **둘**인데 서로 다른 자리에 산다:
//   · **표시/숨김** — 머리글 더보기의 토글. "이 채널을 이 패널에 둘까"는 화면 구성이라 컨트롤의 일이다.
//   · **펼침/접힘** — 줄 왼쪽 이름(▸/▾) 클릭. "지금 후보를 다 볼까"는 그 줄의 일이라 그 자리에서 끝난다.
//
// 접힘일 때 서는 것 = **고른 것 + 핀**. 핀이 필요한 이유는 월이다: 달이 14개라 다 깔면 줄이 넘치는데
// 실제로 오가는 건 최근 두어 달이다. 핀은 그 "자주"를 손이 정하게 한다(자동 규칙 — 최근 N개 — 은
// 내 의도와 다를 때 고칠 손잡이가 없다).
//
// ⚠ 핀을 거는 자리는 **⋯ 판 하나**다(칩 우클릭 아님 — 사용자 확정). 그리고 그 판은 **늘 후보 전부**를
// 보여준다: 고정한 항목이 판에서 사라지면 해제하러 갈 자리가 없어지고(줄의 칩은 이제 우클릭을 안 받는다),
// "무엇을 고정해 뒀나"를 판에서 읽을 수도 없다. 그래서 판은 목록이지 "나머지"가 아니다 —
// 고정 여부는 오른쪽 손잡이의 색과 굵기로 구분한다.
//
// ⚠ 넘치면 **가로 스크롤**이지 줄바꿈이 아니다(ScrollRow 규약). 펼친 월 줄은 길어지지만, 줄바꿈으로
// 줄 높이가 오르내리면 그 아래 목록이 클릭할 때마다 위아래로 움직인다.
import type { ReactNode } from "react";
import { GazeChip, ScrollRow } from "../components/ControlChrome.js";
import { HeaderPopover } from "../components/HeaderPopover.js";

/** 네 채널. 순서가 곧 줄 순서다(더보기 토글도 이 순서로 선다). */
export const WORKSET_ROW_IDS = ["set", "month", "filter", "preset"] as const;
export type WorksetRowId = (typeof WORKSET_ROW_IDS)[number];

export const WORKSET_ROW_LABEL: Record<WorksetRowId, string> = {
    set: "집합", month: "월", filter: "필터", preset: "프리셋",
};

/**
 * 줄 상태 — 표시·펼침·핀. 한 키에 통째로 산다(`wb.workset.rows`): 셋이 갈리면 "줄 하나의 상태"를
 * 읽는 데 키 셋을 맞춰야 하고, 하나만 깨진 저장본이 나머지와 어긋난 화면을 만든다.
 *
 * ⚠ 필터 줄은 `expanded`·`pins` 를 **안 쓴다**(DNF 는 고를 후보 목록이 아니라 조립식이라 펼칠 게 없다).
 * 그래도 레코드를 네 칸으로 채우는 건 union 으로 가르는 것보다 읽고 쓰기가 단순해서다.
 */
export interface WorksetRowState {
    shown: Record<WorksetRowId, boolean>;
    expanded: Record<WorksetRowId, boolean>;
    pins: Record<WorksetRowId, string[]>;
}

export const DEFAULT_ROW_STATE: WorksetRowState = {
    shown: { set: true, month: true, filter: true, preset: true },
    // 집합·월은 접힘으로 시작한다(고른 것만) — 처음 보이는 화면의 대부분이 목록이어야 한다.
    // 프리셋은 반대다: 고른 게 없는 게 정상이라 접으면 빈 줄이 된다(이름을 봐야 고른다).
    expanded: { set: false, month: false, filter: true, preset: true },
    pins: { set: [], month: [], filter: [], preset: [] },
};

const boolRec = (o: unknown, def: Record<WorksetRowId, boolean>): Record<WorksetRowId, boolean> => {
    const src = (typeof o === "object" && o !== null ? o : {}) as Record<string, unknown>;
    return Object.fromEntries(WORKSET_ROW_IDS.map((id) =>
        [id, typeof src[id] === "boolean" ? src[id] : def[id]])) as Record<WorksetRowId, boolean>;
};

/** 저장본 파서 — 필드마다 따로 접는다(하나가 깨져도 나머지는 산다 — 줄 넷이 통째로 초기화되지 않게). */
export const parseRowState = (o: unknown): WorksetRowState | null => {
    if (typeof o !== "object" || o === null) return null;
    const raw = o as { shown?: unknown; expanded?: unknown; pins?: unknown };
    const pinsSrc = (typeof raw.pins === "object" && raw.pins !== null ? raw.pins : {}) as Record<string, unknown>;
    return {
        shown: boolRec(raw.shown, DEFAULT_ROW_STATE.shown),
        expanded: boolRec(raw.expanded, DEFAULT_ROW_STATE.expanded),
        pins: Object.fromEntries(WORKSET_ROW_IDS.map((id) => {
            const v = pinsSrc[id];
            return [id, Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []];
        })) as Record<WorksetRowId, string[]>,
    };
};

/** 줄에 서는 칩 하나 — 채널마다 뜻이 달라도(택1·다중·교체) 줄이 아는 건 이 모양뿐이다. */
export interface ChipItem {
    /** 핀 저장 키이자 React 키 — 채널 안에서 유일해야 한다. */
    key: string;
    label: string;
    active: boolean;
    /** 켜짐 채움색(기본 accent). */
    color?: string;
    title?: string;
    tabular?: boolean;
    onClick: (e: React.MouseEvent) => void;
}

/**
 * 줄에 세울 칩 고르기 — 펼침이면 전부, 접힘이면 **고른 것 + 핀**.
 * 선언 순서를 지킨다: 고른 것을 앞으로 당기면 클릭할 때마다 칩이 자리를 바꿔 다음 클릭이 빗나간다.
 */
export function visibleChips(
    items: readonly ChipItem[],
    pins: readonly string[],
    expanded: boolean,
): { shown: ChipItem[]; rest: ChipItem[] } {
    if (expanded) return { shown: [...items], rest: [] };
    const pinned = new Set(pins);
    const shown: ChipItem[] = [];
    const rest: ChipItem[] = [];
    for (const it of items) (it.active || pinned.has(it.key) ? shown : rest).push(it);
    return { shown, rest };
}

const LABEL_W = 40;

/** 네 줄이 공유하는 골격 — 이름 열 + 내용. 칩 모델이 아닌 줄(필터)도 이걸 써야 세로가 맞는다. */
export function WorksetRowShell({ label, caret, onLabelClick, title, children }: {
    label: string;
    /** 펼침 표시 — 없으면(필터 줄) 이름만 서고 클릭도 안 받는다. */
    caret?: "open" | "closed";
    onLabelClick?: () => void;
    title?: string;
    children: ReactNode;
}): JSX.Element {
    const name = (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, width: LABEL_W, flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)" }}>
            {label}
            {caret && <span style={{ fontSize: 9 }}>{caret === "open" ? "▾" : "▸"}</span>}
        </span>
    );
    return (
        <ScrollRow gap={4} style={{ flexShrink: 0, padding: "3px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)" }}>
            {onLabelClick
                ? <button onClick={onLabelClick} title={title}
                    style={{ border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", flexShrink: 0 }}>
                    {name}
                </button>
                : <span title={title}>{name}</span>}
            {children}
        </ScrollRow>
    );
}

/** 칩 줄 하나 — 후보를 칩으로 세우고, 접혀서 안 선 것들은 ⋯ 팝오버가 든다. */
export function ChipRow({ id, items, expanded, onToggleExpanded, pins, onTogglePin, hint }: {
    id: WorksetRowId;
    items: readonly ChipItem[];
    expanded: boolean;
    onToggleExpanded: () => void;
    pins: readonly string[];
    /** 핀 토글 — ⋯ 판의 "고정" 손잡이 하나뿐이다(줄의 칩은 고르는 일만 한다). */
    onTogglePin: (key: string) => void;
    /** 줄 끝의 낮은 안내(비었을 때 등). */
    hint?: string;
}): JSX.Element {
    const label = WORKSET_ROW_LABEL[id];
    const { shown, rest } = visibleChips(items, pins, expanded);
    const pinned = new Set(pins);
    return (
        <WorksetRowShell label={label} caret={expanded ? "open" : "closed"} onLabelClick={onToggleExpanded}
            title={expanded ? `${label} — 클릭 = 접기(고른 것과 고정한 것만 남는다)` : `${label} — 클릭 = 후보 전부 펼치기`}>
            {/* 칩은 **고르는 일만** 한다 — 핀은 ⋯ 판의 몫이다(사용자 확정).
                ⚠ **고르는 칩**(GazeChip — 둥근 알약, 누르면 시선이 바뀐다)에는 우클릭이 없다: 같은 겉모습의
                칩이 자리마다 다른 손짓을 받으면 그게 보이지도 않는다. 우클릭에 뜻을 얹는 건 겉모습이 갈리는
                **조립물의 부품 칩**(필터 줄의 ClauseChip — 종류색 각진 토큰)과 집합 칩(SetChips)뿐이다. */}
            {shown.map((it) => (
                <GazeChip key={it.key} label={it.label} active={it.active} tabular={it.tabular ?? false}
                    {...(it.color !== undefined ? { color: it.color } : {})}
                    title={pinned.has(it.key) ? `${it.title ?? it.label} (고정됨)` : (it.title ?? it.label)}
                    onClick={it.onClick} />
            ))}
            {items.length > 0 && (
                // ⋯ 는 **늘 선다**(줄에 다 서 있을 때도): 여기가 핀을 거는 유일한 자리라, 전부 고정해 두면
                // 판에 못 들어가 해제할 길이 없어진다. 숫자는 "지금 줄에 없는 것"만 센다(0이면 안 적는다).
                <HeaderPopover width={196} align="start" closeOnOutside
                    trigger={(_open, toggle) => (
                        <button onClick={toggle} title={`${label} 전부 보기 · 고정하기${rest.length > 0 ? ` — 줄에 없는 것 ${rest.length}개` : ""}`}
                            style={{
                                flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 10.5, padding: "1px 7px",
                                borderRadius: 9, border: "0.5px dashed var(--border-strong)", background: "transparent",
                                color: "var(--text-tertiary)", whiteSpace: "nowrap",
                            }}>
                            ⋯{rest.length > 0 ? ` ${rest.length}` : ""}
                        </button>
                    )}>
                    {(close) => (
                        <div style={{ maxHeight: 300, overflowY: "auto", padding: "2px 0" }}>
                            <div style={{ padding: "3px 10px 4px", fontSize: 9.5, color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>
                                고정 = 접혀 있어도 줄에 남습니다
                            </div>
                            {items.map((it) => {
                                const on = pinned.has(it.key);
                                return (
                                    <div key={it.key} style={{ display: "flex", alignItems: "center", background: it.active ? "var(--accent-soft)" : "transparent" }}>
                                        <button onClick={(e) => { it.onClick(e); close(); }} title={it.title ?? it.label}
                                            style={{
                                                flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent",
                                                color: "var(--text-primary)", padding: "4px 4px 4px 10px", cursor: "pointer",
                                                font: "inherit", fontSize: 11.5, fontWeight: it.active ? 700 : 400,
                                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                            }}>
                                            {it.label}
                                        </button>
                                        {/* 고정/해제 — 색과 굵기로 상태를 말한다. 글자는 안 바꾼다: "고정"↔"해제"로 갈리면
                                            폭이 흔들려 목록이 출렁이고, 무엇보다 같은 자리의 같은 손잡이로 안 읽힌다. */}
                                        <button onClick={() => onTogglePin(it.key)}
                                            aria-pressed={on}
                                            title={on ? `${it.label} — 고정 해제(줄에서 내린다)` : `${it.label} — 이 줄에 고정(접혀 있어도 늘 선다)`}
                                            style={{
                                                flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 9,
                                                padding: "0 5px", margin: "0 6px 0 4px", borderRadius: 3,
                                                border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`,
                                                background: on ? "var(--accent-soft)" : "transparent",
                                                color: on ? "var(--accent-primary)" : "var(--text-tertiary)",
                                                fontWeight: on ? 700 : 400,
                                            }}>
                                            고정
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </HeaderPopover>
            )}
            {hint && <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)", paddingLeft: 2 }}>{hint}</span>}
        </WorksetRowShell>
    );
}
