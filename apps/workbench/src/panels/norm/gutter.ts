// 오른쪽 이름 거터의 **순수 계산** — 누가 이름을 달고, 그 칩이 세로 어디에 서나.
//
// **분봉 전용이다** — 일봉의 이름·정체는 바닥 원점 스택(OriginStack)이 진다.
//
// ## 이름은 그림 안에 안 붙는다(사용자 확정 — 옛 라벨 층 폐지)
// 예전엔 칩이 선 끝에 붙었다. 그러면 ① 글자가 그림 위에 얹혀 궤적을 덮고 ② 값이 비슷한 선끼리
// 겹쳐 화면 격자로 뭉쳐야 했으며(개수 뱃지) ③ 손잡이 자리가 팬·줌마다 화면을 돌아다녔다.
// 오른쪽 거터는 셋을 한꺼번에 없앤다: 그림엔 글자가 0개, 칩은 언제나 같은 세로열, 자리는 값 순서다.
//
// ## 거터의 세로 자리 = **화면 우단에서의 값**(= 최신)
// 앵커는 "선이 오른쪽 창에서 잘리는 자리"(labelAnchorAt·yAtX 와 같은 규칙)라 팬·줌하면 따라 움직인다.
// 축이 바로 옆(눈금 46px)이라 칩 높이와 눈금이 같은 척도에서 읽히고, 칩에 값까지 적어 둘이 겹쳐 읽힌다.
//
// ## 내 항목과 테마는 **한 목록에서 같이 벌어진다**
// 둘을 따로 벌리면 서로를 모르고 겹친다. 대신 무엇인지는 UI 가 가른다(칩 모양 — Gutter.tsx).
// 상한은 종류별로 따로다: 내 항목이 테마에 밀려 이름을 잃으면 안 되고(시선·호버는 상한 밖에서도 남는다),
// 테마는 30선이 와도 8개까지만 이름을 단다 — 나머지는 넘침 뱃지 하나로 묶여 목록으로 열린다.
import { layoutReadoutRows } from "../canvas/readout.js";

/** 거터 이름칸의 폭(px) — 눈금 칸(AXIS_W)의 바깥. 이름 4~6자 + 시각 + 값이 한 줄에 드는 최소치. */
export const GUTTER_W = 112;
/** 눈금 숫자 칸 — 그림과 이름칸 사이. 지시선이 이 칸을 가로지르므로 **눈금보다 먼저** 그린다. */
export const AXIS_W = 46;
/** 칩끼리의 최소 세로 간격(px). */
export const GUTTER_GAP = 14;
/** 이름을 다는 상한 — 내 항목 / 테마 따로(테마는 옛 THEME_LABEL_CAP 승계). */
export const GUTTER_CAP = { item: 12, theme: 8 } as const;

export type GutterKind = "item" | "theme";

/**
 * 거터에 설 후보 하나 — 값 공간의 자리까지만 안다(화면 좌표 환산은 아래 배치기의 몫).
 * `key` 는 손짓이 도로 찾는 정체다: 항목이면 선 키, 테마면 종목코드.
 */
export interface GutterCandidate {
    kind: GutterKind;
    key: string;
    name: string;
    /** 정체 보조(툴팁 전용) — 칩엔 안 적는다(이름이 잘린다). 화면에서의 정체는 바닥 원점 스택이 진다. */
    sub: string | null;
    /** 값 공간의 y(축과 같은 단위) — 칩에 적고, 세로 자리도 이걸로 정한다. */
    y: number;
    /** 지시선이 가리킬 값 공간의 x(선이 잘리는 자리). */
    x: number;
    /** 상한과 무관하게 이름을 다나 — 시선·호버는 언제나 남는다. */
    keep: boolean;
}

/** 자리를 잡은 칩 하나. */
export interface GutterRow {
    cand: GutterCandidate;
    /** 칩이 서는 y(화면). */
    labelY: number;
    /** 지시선이 가리키는 y(화면, 상자 안으로 당겨진 값). */
    anchorY: number;
    /** 진짜 값이 상자 밖이라 당겨졌나 — 칩에 ▲▼ 로 남는다. */
    off: "up" | "down" | null;
}

/** 이름을 못 단 후보 하나 — 뱃지의 자리(화면 y)를 같이 들고 나온다. */
export interface HiddenRow {
    cand: GutterCandidate;
    /** 화면 y — 뱃지를 숨은 무리의 중앙값 높이에 세우는 재료. */
    y: number;
}

export interface GutterLayout {
    rows: GutterRow[];
    /** 상한에 밀려 이름을 못 단 것들 — 종류별 뱃지 하나로 묶인다. */
    hidden: { item: HiddenRow[]; theme: HiddenRow[] };
}

/**
 * 후보들 → 칩 자리. 상한은 **종류별로** 자르고(값 큰 쪽이 남는다 — 아래쪽은 어차피 뭉쳐 못 읽는다),
 * 살아남은 것들은 **한 목록에서 함께** 벌린다(layoutReadoutRows: 가장자리 클램프 → 겹침 벌리기 → 통째 밀기).
 */
export function gutterLayout(
    cands: readonly GutterCandidate[],
    scaleY: (v: number) => number,
    range: { min: number; max: number },
    gap = GUTTER_GAP,
): GutterLayout {
    const named: GutterCandidate[] = [];
    const hidden = { item: [] as HiddenRow[], theme: [] as HiddenRow[] };
    for (const kind of ["item", "theme"] as const) {
        const mine = cands.filter((c) => c.kind === kind).sort((a, b) => b.y - a.y);
        let budget = GUTTER_CAP[kind];
        for (const c of mine) {
            // keep(시선·호버)은 예산을 쓰지 않고도 남는다 — 지금 보고 있는 것이 목록에서 사라지면 안 된다.
            if (c.keep) { named.push(c); continue; }
            if (budget > 0) { named.push(c); budget -= 1; continue; }
            hidden[kind].push({ cand: c, y: scaleY(c.y) });
        }
    }
    const rows = layoutReadoutRows(
        named.map((c) => ({ item: c, y: scaleY(c.y) })),
        range,
        gap,
    ).map((r) => ({ cand: r.item, labelY: r.labelY, anchorY: r.anchorY, off: r.off }));
    return { rows, hidden };
}
