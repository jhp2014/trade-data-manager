// 팬 한 프레임의 **비용 베이스라인** — 선 수를 올려가며 잰다.
//
// 왜 재나: 골격 층을 캔버스로 옮길지(그래서 무엇을 얻는지) 정하려면 "지금 한 프레임에 무슨 일이
// 얼마나 벌어지나"가 숫자로 있어야 한다. 옮기고 나서 이겼는지 졌는지 아는 유일한 방법이기도 하다.
//
// ## 무엇을 재는가 — 캔버스가 **없애는 것만**
// 줌·이동 한 프레임의 비용은 세 겹이다:
//   ① 모든 점의 화면 좌표 재계산 — 캔버스로 가도 남는다(불가피)
//   ② React 재조정(전 층 diff)   — 캔버스로 가면 사라진다
//   ③ DOM 쓰기(points 문자열)     — 캔버스로 가면 사라진다
// 여기서 재는 건 ①+②+③ 합이고, 캔버스가 걷어 가는 몫이 ②+③ 이다.
//
// ## 어떻게 한 프레임을 흉내 내나 — **크기를 1px 흔든다**
// d3-zoom 을 jsdom 에서 몰지 않는다(`pointer` 가 `getScreenCTM` 을 타는데 jsdom 엔 없다).
// 대신 패널 크기를 1px 씩 번갈아 통보한다 — 스케일이 새로 서고 모든 점의 화면 좌표가 바뀐다.
// 팬 프레임에서 벌어지는 일과 같다. (호버로 재면 안 된다: 좌표가 그대로면 값이 안 바뀌어 ③ 이 빠진다.)
//
// ## 이 수치는 **하한**이다 — 그리고 렌더러마다 빠지는 게 다르다
// jsdom 엔 페인트가 없어 어느 쪽이든 래스터화는 안 들어간다. 그 위에:
//   · SVG  — `setAttribute` 가 실제 Blink 보다 싸다(스타일 무효화·레이아웃 표시가 없다).
//   · 캔버스 — 2D 컨텍스트가 아예 없어 **그리기 호출 자체가 안 돈다**(표시목록까지만 돈다).
// 그래서 둘의 차이는 "React 재조정 + DOM 쓰기가 걷어진 몫"으로 읽어야지, 최종 프레임 시간의
// 비율로 읽으면 안 된다. 실제 캔버스 래스터화가 그 자리에 얼마를 채우는지는 브라우저에서 재야 한다.
//
// 평소 테스트에선 건너뛴다(느리고 단언이 없다). 돌리려면:
//   BENCH=1 pnpm --filter @trade-data-manager/workbench exec vitest run src/panels/norm/__tests__/panCost.dom.test.tsx
import { describe, it } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { scaleLinear } from "d3-scale";
import { drawnOps, kindIn } from "./drawProbe.js";
import { NormOverlayPanel } from "../NormOverlayPanel.js";
import { renderWithProviders, type Seed } from "../../../test/renderPanel.js";
import { dailyBundleOf, seedMode, seedPins } from "./overlayFixture.js";

const DATE = "2026-07-08";

/**
 * 크기를 **다시 통보할 수 있는** ResizeObserver — setup.ts 의 것은 관측 시작 때 한 번 주고 끝이라
 * 프레임을 반복할 수가 없다. 인스턴스를 모아 두고 원할 때 새 크기를 먹인다.
 */
interface Watch { cb: ResizeObserverCallback; targets: Element[] }
const watches: Watch[] = [];

function installResizeObserver(): void {
    class BenchResizeObserver implements ResizeObserver {
        private readonly watch: Watch;
        constructor(cb: ResizeObserverCallback) {
            this.watch = { cb, targets: [] };
            watches.push(this.watch);
        }
        observe(target: Element): void {
            this.watch.targets.push(target);
            fire(this.watch, 1000, 600);
        }
        unobserve(): void {}
        disconnect(): void {
            this.watch.targets.length = 0;
        }
    }
    window.ResizeObserver = BenchResizeObserver as unknown as typeof ResizeObserver;
}

function fire(w: Watch, width: number, height: number): void {
    const entries = w.targets.map((target) => ({
        target,
        contentRect: { width, height, top: 0, left: 0, bottom: height, right: width, x: 0, y: 0 },
    }));
    if (entries.length > 0) w.cb(entries as unknown as ResizeObserverEntry[], {} as ResizeObserver);
}

/** 모든 관측자에게 새 크기를 통보 — 한 번이 한 프레임이다. */
function resizeAll(width: number, height: number): void {
    for (const w of watches) fire(w, width, height);
}

/**
 * 일봉 항목 n 개(고정 슬롯 + 번들 시드). 라벨이 한 칸에 다 뭉치면(뱃지 하나) 실제와 딴판이 되므로
 * **선마다 값을 벌려** 라벨이 화면에 퍼지게 한다 — 라벨 층의 부담까지 같이 재려는 것이다.
 */
function seedOf(n: number, pivotCount: number): Seed {
    const codes = Array.from({ length: n }, (_, i) => String(100_000 + i));
    seedPins("daily", codes.map((code) => ({ code, date: DATE })));
    seedMode("daily", "lines"); // 벤치의 관심사는 선 층 — 자동(캔들) 판정을 비켜 간다
    return {
        charts: codes.map((code, i) => ({
            code, date: DATE,
            data: dailyBundleOf(code, Array.from({ length: Math.max(2, pivotCount) }, (_, k) =>
                10_000 + Math.round(2_000 * Math.sin(k * 0.7 + i * 0.11) + i * 3))),
        })),
    };
}

interface Sample { n: number; pivots: number; p50: number; p95: number; nodes: number; ops: number; points: number; dots: boolean }

/**
 * 프레임을 **하나씩** 재고 중앙값·p95 로 낸다. 총시간÷횟수(평균)로 내면 GC 한 번이 통째로 섞여
 * 실행마다 값이 튄다 — 한 프레임이 얼마냐가 질문이므로 분포로 답하는 게 맞다.
 */
function measure(n: number, pivotCount: number, frames: number): Sample {
    installResizeObserver();
    watches.length = 0;

    const { container } = renderWithProviders(<NormOverlayPanel grain="daily" />, seedOf(n, pivotCount));

    // 그림이 캔버스로 간 뒤 DOM 노드는 0이다 — 무엇을 그렸는지는 표시목록에서 읽는다(drawProbe).
    // 노드 수는 그대로 남겨 둔다: 이 값이 0이 아니면 그림이 어딘가 DOM 으로 새고 있다는 뜻이다.
    const nodes = container.querySelector('[data-layer="lines"]')?.querySelectorAll("*").length ?? 0;
    const drawn = drawnOps(container, "lines");
    const ops = drawn.length;
    // 점 예산(DOT_BUDGET=1200 총점)을 넘으면 피벗 점이 통째로 꺼진다. SVG 일 땐 이게 노드 수를
    // 선당 10 → 2 로 떨어뜨려 **선을 늘렸는데 프레임이 싸지는** 역전을 만들었다. 표에 상태를 적어 둔다.
    const dots = kindIn(drawn, "circle").length > 0;

    // 워밍업 — 첫 몇 프레임은 JIT·캐시 데우기라 곡선을 왜곡한다.
    for (let i = 0; i < 10; i++) act(() => resizeAll(1000 + (i % 2), 600));

    const times: number[] = [];
    for (let i = 0; i < frames; i++) {
        const t0 = performance.now();
        act(() => resizeAll(1000 + (i % 2), 600));
        times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const at = (q: number): number => times[Math.min(times.length - 1, Math.floor(times.length * q))];

    cleanup();
    return { n, pivots: pivotCount, p50: at(0.5), p95: at(0.95), nodes, ops, points: n * pivotCount, dots };
}

/**
 * **바닥값** — 캔버스로 옮겨도 남는 몫(① 좌표 재계산)만. React 도 DOM 도 문자열도 없이,
 * 모든 점을 스케일에 통과시키는 순수 계산이다. 캔버스 전환의 *목표치*가 이 값이다:
 * 옮기고 나서 이 근처로 안 내려오면 딴 데서 새는 것이다.
 */
function geometryFloor(n: number, pivotCount: number, frames: number): number {
    const x = scaleLinear().domain([0, pivotCount]).range([46, 1000]);
    const y = scaleLinear().domain([-30, 30]).range([600, 0]);
    const lines = Array.from({ length: n }, (_, i) =>
        Array.from({ length: pivotCount }, (_, k) => ({ x: k, y: Math.sin(k * 0.7 + i * 0.11) * 20 })));

    const times: number[] = [];
    for (let f = 0; f < frames; f++) {
        x.range([46, 1000 + (f % 2)]); // 프레임마다 스케일이 바뀌는 것까지 같게
        const t0 = performance.now();
        let sink = 0;
        for (const pts of lines) for (const p of pts) sink += x(p.x) + y(p.y);
        times.push(performance.now() - t0);
        if (sink === Infinity) throw new Error("최적화 방지");
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
}

describe.runIf(process.env.BENCH)("팬 프레임 비용", () => {
    const rows: Sample[] = [];

    it.each([
        // 0 = 상수 몫 — 헤더·푸터·라벨 층·컨텍스트 등 **선과 무관한** 재조정 비용.
        // 이걸 빼야 "선 하나가 얼마"가 나온다.
        [0, 8],
        [30, 8],
        [100, 8],
        [300, 8],
        [1000, 8],
        [100, 60],
        [300, 60],
    ])("선 %i개 × 피벗 %i개", (n, p) => {
        rows.push(measure(n, p, 60));
    }, 180_000);

    it("표", () => {
        const base = rows.find((r) => r.n === 0)?.p50 ?? 0;
        const line = (s: Sample): string => {
            const perLine = s.n === 0 ? "—" : `${(((s.p50 - base) / s.n) * 1000).toFixed(0)} µs`;
            const floor = s.n === 0 ? 0 : geometryFloor(s.n, s.pivots, 30) + base;
            const gain = s.n === 0 ? "—" : `${(s.p50 / floor).toFixed(1)}×`;
            return `  ${String(s.n).padStart(5)} × ${String(s.pivots).padStart(3)}` +
                ` │ ${s.p50.toFixed(1).padStart(7)} │ ${s.p95.toFixed(1).padStart(7)}` +
                ` │ ${perLine.padStart(7)}` +
                ` │ ${(s.n === 0 ? "—" : floor.toFixed(1)).padStart(7)} │ ${gain.padStart(5)}` +
                ` │ ${String(s.nodes).padStart(5)} │ ${String(s.ops).padStart(6)} │ ${String(s.points).padStart(6)}` +
                ` │ ${s.dots ? "켬" : "끔"}`;
        };
        // eslint-disable-next-line no-console
        console.log(
            `\n  팬 한 프레임(jsdom)\n` +
            `  선 × 피벗 │  p50 ms │  p95 ms │ 선당(상수) │  바닥 │ 여지 │ 노드 │    op │    점 │ 점\n` +
            `  ─────────────────────────────────────────────────────────────────────────────────────────\n` +
            rows.map(line).join("\n") +
            `\n\n  상수 몫(선 0개) = ${base.toFixed(1)} ms — 헤더·라벨 층·컨텍스트\n` +
            `  바닥 = 좌표 재계산 + 상수 = **그림을 어디에 그리든 남는 몫**. 여지 = 지금 ÷ 바닥.\n` +
            `  노드 = 그림이 DOM 으로 새는지(캔버스로 간 뒤엔 0). op = 표시목록이 실제로 낸 도형 수.\n` +
            `  프레임 예산 16.7 ms (60fps) 기준.\n` +
            `  ⚠ jsdom 엔 2D 컨텍스트가 없어 **래스터화는 안 들어간다** — 캔버스 쪽 수치는 JS 몫\n` +
            `    (표시목록 만들기 + React 렌더)만이다. SVG 쪽은 DOM 쓰기까지 들어 있었으므로,\n` +
            `    둘의 차이는 "React·DOM 이 걷어진 몫"으로 읽어야지 최종 프레임 시간이 아니다.\n`,
        );
    });
});
