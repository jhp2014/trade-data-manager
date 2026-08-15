// 겹침 숫자를 어디에 놓을까(순수) — **선 중앙일 필요가 없다.**
//
// 화살표가 한 자리에서 부채꼴로 나가면 중점들이 한 골목에 몰려 숫자가 서로 가린다. 곡률을 벌려도
// 방향이 비슷하면 여전히 겹친다. 그래서 라벨을 **제 선 위에서 앞뒤로만** 미끄러뜨려 떼어 놓는다:
//   · 움직임을 선 방향 1차원으로 가두면 라벨이 제 선에서 안 떨어진다(어느 선의 숫자인지가 안 흐려진다).
//   · 시작은 중점, 필요할 때만 밀린다 — 안 겹치면 아무것도 안 움직인다.
//
// 자리 계산은 **직선 위**에서 한다. 실제 선은 살짝 휜 곡선이라 정확히 선 위는 아니지만, 굽은 정도가
// 작고 선이 가늘어 눈에는 붙어 보인다. 곡선을 정확히 따라가려면 제어점까지 알아야 하는데, 그 지식이
// 여기로 새어 들어오면 그리기 방식(베지어)이 바뀔 때 이 계산도 같이 깨진다.
export interface Point { x: number; y: number }

export interface LabelSpec {
    id: string;
    from: Point;
    to: Point;
}

/** 이보다 가까우면 겹친 것으로 본다(숫자 한두 자 + 배경 여백). */
const MIN_DIST = 30;
/** 중점에서 밀려날 수 있는 한계 — 선 길이의 이 비율까지(끝으로 붙으면 어느 노드 것인지 헷갈린다). */
const MAX_SHIFT_RATIO = 0.3;
const ITERATIONS = 16;

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 라벨 자리 — 서로 `MIN_DIST` 만큼 떨어지도록 각자 제 선 위에서 미끄러뜨린다.
 * 완전 해소를 보장하지 않는다(선이 셋 이상 한 점에 몰리면 물리적으로 불가능). 남는 겹침은 hover 가 받는다.
 */
export function spreadLabelPositions(specs: readonly LabelSpec[]): Map<string, Point> {
    const n = specs.length;
    const mid = specs.map((s) => ({ x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 }));
    const len = specs.map((s) => Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y));
    const dir = specs.map((s, i) => (len[i]! === 0 ? { x: 0, y: 0 } : { x: (s.to.x - s.from.x) / len[i]!, y: (s.to.y - s.from.y) / len[i]! }));
    const shift = new Array<number>(n).fill(0);
    const at = (i: number): Point => ({ x: mid[i]!.x + dir[i]!.x * shift[i]!, y: mid[i]!.y + dir[i]!.y * shift[i]! });

    for (let round = 0; round < ITERATIONS; round++) {
        let moved = false;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const pi = at(i);
                const pj = at(j);
                const d = dist(pi, pj);
                if (d >= MIN_DIST) continue;
                const need = (MIN_DIST - d) / 2 + 0.5;
                const cap = (k: number, v: number): number => {
                    const max = len[k]! * MAX_SHIFT_RATIO;
                    return Math.max(-max, Math.min(max, v));
                };
                // ⚠ 둘을 **서로 반대로** 민다. 방향 성분의 부호로 각자 정하면 거의 평행한 두 선에서
                // 같은 쪽으로 나란히 밀려 거리가 안 벌어진다(실측된 결함). 어느 쪽이 정답인지는
                // 기하로 단정하지 말고 **두 배치를 재보고 더 벌어지는 쪽**을 고른다.
                const tryPair = (sign: 1 | -1): { si: number; sj: number; gap: number } => {
                    const si = cap(i, shift[i]! + sign * need);
                    const sj = cap(j, shift[j]! - sign * need);
                    const a = { x: mid[i]!.x + dir[i]!.x * si, y: mid[i]!.y + dir[i]!.y * si };
                    const b = { x: mid[j]!.x + dir[j]!.x * sj, y: mid[j]!.y + dir[j]!.y * sj };
                    return { si, sj, gap: dist(a, b) };
                };
                const fwd = tryPair(1);
                const back = tryPair(-1);
                const best = fwd.gap >= back.gap ? fwd : back;
                if (best.gap <= d) continue; // 어느 쪽으로도 못 벌린다(한계에 걸림)
                if (best.si !== shift[i]! || best.sj !== shift[j]!) moved = true;
                shift[i] = best.si;
                shift[j] = best.sj;
            }
        }
        if (!moved) break;
    }
    return new Map(specs.map((s, i) => [s.id, at(i)]));
}
