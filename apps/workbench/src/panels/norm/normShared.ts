// 정규화 패널의 고정 슬롯 영속 모델 — 시선 1(focus 자동 교체) + 고정 N(라벨 우클릭, 시선이 바뀌어도 유지).

/** 고정 항목 — time 없으면 차트(일봉 패널), 있으면 타점(타점 패널). */
export interface NormPin {
    code: string;
    date: string; // YYYY-MM-DD
    time?: string; // HH:MM:SS
}

export const pinKey = (p: NormPin): string => `${p.code}|${p.date}${p.time ? `|${p.time}` : ""}`;

/** localStorage 파서 — 모양이 어긋난 항목은 통째로 버린다(부분 복원이 더 헷갈린다). */
export function parsePins(raw: unknown): NormPin[] | null {
    if (!Array.isArray(raw)) return null;
    const ok = raw.every(
        (p): p is NormPin =>
            typeof p === "object" && p !== null &&
            typeof (p as NormPin).code === "string" &&
            typeof (p as NormPin).date === "string" &&
            ((p as NormPin).time === undefined || typeof (p as NormPin).time === "string"),
    );
    return ok ? (raw as NormPin[]) : null;
}
