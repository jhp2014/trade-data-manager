// 선언 등록부 — 게시 주인(token)만 자기 선언을 거둘 수 있고, 매 커밋 게시해도 패널 본문은 다시 그려지지 않는다.
import { memo } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { PanelFrame } from "./PanelFrame.js";
import { usePanelHeader, useHeaderRegistry } from "./registry.js";
import { useHeaderLedger } from "./ledger.js";
import type { HeaderDecl } from "./spec.js";

afterEach(() => {
    cleanup();
    useHeaderRegistry.setState({ byPanel: {} });
    useHeaderLedger.setState({ layout: {} });
});

const decl = (v: string): HeaderDecl => ({ info: [{ id: "v", name: "값", text: () => v }], controls: [] });
const reg = () => useHeaderRegistry.getState();

describe("withdraw — 게시 주인만 거둔다", () => {
    it("다른 주인의 withdraw 는 아무것도 안 지운다", () => {
        const mine = {};
        reg().publish("chart-1", decl("a"), mine);
        reg().withdraw("chart-1", {});
        expect(reg().byPanel["chart-1"]?.decl.info[0].text()).toBe("a");
        reg().withdraw("chart-1", mine);
        expect(reg().byPanel["chart-1"]).toBeUndefined();
    });

    it("리마운트가 겹쳐도(새 것 게시 → 옛 것 정리) 새 선언이 남는다", () => {
        // memo — 부모가 다시 그려도 새 것이 다시 게시하지 않게(매 커밋 게시가 지워진 선언을 덮어 토큰 보호 없이도 통과해 버린다).
        const P = memo(function P({ v }: { v: string }): JSX.Element {
            usePanelHeader("chart-1", decl(v));
            return <div />;
        });
        // 같은 panelId 를 쓰는 두 인스턴스 — 새 것이 먼저 올라와 게시하고, 옛 것은 다음 커밋에 내려가며 정리한다.
        // (key 교체는 React 가 옛 것 정리를 먼저 돌아 겹침이 안 생긴다 — 토큰 보호가 없어도 통과해 버린다.)
        // 루트를 늘 조각(<>)으로 둬야 key 로 인스턴스가 이어진다(루트 모양이 바뀌면 전부 다시 마운트된다).
        const r = render(
            <>
                <P key="old" v="old" />
            </>,
        );
        r.rerender(
            <>
                <P key="old" v="old" />
                <P key="new" v="new" />
            </>,
        );
        expect(reg().byPanel["chart-1"]?.decl.info[0].text()).toBe("new");
        r.rerender(
            <>
                <P key="new" v="new" />
            </>,
        );
        expect(reg().byPanel["chart-1"]?.decl.info[0].text()).toBe("new");
        r.unmount();
        expect(reg().byPanel["chart-1"]).toBeUndefined();
    });
});

describe("게시는 본문을 다시 그리지 않는다", () => {
    it("게시·자리 변경으로 틀이 다시 그려져도 본문(children)은 마운트 때 한 번뿐", () => {
        let renders = 0;
        function Body(): JSX.Element {
            renders++;
            usePanelHeader("chart-1", decl("a"));
            return <div>본문</div>;
        }
        const { container } = render(
            <PanelFrame panelId="chart-1">
                <Body />
            </PanelFrame>,
        );
        // 첫 게시로 틀이 헤더 줄을 세운다 — 본문은 다시 안 그려진다.
        expect(container.querySelector('[data-header-line="line"]')).not.toBeNull();
        expect(renders).toBe(1);
        act(() => useHeaderLedger.setState({ layout: { chart: { info: { v: "bottom" } } } }));
        expect(container.querySelector('[data-header-line="bottom"]')).not.toBeNull();
        expect(renders).toBe(1);
    });
});
