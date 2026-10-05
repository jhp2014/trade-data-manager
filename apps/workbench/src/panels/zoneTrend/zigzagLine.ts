// 존 추세 선의 **뷰 전용** 지그재그 축약 — 등락률(%) 공간의 가산 %p 임계 + 현재 샘플까지의
// prefix 인과 축약(decisions.md 「존 추세 판」). 분류 재료가 아니다 — 구운 격자(core grid)와 마디가
// 미세하게 달라도 된다(격자는 앵커 차트에만 존재해 존 멤버 커버리지가 안 된다).
//
// core grid `zigzagIdxOf` 를 재사용하지 않는 이유:
//  · 곱셈식 임계(`×(1±pct)`) — 등락률 공간에선 0% 근처에서 임계가 0에 수렴해 뜻이 무너진다.
//  · 세션 최고가 갱신 tie 규칙·불변식 throw 가 고가·저가 봉 전용 계약이다.
//  · 시작점·끝점(현재 분)을 내지 않는다 — 선은 양 끝이 있어야 한다.
//
// 인과성: 피벗은 "반전이 임계를 넘은 샘플"에서 확정된다 — m 까지의 축약과 m′(>m) 축약은 확정
// 피벗이 prefix 관계다(스크럽을 앞으로 돌려도 지난 모양이 안 바뀌고 꼬리만 움직인다 — 테스트가 잡는다).

/**
 * values[0..endIdx] 의 지그재그 꼭짓점 인덱스(오름차순).
 * 반환 = [0, 확정 피벗들…, (진행 중 leg 의 미확정 극값), endIdx] — 중복 인덱스는 접는다.
 * `thresholdPt` = 가산 %p: |반전 폭| ≥ thresholdPt 에서 직전 극값이 피벗으로 확정된다(경계 포함).
 * endIdx < 0 이거나 값이 없으면 [].
 */
export function zigzagIdx(values: readonly number[], thresholdPt: number, endIdx: number): number[] {
    const n = Math.min(endIdx, values.length - 1);
    if (n < 0) return [];
    if (n === 0) return [0];
    const out: number[] = [0];
    let dir = 0; // 0 = 미정(첫 반전 전), 1 = 상승 leg, -1 = 하락 leg
    let hiIdx = 0;
    let hiVal = values[0];
    let loIdx = 0;
    let loVal = values[0];
    for (let i = 1; i <= n; i++) {
        const v = values[i];
        if (v > hiVal) { hiVal = v; hiIdx = i; }
        if (v < loVal) { loVal = v; loIdx = i; }
        // 확정은 "그 샘플에서" 일어난다(인과) — 확정 뒤 양 극값을 지금 샘플로 리셋한다. 지금 샘플이
        // leg 안의 극값인 것은 보장돼 있다(더 낮은/높은 샘플이 먼저 있었다면 거기서 이미 확정됐다).
        if (dir >= 0 && hiVal - v >= thresholdPt) {
            if (out[out.length - 1] !== hiIdx) out.push(hiIdx);
            dir = -1;
            hiIdx = i; hiVal = v;
            loIdx = i; loVal = v;
        } else if (dir <= 0 && v - loVal >= thresholdPt) {
            if (out[out.length - 1] !== loIdx) out.push(loIdx);
            dir = 1;
            hiIdx = i; hiVal = v;
            loIdx = i; loVal = v;
        }
    }
    // 미확정 꼬리 — 진행 중 leg 의 극값(끝점 자신이 아니면). dir 미정 = 임계 미달 흔들림뿐 — 꼬리 없음.
    const tail = dir === 1 ? hiIdx : dir === -1 ? loIdx : -1;
    if (tail > out[out.length - 1] && tail !== n) out.push(tail);
    if (out[out.length - 1] !== n) out.push(n);
    return out;
}
