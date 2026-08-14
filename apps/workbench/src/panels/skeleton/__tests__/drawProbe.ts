// 렌더된 패널의 **그림을 들여다보는 창구** — 화면 테스트가 DOM 대신 이걸 본다.
//
// 그림 세 층(캔들·테마 선·골격선)은 캔버스로 옮겨 가 DOM 에 없다. 예전처럼 `polyline` 을 세면
// 언제나 0이 나오므로, 캔버스가 마지막으로 그린 표시목록을 읽어 같은 질문을 던진다:
// "선이 정말 그려졌나", "무리 색이 실렸나", "캔들이 테마보다 아래인가".
//
// jsdom 엔 2D 컨텍스트가 없어 실제로 칠해지진 않지만, **무엇을 그리려 했는지**는 목록에 다 있다.
// 오히려 색·굵기·순서를 속성 문자열이 아니라 값으로 보게 돼 단언이 정확해졌다.
import { drawListOf, opsOf } from "../CanvasPainter.js";
import type { DrawLayer, DrawOp } from "../drawList.js";

/** 캔버스가 마지막으로 그린 층들(그린 순서대로). */
export const drawnLayers = (c: HTMLElement): readonly DrawLayer[] =>
    drawListOf(c.querySelector("canvas")) ?? [];

/** 그린 층 이름들 — 순서 검사가 쓴다. */
export const drawnNames = (c: HTMLElement): string[] =>
    drawnLayers(c).map((l) => l.name);

/** 층 하나가 그린 도형 전부. */
export const drawnOps = (c: HTMLElement, name: string): DrawOp[] =>
    opsOf(drawnLayers(c).filter((l) => l.name === name));

/** 그중 한 종류만 — `kindIn(ops, "polyline")` 처럼. */
export const kindIn = <K extends DrawOp["op"]>(ops: readonly DrawOp[], k: K): Extract<DrawOp, { op: K }>[] =>
    ops.filter((o): o is Extract<DrawOp, { op: K }> => o.op === k);
