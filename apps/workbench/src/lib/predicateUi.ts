// 술어 인스턴스를 다루는 비-JSX 헬퍼 — 표시 문구·옵션 의미·검증. 전부 **core 레지스트리에서 파생**한다.
//
// 왜 한 곳인가: 술어 파라미터는 숫자 인덱스로 저장된다(op:0 = "≥", market:1 = "UN"). 그 인덱스의 뜻은
// core 의 ParamSpec.options 에만 있어야 한다. 예전엔 워치리스트가 0/1 을 인코딩·디코딩 양쪽에서
// 손으로 알고 있어서, core 에서 옵션 순서를 뒤집으면 알람이 조용히 반대로 울릴 수 있었다.
import { boardPredicateDef, type BoardPredicateInstance } from "@trade-data-manager/market/domain";

/** 옵션 파라미터의 현재 라벨(예: price.op → "≥"). 호출부가 인덱스를 외우지 않게. */
export function optionLabel(kind: string, paramKey: string, params: Record<string, number>): string | undefined {
    const spec = boardPredicateDef(kind)?.params.find((s) => s.key === paramKey);
    return spec?.options?.[Number(params[paramKey] ?? spec.def ?? 0)];
}

/** 술어 한 개의 사람 문장 — core 의 정본 label(). 모르는 술어도 kind 대신 빈 문자열이 아니라 그 이름으로. */
export function predicateText(p: BoardPredicateInstance): string {
    const def = boardPredicateDef(p.kind);
    return def ? def.label(p.params, p.textParams) : p.kind;
}

/**
 * 저장 전 검증 — ParamSpec(min/max)·TextParamSpec(필수) 기준. 통과하면 null, 아니면 사용자 문구.
 * 술어별 if 문이 아니라 스펙 순회라, core 에 술어를 추가해도 검증이 자동으로 따라온다.
 */
export function validatePredicates(predicates: BoardPredicateInstance[]): string | null {
    if (predicates.length === 0) return "조건을 하나 이상 추가하세요";
    for (const p of predicates) {
        const def = boardPredicateDef(p.kind);
        if (!def) return `알 수 없는 조건: ${p.kind}`;
        for (const s of def.params) {
            const v = Number(p.params[s.key]);
            if (!Number.isFinite(v)) return `${def.title} — ${s.label} 값을 입력하세요`;
            if (s.min != null && v < s.min) return `${def.title} — ${s.label} 은 ${s.min} 이상이어야 합니다`;
            if (s.max != null && v > s.max) return `${def.title} — ${s.label} 은 ${s.max} 이하여야 합니다`;
        }
        for (const s of def.textParams ?? []) {
            if (!(p.textParams?.[s.key] ?? "").trim()) return `${def.title} — ${s.label} 을 지정하세요`;
        }
    }
    return null;
}
