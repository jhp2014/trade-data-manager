// 계산 축 → 판단 축과 **같은 모양**의 줄. 시트·순위 인덱스·정렬이 두 종류를 구분하지 않게 하는 어댑터.
//
// 서버는 값만 준다(`타점 → 수치`). 여기서 값을 정렬 좌표로 바꾼다:
//  · orderKey = 수치(강한 쪽이 작은 값인 축이면 부호 반전) — buildAxisIndex 관례가 "큰 orderKey = 강".
//  · slotId   = 값에서 파생 → **같은 수치는 자동으로 같은 자리(타이)**. 판단 축이 slot 행으로 저장하는 것을
//               계산 축은 값이 대신한다(저장할 위치가 없다).
//
// ⚠ slotId 는 값이 바뀌면 함께 바뀐다(수식 수정·재계산). 그래서 slotId 를 **영속 상태의 키로 쓰는 기능**
//   (밴드 경계·그룹 컷 = rankBands/cuts)은 계산 축에 아직 열지 않는다 — 조용히 끊긴 참조가 되기 때문.
//   보정(사람이 계산 줄에 개입)이 들어올 때 앵커 방식으로 함께 푼다.
import type { ComputedAxisFeed, PlacedPoint, RankAxis } from "@trade-data-manager/wire";

/** 계산 축 id 접두 — 판단 축 id(DB bigserial 문자열)와 절대 겹치지 않는다. */
const COMPUTED_PREFIX = "c:";

export const computedAxisId = (key: string): string => `${COMPUTED_PREFIX}${key}`;

/** 이 축이 계산 축인가 — 쓰기(배치/해제/이름변경)가 닿으면 안 되는 축인지 판정. */
export const isComputedAxis = (axisId: string): boolean => axisId.startsWith(COMPUTED_PREFIX);

export interface ComputedAxisView {
    axis: RankAxis;
    line: PlacedPoint[];
}

/** 서버 피드 1개 → (축 메타, 합성 줄). 판단 축 줄과 같은 타입이라 하류 소비자가 그대로 쓴다. */
export function computedAxisView(feed: ComputedAxisFeed): ComputedAxisView {
    const axisId = computedAxisId(feed.key);
    const sign = feed.strongerWhen === "higher" ? 1 : -1;
    const line: PlacedPoint[] = feed.values.map((v) => ({
        slotId: `${axisId}#${v.value}`,
        orderKey: sign * v.value,
        stockCode: v.stockCode,
        date: v.date,
        time: v.time,
    }));
    return { axis: { id: axisId, name: feed.name, scope: "point" }, line };
}
