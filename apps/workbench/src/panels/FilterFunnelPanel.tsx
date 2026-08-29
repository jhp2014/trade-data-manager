// 집합 편성 패널 — **집합이 태어나는 단 하나의 자리**이자 조건의 **관리소**. 다른 패널(골격·시트·
// 배치·분석)은 여기서 나온 집합을 구독만 한다 — 조건을 나눠 주면 패널마다 판정을 재구현해 서로 다른
// 답을 내는데, 그게 옛 필터 UI 가 두 곳이라 생긴 문제와 같은 종류다.
//
// 화면은 **가운데가 본론**이다:
//   · 머리글 — 손잡이 줄(막대·비우기·더보기).
//   · 집합 줄 — **상시 한 줄**(전체·연동·고정한 집합 + 줄 끝 집합 관리 판). 켜진 칩이 "지금 보는 집합".
//   · 가운데 — **조건 보드**: 걸린 것 전부가 요약 줄로 서고, 순서·켜기/끄기·삭제·생성이 여기 있다.
//
// ⚠ **값 편집은 이 패널에 없다**(2026-08-29 재편). 종류마다 제일 잘 보여주는 편집면이 따로 있다 —
// 레일(축·날짜·시간)은 필터 레일 패널, 테마는 테마 순위 패널, 그룹만 판이 없어 그 자리 팝오버.
// 사본이 아니라 **같은 stages 저장소를 다른 렌즈로** 보는 것이라 동기화·연동 수명 규칙이 없다.
//
// 두 패널의 경계(사용자 확정): **조건(집합을 낳는다)과 집합 고르기는 여기**, 시선(월·존재 필터)은
// 작업셋 패널. "본격/편의"가 아니라 성질로 가른다 — 정도 기준은 한 칸씩 밀려 같은 조건의 집이 둘이 된다.
//
// ⚠ 어휘 — **필터는 과정, 집합은 산출물.** 줄·막대에는 "필터"가, 칩·바인딩·피커에는 "집합"만 보인다.
// 코드의 `stage`(단계)는 core 깔때기 정산의 모델 낱말이라 그대로 둔다(상류·새로 죽임이 그 순서에 매여 있다).
import { usePanelUi } from "../store/usePanelUi.js";
import { useFunnel } from "./filter/FunnelContext.js";
import { ConditionBoard } from "./filter/ConditionBoard.js";
import { FunnelHeader } from "./filter/FunnelHeader.js";
import { SetRow } from "./filter/SetRow.js";

export function FilterFunnelPanel({ panelId }: { panelId: string }): JSX.Element {
    const v = useFunnel();
    // 막대는 **기본 접힘** — 처음 보이는 것은 "무엇이 걸렸나"이고, "얼마나 걸렀나"는 따져 볼 때 편다.
    const [barsOpen, setBarsOpen] = usePanelUi(panelId, "barsOpen", false);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 12, color: "var(--text-primary)" }}>
            <FunnelHeader v={v} barsOpen={barsOpen} onToggleBars={() => setBarsOpen(!barsOpen)} />

            <SetRow />

            <div style={{ flex: 1, minHeight: 0 }}>
                <ConditionBoard barsOpen={barsOpen} />
            </div>
        </div>
    );
}
