// 뭉친 라벨(**개수 뱃지**)의 호버가 손 밑에서 새지 않는다는 걸 실제 DOM 에서 못박는다.
//
// 겪은 버그: 라벨 쪽 누수를 고치면서 뱃지 갈래를 빠뜨렸다. 뱃지의 정체(React key)가 `B|대표|머릿수` 라
// **머릿수가 줄면 id 가 바뀌었고**, 그러면 손 밑의 뱃지가 부서졌다. 언마운트된 노드는 mouseleave 를
// 안 쏘니 무리 색이 화면에 그대로 눌어붙었다. 머릿수가 줄어드는 손짓은 멀리 있다 — 다른 패널이 타점을
// 옮기면(포커스 버스) 그 선이 묶음에서 빠지면서 줄어든다. 즉 **이 패널을 만지지 않아도** 터진다.
//
// 고친 방식은 두 겹이다. 둘 다 여기서 잰다:
//   ① 뱃지 id 는 **대표 하나**로 잡는다 — 멤버가 드나들어도 같은 뱃지라 노드가 살아남는다.
//   ② 그래도 대표 자신이 짚히면 그건 정말 다른 무리다. 그때를 위해 호버 상태는 멤버 배열이 아니라
//      **뱃지 id 하나**만 들고, 무리는 매번 지금 손잡이 목록에서 되찾는다 — 뱃지가 없어지면 조회가
//      비므로 낡은 무리가 **표현 불가능**해진다(치우는 코드가 따로 없다는 게 핵심이다).
//
// ⚠ React 의 onMouseEnter/onMouseLeave 는 native mouseenter 를 안 듣는다(mouseover/mouseout 으로
//   합성한다) — 그래서 fireEvent 도 mouseOver/mouseOut 으로 쏜다(labelHover 테스트와 같은 사정).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent, act } from "@testing-library/react";
import { SkeletonOverlayPanel } from "../../SkeletonOverlayPanel.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { useWorkbench } from "../../../store/workbench.js";
import { drawnOps, kindIn } from "./drawProbe.js";
import { CLUSTER_CODES, DATE, TIME, clusterFeed, clusterPoints } from "./overlayFixture.js";

const [REP, MEMBER_B, MEMBER_C] = CLUSTER_CODES;

/** 안 짚은 선의 색 — 무리 색이 실렸는지는 "이 색이 아닌 것"으로 잰다(팔레트 값에 안 매이게). */
const BASE_STROKE = "var(--text-secondary)";

const renderPanel = (): HTMLElement =>
    renderWithProviders(<SkeletonOverlayPanel grain="daily" />, { skeletons: clusterFeed, points: clusterPoints }).container;

/** 개수 뱃지 — 조작 안내로 라벨·헤더 버튼과 갈린다. */
const badgeOf = (c: HTMLElement): HTMLButtonElement | undefined =>
    [...c.querySelectorAll("button")].find((b) => (b.title ?? "").includes("개 뭉침"));

/**
 * 골격선들의 획 색 — 무리 색이 실렸는지 그림에서 직접 읽는다.
 * 선은 캔버스로 옮겨 가 DOM 에 없으므로 캔버스가 그린 **표시목록**에서 읽는다(drawProbe).
 */
const strokes = (c: HTMLElement): string[] =>
    kindIn(drawnOps(c, "skeleton-lines"), "polyline").map((p) => p.stroke);

/** 무리 색이 실린 선 수 — 기본색도 선택색(ACTIVE)도 아닌 것들. */
const groupColored = (c: HTMLElement): number =>
    strokes(c).filter((s) => s !== BASE_STROKE && s !== "#0ea5e9").length;

/** 다른 패널이 타점을 옮긴 것과 같은 경로(포커스 버스). 스토어 쓰기라 act 로 흘려보낸다. */
const focusFromElsewhere = (code: string): void =>
    act(() => { useWorkbench.getState().goToPoint({ code, date: DATE, time: TIME }, "test"); });

// 스토어는 모듈 싱글톤이라 다음 파일로 샌다 — 활성 타점이 남으면 다른 테스트의 "짚은 게 없는 화면"이
// 조용히 "짚은 화면"이 된다(effSelected 폴백).
beforeEach(() => { useWorkbench.setState({ activePoint: null, skeletonSelection: new Set() }); });
afterEach(() => { useWorkbench.setState({ activePoint: null, skeletonSelection: new Set() }); localStorage.clear(); });

describe("뭉친 라벨 — 뱃지가 서 있나", () => {
    // 아래 검사가 전부 뱃지를 상대로 하므로, 뱃지가 없으면 통째로 헛돈다.
    it("세 골격이 한 칸에 뭉쳐 개수 뱃지가 된다", () => {
        const badge = badgeOf(renderPanel());
        expect(badge).toBeTruthy();
        expect(badge!.textContent).toBe("3");
    });

    it("짚으면 무리 색이 **그림에** 실린다 — 이게 실려야 '안 풀린다'를 잴 수 있다", () => {
        const c = renderPanel();
        expect(groupColored(c)).toBe(0);
        fireEvent.mouseOver(badgeOf(c)!, { relatedTarget: document.body });
        expect(groupColored(c)).toBe(3);
    });
});

describe("뭉친 라벨 — 손 밑에서 안 부서진다", () => {
    // ⚠ 이 파일의 존재 이유. 겪은 버그가 정확히 여기서 났다.
    it("**짚은 채 멤버 하나가 빠져도 그 뱃지 노드가 살아 있다** — 부서지면 leave 가 영영 안 온다", () => {
        const c = renderPanel();
        const badge = badgeOf(c)!;
        fireEvent.mouseOver(badge, { relatedTarget: document.body });

        focusFromElsewhere(MEMBER_B); // 이 선이 묶음에서 빠져 머릿수가 3→2

        expect(badge.isConnected).toBe(true); // ← 옛 id(머릿수 포함)에선 여기서 떨어져 나갔다
        expect(badge.textContent).toBe("2");  // 같은 노드가 줄어든 머릿수를 말한다
        expect(badgeOf(c)).toBe(badge);       // 새 뱃지가 따로 생기지도 않았다
    });

    it("살아남은 뱃지에서 손을 치우면 무리 색이 풀린다 — 그 노드가 leave 를 쏜다", () => {
        const c = renderPanel();
        const badge = badgeOf(c)!;
        fireEvent.mouseOver(badge, { relatedTarget: document.body });
        focusFromElsewhere(MEMBER_B);

        fireEvent.mouseOut(badge, { relatedTarget: document.body });
        expect(groupColored(c)).toBe(0);
    });
});

describe("뭉친 라벨 — 뱃지가 정말 사라지는 경우", () => {
    // 대표가 짚히면 남은 것들은 **다른 뱃지**다(id 가 대표로 잡히므로). 노드가 바뀌는 게 맞고,
    // 그때 낡은 무리가 안 남는지가 두 번째 겹의 몫이다.
    it("대표가 빠지면 뱃지는 갈리지만 **무리 색이 안 남는다** — 상태가 id 라 조회가 빈다", () => {
        const c = renderPanel();
        const badge = badgeOf(c)!;
        fireEvent.mouseOver(badge, { relatedTarget: document.body });
        expect(groupColored(c)).toBe(3);

        focusFromElsewhere(REP); // 대표가 묶음에서 빠진다

        expect(badge.isConnected).toBe(false); // 정말 다른 뱃지다
        expect(groupColored(c)).toBe(0);       // ← 옛 구조(멤버 배열을 상태로)에선 색이 눌어붙었다
    });

    it("뭉침이 풀려 라벨이 되어도 무리 색이 안 남는다", () => {
        const c = renderPanel();
        fireEvent.mouseOver(badgeOf(c)!, { relatedTarget: document.body });
        // 셋 중 둘이 빠지면 남는 하나는 뱃지가 아니라 라벨이다.
        act(() => {
            useWorkbench.setState({ skeletonSelection: new Set([`${MEMBER_B}|${DATE}`, `${MEMBER_C}|${DATE}`]) });
        });
        expect(badgeOf(c)).toBeUndefined();
        expect(groupColored(c)).toBe(0);
    });
});

describe("뭉친 라벨 — 층을 떠날 때의 그물", () => {
    it("라벨 층 전체를 떠나면 뱃지 호버도 풀린다 — 칩의 leave 가 어떤 이유로든 빠져도", () => {
        const c = renderPanel();
        const badge = badgeOf(c)!;
        fireEvent.mouseOver(badge, { relatedTarget: document.body });
        expect(groupColored(c)).toBe(3);

        fireEvent.mouseOut(badge.parentElement!, { relatedTarget: document.body });
        expect(groupColored(c)).toBe(0);
    });
});

describe("뭉친 라벨 — 목록 열기", () => {
    it("누르면 멤버 목록이 뜬다 — 뭉쳐도 어느 골격인지 알 길이 남는다(숨김이 아니라 압축)", () => {
        const c = renderPanel();
        fireEvent.click(badgeOf(c)!);
        const text = document.body.textContent ?? "";
        expect(text).toContain("3개 골격");
        for (const code of CLUSTER_CODES) expect(text).toContain(code === REP ? "삼성전자" : code === MEMBER_B ? "SK하이닉스" : "카카오");
    });
});
