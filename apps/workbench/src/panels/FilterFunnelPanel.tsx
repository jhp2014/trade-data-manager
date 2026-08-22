// 집합 편성 패널 — **집합이 태어나는 단 하나의 자리**. 조건은 여기서만 걸고 풀고, 집합(산출물)도
// 여기서만 게시된다. 다른 패널(골격·시트·배치·분석)은 그 집합을 구독만 한다 — 조건을 나눠 주면
// 패널마다 판정을 재구현해 서로 다른 답을 내는데, 그게 옛 필터 UI 가 두 곳이라 생긴 문제와 같은 종류다.
//
// 화면은 **가운데가 본론**이다:
//   · 머리글 — 손잡이 줄(걸린 것만·막대·비우기·더보기).
//   · 집합 줄 — **상시 한 줄**(전체·연동·고정한 집합 + 줄 끝 집합 관리 판). 켜진 칩이 "지금 보는 집합".
//     옛 위 서랍(접힘)과 머리글 상주 칩을 이것 하나가 대신한다(SetRow 주석).
//   · 가운데 — **필터 보드**(상시). 레일을 그으면 그 자리에서 조건이 된다.
//   · 아래 서랍 — **걸린 필터 막대**. 접히면 "필터 3 · 5,825 → 132" 요약 한 줄.
//
// 두 패널의 경계(사용자 확정): **조건(집합을 낳는다)과 집합 고르기는 여기**, 시선(월·존재 필터)은
// 작업셋 패널. "본격/편의"가 아니라 성질로 가른다 — 정도 기준은 한 칸씩 밀려 같은 조건의 집이 둘이 된다.
//
// ⚠ 어휘 — **필터는 과정, 집합은 산출물.** 보드·레일·막대에는 "필터"가, 칩·바인딩·피커에는 "집합"만
// 보인다. 코드의 `stage`(단계)는 core 깔때기 정산의 모델 낱말이라 그대로 둔다(상류·새로 죽임이 그
// 순서에 매여 있다).
import { useState } from "react";
import { usePanelUi } from "../store/usePanelUi.js";
import { useFunnel } from "./filter/FunnelContext.js";
import { FilterBars } from "./filter/FilterBars.js";
import { FilterBoard } from "./filter/FilterBoard.js";
import type { BoardReveal } from "./filter/boardReveal.js";
import { FunnelHeader } from "./filter/FunnelHeader.js";
import { SetRow } from "./filter/SetRow.js";

export function FilterFunnelPanel({ panelId }: { panelId: string }): JSX.Element {
    const v = useFunnel();
    // 보드의 "걸린 것만"은 **머리글 컨트롤**에 산다 — 보드 안에 있으면 목록의 일부처럼 보여 눌러야 할 자리로 안 읽힌다.
    const [onlyActive, setOnlyActive] = usePanelUi(panelId, "boardOnlyActive", false);
    // 막대 서랍은 **기본 접힘** — 처음 열었을 때 보이는 것이 곧 이 패널의 본론이어야 한다(보드).
    const [barsOpen, setBarsOpen] = usePanelUi(panelId, "barsOpen", false);
    const [reveal, setReveal] = useState<BoardReveal | null>(null);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <FunnelHeader v={v}
                barsOpen={barsOpen} onToggleBars={() => setBarsOpen(!barsOpen)}
                onlyActive={onlyActive} setOnlyActive={setOnlyActive} />

            <SetRow />

            <div style={{ flex: 1, minHeight: 0 }}>
                <FilterBoard reveal={reveal} onlyActive={onlyActive} />
            </div>

            {/* 되짚기 — 막대의 이름을 누르면 보드의 그 줄로 데려간다(편집 입구는 보드 하나뿐이다). */}
            <FilterBars open={barsOpen} onToggle={() => setBarsOpen(!barsOpen)}
                onReveal={(stageId) => setReveal({ stageId, at: Date.now() })} />
        </div>
    );
}
