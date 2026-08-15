// BulkGroupMenu 의 scope 계약을 값으로 잠근다 — 목록은 그 scope 만, 생성도 그 scope 로.
// 안 맞는 그룹을 보여줬다 서버 거절로 배우게 하지 않는 것이 이 창의 약속이다.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { Group } from "../../../api/groups.js";
import { apiPost } from "../../../api/http.js";
import { renderWithProviders } from "../../../test/renderPanel.js";
import { BulkGroupMenu } from "../ChartGroupMenu.js";

// http 층을 통째로 막는다 — 생성(mutation)과 그 뒤 invalidate 의 refetch 가 실제 네트워크를 치지 않게.
vi.mock("../../../api/http.js", () => ({
    apiGet: vi.fn().mockResolvedValue([]),
    apiPost: vi.fn().mockResolvedValue({ id: "new", name: "새그룹", scope: "day", parentId: null, mapId: null, x: null, y: null }),
    apiPatch: vi.fn().mockResolvedValue(undefined),
    apiPut: vi.fn().mockResolvedValue(undefined),
    apiDelete: vi.fn().mockResolvedValue(undefined),
}));

const g = (id: string, name: string, scope: Group["scope"]): Group =>
    ({ id, name, scope, parentId: null, mapId: null, x: null, y: null });

const GROUPS: Group[] = [g("d1", "갭상승", "day"), g("d2", "신고가", "day"), g("p1", "돌파타점", "point")];

const noop = (): void => {};

function open(scope: Group["scope"]): void {
    renderWithProviders(
        <BulkGroupMenu
            anchor={{ x: 0, y: 0 }}
            targets={[{ stockCode: "005930", date: "2026-06-30" }]}
            scope={scope}
            hasGroup={() => false}
            toggle={noop}
            label="테스트"
            onClose={noop}
        />,
        { groups: GROUPS },
    );
}

describe("BulkGroupMenu — scope 계약", () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(cleanup);

    it("day 창에는 day 그룹만 보인다", () => {
        open("day");
        expect(screen.getByText("갭상승")).toBeTruthy();
        expect(screen.getByText("신고가")).toBeTruthy();
        expect(screen.queryByText("돌파타점")).toBeNull();
    });

    it("point 창에는 point 그룹만 보인다", () => {
        open("point");
        expect(screen.getByText("돌파타점")).toBeTruthy();
        expect(screen.queryByText("갭상승")).toBeNull();
    });

    it("생성은 창의 scope 로 나간다 — day 창에서 만들면 day 그룹", async () => {
        open("day");
        fireEvent.change(screen.getByPlaceholderText("그룹 검색 · 새로 만들기"), { target: { value: "새그룹" } });
        fireEvent.click(await screen.findByText(/새 그룹으로 만들어 붙이기/));
        await waitFor(() => expect(apiPost).toHaveBeenCalledWith("groups", { name: "새그룹", scope: "day" }));
    });

    it("다른 scope 에 같은 이름이 있어도 이 scope 에 없으면 만들 수 있다", () => {
        open("point");
        fireEvent.change(screen.getByPlaceholderText("그룹 검색 · 새로 만들기"), { target: { value: "갭상승" } });
        // day 에 "갭상승"이 있지만 point 창의 중복 검사는 point 사전만 본다.
        expect(screen.getByText(/새 그룹으로 만들어 붙이기/)).toBeTruthy();
    });
});

describe("BulkGroupMenu — 계층 상속 행", () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(cleanup);

    // 테마 ▸ 갭상승 — 대상은 갭상승에만 직접 부착.
    const HIER: Group[] = [g("p", "테마", "day"), { ...g("c", "갭상승", "day"), parentId: "p" }];

    function openInherited(toggle: (t: unknown, id: string, on: boolean) => void = noop): void {
        renderWithProviders(
            <BulkGroupMenu
                anchor={{ x: 0, y: 0 }}
                targets={[{ stockCode: "005930", date: "2026-06-30" }]}
                scope="day"
                hasGroup={(_, id) => id === "c"}
                inheritedVia={(_, id) => (id === "p" ? "갭상승" : null)}
                toggle={toggle}
                label="테스트"
                onClose={noop}
            />,
            { groups: HIER },
        );
    }

    it("상속으로만 적용되는 그룹은 경유지가 표시되고 눌리지 않는다", () => {
        const toggle = vi.fn();
        openInherited(toggle);
        expect(screen.getByText(/하위 갭상승 경유/)).toBeTruthy();
        fireEvent.click(screen.getByText("테마"));
        expect(toggle).not.toHaveBeenCalled();
    });

    it("직접 부착 그룹은 여전히 토글된다", () => {
        const toggle = vi.fn();
        openInherited(toggle);
        fireEvent.click(screen.getByText("갭상승"));
        expect(toggle).toHaveBeenCalledWith(expect.anything(), "c", false);
    });
});
