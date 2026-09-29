import { useEffect, useRef, type MutableRefObject } from "react";
import { create } from "zustand";
import { persistedField } from "../store/persist.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";

// 행 순회(w/s) — **등록 지점은 여기 하나**(App 1회), 패널은 순회 함수만 얹는다(publish).
//
// 왜 패널이 직접 등록하지 않나: `resolveCommand` 는 scope 기계 없이 **등록 순 첫 매치**라, 패널마다
// 조건부로 같은 키를 등록하면 승자가 마운트·이벤트 순서에 매인다. 특히 패널 제거 전이(dock 이벤트로
// openPanelIds 가 갱신되는 커밋 ↔ React 언마운트 커밋)에서 **찰나의 중복 등록**이 원리적으로 남는다.
// 등록을 한 곳으로 모으면 그 상태가 구조적으로 불가능해지고, 승자는 순서가 아니라 아래 소유자 규칙이 정한다.
//
// ## 참여 = 판마다 셋 중 하나(2026-09-29) — 걷는 중 / 참여 / 빠짐
// 판의 컨트롤(rowNavControl — 순환 손잡이 하나)이 고르고, 지금 상태는 **탭 제목의 w/s 칩**이 말한다
// (채움 = 걷는 중, 옅은 글자 = 참여, 없음 = 빠짐 — WorkbenchShell PanelTab). 옛 머리글 배지(RowNavBadge)는
// "상태 표시라 접힘 뒤로 숨으면 안 된다"는 이유로 컨트롤 바 밖에 있었는데, 탭이 그 표시를 맡으면서 은퇴했다
// (탭은 배경 탭이어도 보인다 — 옛 배지는 탭 뒤 패널이면 안 보였다). 두 켜기(걷기·참여)로 가르지 않는 이유:
// "걷는 중인데 불참" 같은 모순 조합이 생긴다 — 상태는 셋이다. 빠진 판은 폴백·`q` 순환·w/s 어디에도 안 선다.
// 걷는 판을 빼면 다음 참여 판으로 넘어간다(주인은 늘 정확히 하나 — 참여 판이 없으면 w/s 가 조용히 죽는다).
//
// ## 소유자 = **명시 선택 하나**(2026-09-15)
// 옛 규칙은 "시트가 배치에 있으면 시트, 없으면 작업셋"이라는 존재 우선순위였다 — 후보가 둘일 땐 통했지만
// 후보가 다섯(시트·작업 대상·탐색 후보·테마[복기]·테마[장 마감])이 되는 순간 "지금 무엇을 걷고 싶은가"를
// 배치가 대신 정할 수 없다. 그래서 소유자는 **사람이 고르고**(판 컨트롤 / `q` 순환), 그 선택은 전역 영속이다.
// 자동(auto) 항목은 두지 않는다 — 명시 하나면 탭의 w/s 칩이 곧 진실이고, 규칙이 둘이면 "왜 저기가 걷지"가 다시 생긴다.
//
// 후보 판정 소스는 **프로바이더 존재**다(옛 `dock.openPanelIds` 아님): 얹혀 있다 = 그 패널이 마운트돼
// 제 순서를 내놓을 수 있다. 고른 주인이 없으면 위 순서대로 흘러간다(폴백) — 선택 자체는 안 지운다.
//
// ⚠ **배경 탭은 후보에서 안 빠진다.** dockview 기본 렌더러는 탭 뒤 패널의 element 를 떼기만 하고 React
//   트리는 살려 두므로(4.13.1 `onlyWhenVisible`), 탭 뒤 패널도 계속 publish 한다. 폴백이 실제로 도는 건
//   패널을 **닫았을 때**다. 명시 선택 모델에선 이게 옳다 — 고른 주인은 탭 뒤에 있어도 제 몫을 걷는다
//   (w/s 는 원래 차트를 보며 누른다). 탭 뒤에 있어도 탭 제목의 칩이 보인다.
//
// ⚠ `q` 는 **지금 걷는 쪽**(폴백 결과)을 기준으로 다음 후보를 고르고, 그 결과를 선택으로 굳힌다 —
//   폴백 중에 누르면 원래 골라 둔 주인이 덮인다. 의도다: 눈앞에서 걷는 것부터 옮겨야 순환이 예측된다.
//
// ⚠ 모듈 전역 단일 소유 — 후보 패널은 각 1개 전제(panelCatalog). 인스턴스가 둘이 되면 나중 것이 앞을 덮는다.

export type RowNavOwner = "daily-explore" | "label-explore" | "replay-board" | "theme-board";
type Step = (dir: 1 | -1) => void;

/** 후보 — **순환 순서이자 폴백 우선순위**. unit 은 도움말 문구("다음 …"), label 은 컨트롤 툴팁·순환 문구. */
export const ROW_NAV_OWNERS: readonly { owner: RowNavOwner; unit: string; label: string }[] = [
    { owner: "daily-explore", unit: "타점(일별 [탐색])", label: "일별 [탐색]" },
    { owner: "label-explore", unit: "타점(라벨 [탐색])", label: "라벨 [탐색]" },
    { owner: "replay-board", unit: "종목(테마 [복기])", label: "테마 [복기]" },
    { owner: "theme-board", unit: "종목(테마 [장 마감])", label: "테마 [장 마감]" },
];
const ORDER: readonly RowNavOwner[] = ROW_NAV_OWNERS.map((m) => m.owner);
const metaOf = (owner: RowNavOwner): { unit: string; label: string } =>
    ROW_NAV_OWNERS.find((m) => m.owner === owner) ?? ROW_NAV_OWNERS[0];

/** 보드 순회가 Focus 를 옮길 때 쓰는 출처 — 보드 제 id(selfOrigin)가 **아니어야** 그 종목의 카드가 승격·스크롤된다. */
export const ROW_NAV_ORIGIN = "row-nav";

const SELECTED = persistedField<RowNavOwner>(
    "wb.rowNavOwner",
    (o) => {
        // 옛 소유자 승계 — "탐색 후보"·"작업 대상"(2026-09-27 은퇴)·"시트"(2026-09-26 종단 은퇴)는 전부 탐색판으로.
        // 안 하면 파서가 거절해 말없이 기본값으로 떨어진다(고른 주인이 조용히 바뀌는 사고).
        const v = o === "point-probe" || o === "workset" || o === "rank-sheet" ? "daily-explore" : o;
        return ORDER.includes(v as RowNavOwner) ? (v as RowNavOwner) : null;
    },
    "daily-explore",
);

interface RowNavStore {
    providers: Partial<Record<RowNavOwner, Step>>;
    selected: RowNavOwner; // 사람이 고른 주인(영속). 지금 걷는 쪽은 effectiveOwner 가 정한다.
    out: readonly RowNavOwner[]; // 빠진 판(영속).
    publish: (owner: RowNavOwner, step: Step) => void;
    withdraw: (owner: RowNavOwner, step: Step) => void;
    select: (owner: RowNavOwner) => void;
    setOut: (out: readonly RowNavOwner[]) => void;
}

/** 빠진 판(영속) — 참여 목록이 아니라 **빠짐 목록**으로 적는다: 나중에 생긴 후보가 목록에 없다는 이유로 빠지지 않게(헤더 핀과 같은 이유). */
const OUT = persistedField<RowNavOwner[]>(
    "wb.rowNavOut",
    (v) => (Array.isArray(v) ? v.filter((o): o is RowNavOwner => ORDER.includes(o as RowNavOwner)) : null),
    [],
);

const useRowNav = create<RowNavStore>((set) => ({
    providers: {},
    selected: SELECTED.load(),
    out: OUT.load(),
    publish: (owner, step) => set((s) => ({ providers: { ...s.providers, [owner]: step } })),
    // 내가 얹은 그 함수일 때만 거둔다 — 리마운트가 겹칠 때(새 것 publish → 옛 것 cleanup) 새 프로바이더를 지우지 않게.
    withdraw: (owner, step) =>
        set((s) => {
            if (s.providers[owner] !== step) return s;
            const next = { ...s.providers };
            delete next[owner];
            return { providers: next };
        }),
    select: (owner) => set(() => ({ selected: SELECTED.save(owner) })),
    setOut: (out) => set(() => ({ out: OUT.save([...out]) })),
}));

/** 지금 순회 함수를 얹고 있고 빠지지 않은 후보들(순환 순서). */
const availableOf = (providers: Partial<Record<RowNavOwner, Step>>, out: readonly RowNavOwner[]): RowNavOwner[] =>
    ORDER.filter((o) => providers[o] && !out.includes(o));

/** 실제로 걷는 쪽 — 고른 주인이 지금 얹혀 있으면 그것, 아니면 우선순위 폴백. 아무도 없으면 선택 그대로(키가 조용히 죽는다). */
export function effectiveOwner(available: readonly RowNavOwner[], selected: RowNavOwner): RowNavOwner {
    if (available.includes(selected)) return selected;
    return ORDER.find((o) => available.includes(o)) ?? selected;
}

/** 순환(`q`) — 지금 얹혀 있는 후보들만 돈다. 후보가 없으면 제자리. */
export function nextOwner(available: readonly RowNavOwner[], current: RowNavOwner): RowNavOwner {
    const ring = ORDER.filter((o) => available.includes(o));
    if (ring.length === 0) return current;
    return ring[(ring.indexOf(current) + 1) % ring.length]; // 미포함(-1)이면 첫 후보
}

/** 지금 w/s 가 걷는 쪽(도움말 문구가 본다). */
export function useRowNavOwner(): RowNavOwner {
    return useRowNav((s) => effectiveOwner(availableOf(s.providers, s.out), s.selected));
}

/** 소유권을 이 패널로. */
export const selectRowNavOwner = (owner: RowNavOwner): void => useRowNav.getState().select(owner);

/** 한 판의 w/s 자리 — 걷는 중 / 참여 / 빠짐. */
export type RowNavRole = "walk" | "join" | "out";

/** 그 판의 자리(순수) — 빠짐이 먼저, 그다음 지금 걷는 쪽인가. */
export function roleOf(owner: RowNavOwner, available: readonly RowNavOwner[], selected: RowNavOwner, out: readonly RowNavOwner[]): RowNavRole {
    if (out.includes(owner)) return "out";
    return available.includes(owner) && effectiveOwner(available, selected) === owner ? "walk" : "join";
}

/** 판의 자리 구독 — 컨트롤 손잡이·탭 칩이 본다. `null` = 후보가 아닌 판(훅 규칙상 늘 부르므로) → null. */
export function useRowNavRole(owner: RowNavOwner | null): RowNavRole | null {
    return useRowNav((s) => (owner === null ? null : roleOf(owner, availableOf(s.providers, s.out), s.selected, s.out)));
}

/**
 * 자리 바꾸기 — 컨트롤의 손. 걷기 = 참여로 되돌리고 주인으로. 빠짐 = 걷던 판이면 **다음 참여 판**으로 넘긴다
 * (그 판이 마지막 참여 판이면 넘길 곳이 없어 w/s 가 조용히 죽는다). 참여 = 빠짐 목록에서만 뺀다.
 */
export function setRowNavRole(owner: RowNavOwner, role: RowNavRole): void {
    const st = useRowNav.getState();
    const available = availableOf(st.providers, st.out);
    const wasWalking = roleOf(owner, available, st.selected, st.out) === "walk";
    const rest = st.out.filter((o) => o !== owner);
    if (role === "out") {
        if (wasWalking) st.select(nextOwner(available, owner));
        st.setOut([...rest, owner]);
        return;
    }
    st.setOut(rest);
    // ⚠ 마지막 참여 판을 뺐다 되돌리면(참여) 선택이 그 판에 남아 있어 곧바로 "걷는 중"이 된다 — 참여 판이
    //   그것 하나라 주인도 그것뿐이다(주인은 참여 판이 있는 한 늘 정확히 하나). 의도다.
    if (role === "walk") st.select(owner);
}

/** 판 id → 그 판의 w/s 자리 이름(후보가 아니면 null) — 탭 칩이 쓴다. 후보 판은 각 1개라 id 바탕이 곧 이름이다. */
export const rowNavOwnerOfBase = (idBase: string | undefined): RowNavOwner | null =>
    idBase !== undefined && ORDER.includes(idBase as RowNavOwner) ? (idBase as RowNavOwner) : null;

/**
 * 순회 함수를 얹는다 — 돌려받은 ref 의 `current` 를 **매 렌더 최신 클로저로 갈아 끼우면** 된다
 * (등록 effect 는 deps `[owner]`, 차트 `useChartHotkeys` 의 `h.current` 규약과 같은 이유).
 * `owner: null` = 이 컴포넌트는 후보가 아니다(보드 공용 부품이 실시간 보드에 쓰일 때).
 *
 * ⚠ **패널 최상단에서 얹어라** — 로딩·오류 조기 반환보다 안쪽에서 얹으면 데이터가 바뀔 때마다 후보
 *   자격이 깜빡이고, 그 창에 누른 w/s 가 폴백을 타고 다른 패널로 새어 전역 Focus 를 끌고 간다.
 *
 * ⚠ 기존 `h.current` 들과 하나 다른 점: 이 ref 는 모듈 전역 스토어를 거쳐 **밖에서** 불린다.
 *   지금 이 트리엔 transition/Suspense 가 없어 버려지는 렌더가 안 생기지만, 시트·작업셋에
 *   `startTransition`/`useDeferredValue` 를 들이면 "커밋 안 된 렌더의 클로저로 w/s 가 걷는" 경로가 열린다.
 */
export function usePublishRowNav(owner: RowNavOwner | null): MutableRefObject<Step> {
    const ref = useRef<Step>(() => {});
    useEffect(() => {
        if (!owner) return;
        const step: Step = (dir) => ref.current(dir);
        const { publish, withdraw } = useRowNav.getState();
        publish(owner, step);
        return () => withdraw(owner, step);
    }, [owner]);
    return ref;
}

/** w/s · q 등록 — App 에서 1회. 소유자가 바뀌면 같은 id 로 다시 등록된다(Record 라 항상 정확히 한 벌). */
export function useRowNavHotkeys(): void {
    const owner = useRowNavOwner();
    // 참여 판이 하나도 없으면 effectiveOwner 가 빠진 선택을 그대로 돌려준다 — 도움말이 "다음 …(그 판)"이라고
    // 거짓말하지 않게 따로 잰다(탭 칩은 전부 사라진 상태).
    const none = useRowNav((s) => availableOf(s.providers, s.out).length === 0);
    useEffect(() => {
        // 소유자·프로바이더는 **누르는 순간** 읽는다 — 이 effect 가 도는 건 도움말 문구 때문이지
        // 디스패치의 정확성이 등록 시점 값에 매여선 안 된다(프리셋 전환 중 churn 대비).
        const current = (): { available: RowNavOwner[]; owner: RowNavOwner } => {
            const { providers, selected, out } = useRowNav.getState();
            const available = availableOf(providers, out);
            return { available, owner: effectiveOwner(available, selected) };
        };
        const step = (dir: 1 | -1): void => {
            const { available, owner: cur } = current();
            // 참여 판이 없으면 effectiveOwner 가 선택을 그대로 돌려준다 — 빠진 판일 수 있으니 참여 여부를 다시 잰다.
            if (available.includes(cur)) useRowNav.getState().providers[cur]?.(dir);
        };
        const cycle = (): void => {
            const { available, owner: cur } = current();
            useRowNav.getState().select(nextOwner(available, cur));
        };
        const { unit, label } = none ? { unit: "(참여 판 없음)", label: "참여 판 없음" } : metaOf(owner);
        const { register, unregister } = useKeymapDynamic.getState();
        register({ id: "nav.row.prev", title: `이전 ${unit}`, category: "탐색", keys: "w", run: () => step(-1) });
        register({ id: "nav.row.next", title: `다음 ${unit}`, category: "탐색", keys: "s", run: () => step(1) });
        register({ id: "nav.row.cycleOwner", title: `순회 대상 바꾸기 (지금: ${label})`, category: "탐색", keys: "q", run: cycle });
        return () => { unregister("nav.row.prev"); unregister("nav.row.next"); unregister("nav.row.cycleOwner"); };
    }, [owner, none]);
}
