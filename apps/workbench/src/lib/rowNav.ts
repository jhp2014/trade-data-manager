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
// ## 소유자 = **명시 선택 하나**(2026-09-15)
// 옛 규칙은 "시트가 배치에 있으면 시트, 없으면 작업셋"이라는 존재 우선순위였다 — 후보가 둘일 땐 통했지만
// 후보가 다섯(시트·작업 대상·탐색 후보·테마[복기]·테마[장 마감])이 되는 순간 "지금 무엇을 걷고 싶은가"를
// 배치가 대신 정할 수 없다. 그래서 소유자는 **사람이 고르고**(배지 클릭 / `q` 순환), 그 선택은 전역 영속이다.
// 자동(auto) 항목은 두지 않는다 — 명시 하나면 화면의 배지가 곧 진실이고, 규칙이 둘이면 "왜 저기가 걷지"가 다시 생긴다.
//
// 후보 판정 소스는 **프로바이더 존재**다(옛 `dock.openPanelIds` 아님): 얹혀 있다 = 그 패널이 마운트돼
// 제 순서를 내놓을 수 있다. 고른 주인이 없으면 위 순서대로 흘러간다(폴백) — 선택 자체는 안 지운다.
//
// ⚠ **배경 탭은 후보에서 안 빠진다.** dockview 기본 렌더러는 탭 뒤 패널의 element 를 떼기만 하고 React
//   트리는 살려 두므로(4.13.1 `onlyWhenVisible`), 탭 뒤 패널도 계속 publish 한다. 폴백이 실제로 도는 건
//   패널을 **닫았을 때**다. 명시 선택 모델에선 이게 옳다 — 고른 주인은 탭 뒤에 있어도 제 몫을 걷는다
//   (w/s 는 원래 차트를 보며 누른다). 대신 그때는 배지가 안 보이니, 지금 누가 걷는지는 단축키 도움말의
//   "다음 …" 문구가 말한다.
//
// ⚠ `q` 는 **지금 걷는 쪽**(폴백 결과)을 기준으로 다음 후보를 고르고, 그 결과를 선택으로 굳힌다 —
//   폴백 중에 누르면 원래 골라 둔 주인이 덮인다. 의도다: 눈앞에서 걷는 것부터 옮겨야 순환이 예측된다.
//
// ⚠ 모듈 전역 단일 소유 — 후보 패널은 각 1개 전제(panelCatalog). 인스턴스가 둘이 되면 나중 것이 앞을 덮는다.

export type RowNavOwner = "rank-sheet" | "workset" | "replay-board" | "theme-board";
type Step = (dir: 1 | -1) => void;

/** 후보 — **순환 순서이자 폴백 우선순위**. unit 은 도움말 문구("다음 …"), label 은 배지 툴팁·순환 문구. */
export const ROW_NAV_OWNERS: readonly { owner: RowNavOwner; unit: string; label: string }[] = [
    { owner: "rank-sheet", unit: "행(시트)", label: "시트" },
    { owner: "workset", unit: "타점(작업 대상)", label: "작업 대상" },
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
        // 옛 "탐색 후보"는 작업 대상에 **흡수**됐다(2026-09-18 단계 ③) — 그 값을 들고 있던 사용자를
        // 승계한다. 안 하면 파서가 거절해 말없이 "시트"로 떨어진다(고른 주인이 조용히 바뀌는 사고).
        const v = o === "point-probe" ? "workset" : o;
        return ORDER.includes(v as RowNavOwner) ? (v as RowNavOwner) : null;
    },
    "rank-sheet",
);

interface RowNavStore {
    providers: Partial<Record<RowNavOwner, Step>>;
    selected: RowNavOwner; // 사람이 고른 주인(영속). 지금 걷는 쪽은 effectiveOwner 가 정한다.
    publish: (owner: RowNavOwner, step: Step) => void;
    withdraw: (owner: RowNavOwner, step: Step) => void;
    select: (owner: RowNavOwner) => void;
}

const useRowNav = create<RowNavStore>((set) => ({
    providers: {},
    selected: SELECTED.load(),
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
}));

/** 지금 순회 함수를 얹고 있는 후보들(순환 순서). */
const availableOf = (providers: Partial<Record<RowNavOwner, Step>>): RowNavOwner[] => ORDER.filter((o) => providers[o]);

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

/** 지금 w/s 가 걷는 쪽(배지·도움말 문구가 본다). */
export function useRowNavOwner(): RowNavOwner {
    return useRowNav((s) => effectiveOwner(availableOf(s.providers), s.selected));
}

/** 소유권을 이 패널로 — 배지 클릭의 손. */
export const selectRowNavOwner = (owner: RowNavOwner): void => useRowNav.getState().select(owner);

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
    useEffect(() => {
        // 소유자·프로바이더는 **누르는 순간** 읽는다 — 이 effect 가 도는 건 도움말 문구 때문이지
        // 디스패치의 정확성이 등록 시점 값에 매여선 안 된다(프리셋 전환 중 churn 대비).
        const current = (): { available: RowNavOwner[]; owner: RowNavOwner } => {
            const { providers, selected } = useRowNav.getState();
            const available = availableOf(providers);
            return { available, owner: effectiveOwner(available, selected) };
        };
        const step = (dir: 1 | -1): void => {
            const { owner: cur } = current();
            useRowNav.getState().providers[cur]?.(dir);
        };
        const cycle = (): void => {
            const { available, owner: cur } = current();
            useRowNav.getState().select(nextOwner(available, cur));
        };
        const { unit, label } = metaOf(owner);
        const { register, unregister } = useKeymapDynamic.getState();
        register({ id: "nav.row.prev", title: `이전 ${unit}`, category: "탐색", keys: "w", run: () => step(-1) });
        register({ id: "nav.row.next", title: `다음 ${unit}`, category: "탐색", keys: "s", run: () => step(1) });
        register({ id: "nav.row.cycleOwner", title: `순회 대상 바꾸기 (지금: ${label})`, category: "탐색", keys: "q", run: cycle });
        return () => { unregister("nav.row.prev"); unregister("nav.row.next"); unregister("nav.row.cycleOwner"); };
    }, [owner]);
}
