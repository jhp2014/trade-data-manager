// 시뮬 분류 어휘 한 벌 — 패널(분류 띠·범례)과 시트 상태 셀이 같은 라벨·색·서수를 본다(두 벌이면
// 띠와 셀이 딴말을 한다). 잎 모듈 — 컴포넌트를 물지 않는다.
import type { SimStatus } from "@trade-data-manager/market/domain";
import { FAIL, LEG_HIGH, STRONG } from "../../styles/palette.js";

export interface SimStatusMeta {
    label: string;
    color: string;
    /** 정렬 서수 — **비관 → 낙관**(손절 0 < 시간 1 < 이탈 2 < 눌림부족 3 < 미결 4 < 익절 5):
     *  오름차순 = 나쁜 것부터 훑는 방향. 저장 정렬이 이 수를 물므로 바꾸면 사용자 정렬의 뜻이 바뀐다. */
    ord: number;
}

export const SIM_STATUS_META: Record<SimStatus, SimStatusMeta> = {
    stop: { label: "손절", color: FAIL, ord: 0 },
    expired: { label: "시간", color: "#6b7280", ord: 1 },
    // 이탈(취소선 선터치)만 미체결 중 앰버 — "움직임이 나 없이 떠났다"가 진짜 후회 케이스라 눈에 서야 한다.
    cancelled: { label: "이탈", color: LEG_HIGH, ord: 2 },
    shallow: { label: "눌림부족", color: "#b4b2a9", ord: 3 },
    open: { label: "미결", color: "#8b95a1", ord: 4 },
    take: { label: "익절", color: STRONG, ord: 5 },
};

/** 분류 띠·범례의 표시 순서 — 체결 3(익절/손절/미결) 먼저, 미체결 3 뒤(서수와 다른 축: 이건 읽기 순서다). */
export const SIM_STATUS_ORDER: readonly SimStatus[] = ["take", "stop", "open", "cancelled", "shallow", "expired"];
