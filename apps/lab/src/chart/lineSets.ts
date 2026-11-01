// 임시 선 ∪ 저장 선 — 같은 선은 하나로 합치고 종류(임시만·저장만·둘 다)를 붙인다. 일봉·분봉 각각(순수 함수).
// 임시 일봉 선 = 경로의 선(DailyLine — 토큰의 손잡이), 임시 분봉 선 = 차트 패널의 잠깐 선(토큰에 없다).
// 저장 선 = lab 저장소(LabChartLine — 주인은 차트 날짜, anchorTime 이 있으면 분봉).
import type { LabChartLine } from "../market/types.js";
import { lineRef, type DailyLine, type LineField } from "../lib/stateToken.js";
import type { LineKind } from "./priceLevels.js";

/** 분봉 선의 좌표 — 시장은 통합 고정(분봉 KRX 는 NXT 단독 시간에 없다). */
export interface MinuteLineCoord {
    date: string;
    /** HH:MM:SS */
    time: string;
    field: LineField;
}

export const minuteRef = (m: MinuteLineCoord): string => `${m.date} ${m.time.slice(0, 5)} ${m.field}`;

export const fromLabDaily = (l: LabChartLine): DailyLine => ({ date: l.anchorDate, field: l.field, venue: l.market });
export const toLabDaily = (l: DailyLine, chartDate: string): LabChartLine => ({ chartDate, anchorDate: l.date, anchorTime: null, field: l.field, market: l.venue });
export const fromLabMinute = (l: LabChartLine): MinuteLineCoord => ({ date: l.anchorDate, time: l.anchorTime ?? "", field: l.field });
export const toLabMinute = (m: MinuteLineCoord, chartDate: string): LabChartLine => ({ chartDate, anchorDate: m.date, anchorTime: m.time, field: m.field, market: "un" });

/** 두 목록을 ref 로 합친다 — 임시 쪽 순서 먼저, 저장만 된 것은 뒤에. */
function merge<T>(temp: readonly T[], saved: readonly T[], ref: (x: T) => string): { item: T; kind: LineKind }[] {
    const savedRefs = new Set(saved.map(ref));
    const tempRefs = new Set(temp.map(ref));
    return [
        ...temp.map((item) => ({ item, kind: (savedRefs.has(ref(item)) ? "both" : "temp") as LineKind })),
        ...saved.filter((s) => !tempRefs.has(ref(s))).map((item) => ({ item, kind: "saved" as LineKind })),
    ];
}

/** 일봉: 경로의 선 ∪ 그 차트의 저장 일봉 선. */
export function mergeDaily(temp: readonly DailyLine[], saved: readonly LabChartLine[]): { item: DailyLine; kind: LineKind }[] {
    return merge(temp, saved.filter((l) => l.anchorTime === null).map(fromLabDaily), lineRef);
}

/** 분봉: 잠깐 선 ∪ 그 차트의 저장 분봉 선. */
export function mergeMinute(temp: readonly MinuteLineCoord[], saved: readonly LabChartLine[]): { item: MinuteLineCoord; kind: LineKind }[] {
    return merge(temp, saved.filter((l) => l.anchorTime !== null).map(fromLabMinute), minuteRef);
}

/** 칩 점 두 칸 — 왼쪽 = 토큰(임시) · 오른쪽 = 저장. */
export type ChipChannel = "temp" | "saved";
/** 점 클릭 → 할 일 — 누른 채널만 켜고 끈다. 일봉·분봉이 같은 표를 쓴다. */
export type ChipAct = "addTemp" | "dropTemp" | "save" | "unsave";
export function chipToggle(kind: LineKind, channel: ChipChannel): ChipAct {
    if (channel === "temp") return kind === "saved" ? "addTemp" : "dropTemp";
    return kind === "temp" ? "save" : "unsave";
}
