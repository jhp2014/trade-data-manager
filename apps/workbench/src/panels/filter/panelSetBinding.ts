// 패널별 집합 **고정(핀)** 의 순수 규칙 — 저장물 파싱 · 어느 우주로 풀리나 · 어떤 조건을 쓰나.
//
// ## 왜 고정이 돌아오나(2026-08-21 "연동 하나뿐" 의 부분 반전)
// 그때의 근거는 "집합을 고르는 자리가 두 곳이면 어느 쪽이 진짜냐가 생긴다"였고 그건 지금도 옳다.
// 바뀐 것은 **우주가 둘이 됐다**는 사실이다: 전역 포인터 하나만 있으면 "종단 시트 ∥ 오늘 후보"를
// 나란히 볼 수 없다(포인터는 우주를 못 넘는다 — 단계 ② 불변식 ①). 그래서 되돌리는 것은 최소한이다:
//   · **고르는 손은 안 늘린다** — 핀은 "지금 보는 것을 이 패널에 묶는다"의 1비트고, 집합을 고르는
//     자리는 여전히 집합 편성/작업 대상 하나다.
//   · 저장은 `panelUi[panelId].setPin`(additive) — 옛 `wb.setBinding.*` 는 **여전히 안 읽는다**
//     (죽은 개념의 유령 부활 금지 · useSetBinding 머리 주석).
import type { SavedSet } from "../../store/savedSetsSlice.js";
import type { Assembly } from "../../store/assembliesSlice.js";
import { isPersistableSetRef, parseSetRef, type SetRef } from "../../lib/setRef.js";
import type { FilterStage } from "./stage.js";
import type { Universe } from "./universe.js";

/**
 * 저장된 핀 읽기 — `panelUi` 는 무검증 JSON 가방이라 읽는 자리가 문지기다.
 * null = 연동(전역 포인터를 따른다). **지워진 집합을 가리켜도 그대로 둔다** — 깨진 참조는
 * 빈 집합 + 라벨로 화면이 받는 것이 규칙이고, 조용한 연동 폴백은 "다른 집합을 보여주는" 실패다.
 */
export function parsePanelBinding(raw: unknown): SetRef | null {
    if (raw === null || raw === undefined) return null;
    const ref = parseSetRef(raw);
    // 세션 참조(항목 목록)는 정의가 세션 밖에 없어 저장되면 즉시 깨진다 — 파서가 이미 안 내놓지만
    // 한 번 더 막는다(저장 경로와 읽기 경로가 같은 규칙을 지나야 한다).
    return ref !== null && isPersistableSetRef(ref) ? ref : null;
}

/** 이 참조를 핀으로 저장해도 되나 — 세션 3종은 못 한다(위 이유). */
export const canPin = (ref: SetRef | null): boolean => ref !== null && isPersistableSetRef(ref);

/**
 * 이 바인딩이 **어느 우주로 풀리나**. 저장 집합·조립은 자기 우주를 들고 다니고(단계 ②),
 * 연동·전체·최종 생존은 **작업 깔때기의 우주**다(그것이 지금 편집 중인 집합의 타입이므로).
 *
 * 그래서 "최종 생존"에 고정한 패널은 작업 우주를 바꾸면 **같이 갈아탄다** — 의도다:
 * 그 참조의 뜻이 "작업 깔때기가 지금 내는 것"이라 우주를 고정하면 가리키는 대상과 어긋난다.
 * 우주째 고정하고 싶으면 **이름 붙은 집합**(저장 집합)에 고정하는 것이 그 손짓이다.
 */
export function targetUniverseOf(
    ref: SetRef | null,
    savedSets: readonly SavedSet[],
    assemblies: readonly Assembly[],
    workingUniverse: Universe,
): Universe {
    if (ref === null) return workingUniverse;
    switch (ref.kind) {
        case "saved":
            return savedSets.find((s) => s.id === ref.setId)?.universe ?? workingUniverse;
        case "assembly": {
            // 조립의 부품은 한 우주다(불변식 ①) — 첫 부품이 대표한다. 빈 조립은 작업 우주.
            const a = assemblies.find((x) => x.id === ref.id);
            const first = a?.members.find((m) => savedSets.some((s) => s.id === m.setId));
            return savedSets.find((s) => s.id === first?.setId)?.universe ?? workingUniverse;
        }
        default:
            return workingUniverse;
    }
}

/**
 * 하루 우주에서 평가할 **조건 한 벌** — 이 우주의 집합은 "조건 + 날짜"가 곧 내용이라
 * 리졸버(종단 전용)를 안 거치고 평가기(useCellSet)로 간다.
 *
 * `null` = 이 우주에서 풀 방법이 없는 바인딩(화면이 이유를 말해야 한다):
 *  · 조립 — 부품마다 하루 평가가 한 벌씩 붙어 비용이 부품 수만큼 는다. 값이 분명해지면 그때 연다.
 *  · 전체(universe) — 하루 우주의 "전체"는 그날 전 셀 ≈19만이다("조건 없음 = 안 보여줌" 규칙).
 *  · orphan·지워진 집합 — 가리키는 것이 없다.
 *
 * **최종 생존은 연동과 같다** — 그 참조의 뜻이 "작업 깔때기가 지금 내는 것"이고, 하루 우주에서 그건
 * 곧 작업 조건의 평가다. 그래서 "지금 보는 것을 고정" 이 포인터 없이도 뜻을 갖는다.
 */
export function dayStagesOf(
    ref: SetRef | null,
    savedSets: readonly SavedSet[],
    workingStages: readonly FilterStage[],
): readonly FilterStage[] | null {
    if (ref === null || ref.kind === "survivors") return workingStages;
    if (ref.kind === "saved") {
        const s = savedSets.find((x) => x.id === ref.setId);
        return s ? s.stages : null;
    }
    return null;
}

/** 하루 우주에서 이 바인딩을 못 푸는 이유 한 줄(풀 수 있으면 null) — 화면이 그대로 띄운다. */
export function dayUnsupportedReason(ref: SetRef | null, savedSets: readonly SavedSet[]): string | null {
    if (dayStagesOf(ref, savedSets, []) !== null) return null;
    if (ref?.kind === "assembly") return "조립은 하루 우주에서 아직 못 풉니다(부품마다 하루 평가가 붙습니다)";
    if (ref?.kind === "saved") return "(지워진 집합)";
    return "하루 우주에는 조건이 있어야 합니다 — 집합 편성에서 고르세요";
}
