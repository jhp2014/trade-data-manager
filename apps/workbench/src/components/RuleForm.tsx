// 알람 규칙 폼 골격 — 집중감시(watchlist)·유니버스 두 패널이 공유하는 조건(AND) 리스트 편집기.
// 서버가 진작 AlarmRule 하나·AlarmEngine 한 벌로 통합돼 있듯(스코프 차이는 code 유무뿐) 프론트
// 편집기도 여기 한 벌: 술어 줄(PredicateRow) 목록의 다섯 연산(종류 교체·숫자·문자·제거·추가)을
// 소유한다. 스코프별 차이(저장 방식·이름·쿨다운 표기·차트 캡처·문구)는 top 슬롯과 props 로 패널에
// 남는다 — 두 패널의 문구·배치는 서로 다른 게 맞고, 여기서 동일화하지 않는다.
import type { ReactNode } from "react";
import { defaultParams } from "@trade-data-manager/market/domain";
import type { AlarmPredicateInstance } from "../api/alerts.js";
import { AddPredicateBox, PredicateRow, type FormulaExtras } from "./PredicateFormula.js";

/** 새 술어 인스턴스 — 종류의 기본 파라미터로. 종류 교체·추가·초기값이 전부 이걸 쓴다. */
export const newPredicate = (kind: string): AlarmPredicateInstance => ({ kind, params: defaultParams(kind) });

/** 술어 리스트 함수형 업데이트 — 로컬 setState(watchlist)·draft 뮤테이터(유니버스) 양쪽에 그대로 물린다. */
export type PredicatesUpdater = (fn: (ps: AlarmPredicateInstance[]) => AlarmPredicateInstance[]) => void;

/** 행 단위 차트 캡처 — (몇 번째 조건, 어느 파라미터). PredicateRow 의 파라미터 캡처를 인덱스로 배선. */
export interface RowCapture {
    activeAt: { index: number; key: string } | null;
    onToggle: (index: number, key: string) => void;
}

/**
 * 술어 줄(AND) 리스트 — 보기·편집 공용. 편집 연산은 전부 onPredicates(리스트 교체)로 환원되므로
 * 소비자는 저장 위치(로컬 state vs 서버 draft)만 대면 된다. 마지막 하나는 제거 불가(폼 비우기 방지).
 */
export function PredicateList({ predicates, edit, kinds, onPredicates, capture, suggest, style, onClick, title }: {
    predicates: AlarmPredicateInstance[];
    edit: boolean;
    kinds: string[]; // 종류 순환 팔레트
    onPredicates?: PredicatesUpdater; // 편집 시 필수(보기 전용이면 생략)
    capture?: RowCapture;
    suggest?: FormulaExtras["suggest"];
    style?: React.CSSProperties;
    onClick?: () => void; // 보기 모드에서 리스트 클릭 = 편집 진입(유니버스)
    title?: string;
}): JSX.Element {
    const up: PredicatesUpdater = onPredicates ?? (() => undefined);
    return (
        <div onClick={onClick} title={title} style={style}>
            {predicates.map((p, i) => (
                <PredicateRow
                    key={i}
                    p={p}
                    edit={edit}
                    last={i === predicates.length - 1}
                    kinds={kinds}
                    onKind={(k) => up((ps) => ps.map((x, j) => (j !== i ? x : newPredicate(k))))}
                    onParam={(k, v) => up((ps) => ps.map((x, j) => (j !== i ? x : { ...x, params: { ...x.params, [k]: v } })))}
                    onText={(k, v) => up((ps) => ps.map((x, j) => (j !== i ? x : { ...x, textParams: { ...x.textParams, [k]: v } })))}
                    onRemove={predicates.length > 1 ? () => up((ps) => ps.filter((_, j) => j !== i)) : undefined}
                    capture={capture ? { activeKey: capture.activeAt?.index === i ? capture.activeAt.key : null, onToggle: (key) => capture.onToggle(i, key) } : undefined}
                    suggest={suggest}
                />
            ))}
        </div>
    );
}

/** 규칙 편집 폼 골격 — top(스코프별 머리: 저장/전달·이름·쿨다운) + 술어 리스트 + 추가 박스 + 오류 줄. */
export function RuleForm({ predicates, onPredicates, kinds, addKind, top, error, style, listStyle, capture, suggest }: {
    predicates: AlarmPredicateInstance[];
    onPredicates: PredicatesUpdater;
    kinds: string[];
    addKind: string; // ＋ 로 추가되는 기본 종류(watchlist=price, 유니버스=팔레트 첫 항목)
    top?: ReactNode;
    error?: string | null;
    style?: React.CSSProperties; // 폼 컨테이너(패널별 테두리·배경·간격)
    listStyle?: React.CSSProperties; // 술어 리스트 컨테이너
    capture?: RowCapture;
    suggest?: FormulaExtras["suggest"];
}): JSX.Element {
    return (
        <div style={style}>
            {top}
            <PredicateList predicates={predicates} edit kinds={kinds} onPredicates={onPredicates} capture={capture} suggest={suggest} style={listStyle} />
            <AddPredicateBox onAdd={() => onPredicates((ps) => [...ps, newPredicate(addKind)])} />
            {error && <div style={{ color: "var(--rise)" }}>{error}</div>}
        </div>
    );
}
