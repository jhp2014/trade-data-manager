// 날짜·시간 레일 — 날짜와 시각도 **순서 있는 축**이라 같은 손짓으로 자른다(옛 필터 바의 레일과 같은 물건).
//
// 두 축의 척도가 다르다:
//   · 날짜 — **거래일 인덱스**로 편다. 달력 그대로 펴면 주말·휴장이 빈칸으로 자리를 먹고, 경계가
//     장이 없는 날에 서서 "그날부터"가 실제로는 다음 거래일부터가 된다. 인덱스면 경계가 늘 실재한다.
//   · 시간 — 08:00~20:00 을 선형으로, 5분 단위 스냅. 여기서는 실제 타점으로 스냅하지 않는다:
//     시각 조건은 "9시 반 이전"처럼 **절대 기준**으로 말하는 것이지 특정 타점 기준이 아니다.
//     대신 실제 타점 분포를 틱으로 깔아 어디가 두꺼운지 보이게 한다.
import { useMemo } from "react";
import { minutesOfDay, shortDate, timeOfMinutes } from "../datetime.js";
import type { DateRange, TimeRange } from "../stage.js";
import { Rail } from "./Rail.js";

/** 시간 레일의 도메인 — 프리마켓부터 시간외까지. 옛 필터 바와 같은 폭이라 손이 익은 척도다. */
const TIME_MIN = minutesOfDay("08:00");
const TIME_MAX = minutesOfDay("20:00");
const TIME_STEP = 5; // 분 — 이보다 잘게 자르는 조건은 손이 아니라 정밀 입력의 일

export function DateRail({ dates, ranges, marker, highlight, onType, onChange }: {
    /** 후보 거래일(오름차 정렬·중복 없음). 이 목록이 곧 척도다. */
    dates: readonly string[];
    ranges: readonly DateRange[];
    /** 현재 보고 있는 날짜. */
    marker: string | null;
    highlight?: boolean;
    onType: (x: number, y: number) => void;
    onChange: (ranges: DateRange[] | null) => void;
}): JSX.Element {
    const { fracOf, atFrac, fracs } = useMemo(() => {
        const idx = new Map(dates.map((d, i) => [d, dates.length <= 1 ? 0.5 : i / (dates.length - 1)]));
        return {
            fracOf: (d: string): number => idx.get(d) ?? nearestFracForMissing(d, dates),
            // 거래일이 균등 간격이라 반올림이 곧 최근접 스냅 — 경계는 늘 실재하는 거래일에 선다.
            atFrac: (f: number): string => dates[Math.max(0, Math.min(dates.length - 1, Math.round(f * (dates.length - 1))))] ?? "",
            fracs: [...idx.values()],
        };
    }, [dates]);

    return (
        <Rail<string>
            label="날짜"
            ranges={ranges.map((r) => ({ from: r.from, to: r.to }))}
            toFrac={fracOf}
            fromFrac={atFrac}
            fmt={shortDate}
            minLabel={shortDate(dates[0] ?? "")}
            maxLabel={shortDate(dates[dates.length - 1] ?? "")}
            // 거래일이 수백 개면 틱이 벽이 된다 — 척도가 이미 균등하니 표식이 주는 정보가 없다.
            ticks={dates.length <= 60 ? fracs : undefined}
            marker={marker ? { frac: fracOf(marker), label: shortDate(marker) } : null}
            highlight={highlight}
            disabledNote={dates.length === 0 ? "후보 날짜가 없습니다" : undefined}
            onType={onType}
            onChange={(next) => onChange(next.length > 0 ? next.map((r) => ({ from: r.from, to: r.to })) : null)}
        />
    );
}

export function TimeRail({ ranges, tickTimes, marker, highlight, onType, onChange }: {
    ranges: readonly TimeRange[];
    /** 실제 타점 시각들(HH:MM:SS) — 분포를 틱으로. */
    tickTimes: readonly string[];
    marker: string | null;
    highlight?: boolean;
    onType: (x: number, y: number) => void;
    onChange: (ranges: TimeRange[] | null) => void;
}): JSX.Element {
    const fromFrac = (f: number): string => {
        const min = TIME_MIN + f * (TIME_MAX - TIME_MIN);
        return timeOfMinutes(Math.round(min / TIME_STEP) * TIME_STEP);
    };
    const ticks = useMemo(() => [...new Set(tickTimes.map((t) => t.slice(0, 5)))].map(timeFrac), [tickTimes]);

    return (
        <Rail<string>
            label="시간"
            ranges={ranges.map((r) => ({ from: r.from, to: r.to }))}
            toFrac={timeFrac}
            fromFrac={fromFrac}
            fmt={(v) => v}
            minLabel={timeOfMinutes(TIME_MIN)}
            maxLabel={timeOfMinutes(TIME_MAX)}
            ticks={ticks}
            marker={marker ? { frac: timeFrac(marker), label: marker.slice(0, 5) } : null}
            highlight={highlight}
            onType={onType}
            onChange={(next) => onChange(next.length > 0 ? next.map((r) => ({ from: r.from, to: r.to })) : null)}
        />
    );
}

const clamp01 = (f: number): number => Math.max(0, Math.min(1, f));

/** HH:MM[:SS] → 시간 레일의 0..1. 도메인 밖(야간 등)은 끝에 붙는다. */
const timeFrac = (hm: string): number => clamp01((minutesOfDay(hm) - TIME_MIN) / (TIME_MAX - TIME_MIN));

/**
 * 목록에 없는 날짜(손으로 입력했거나 후보에서 빠진 날) — 가장 가까운 거래일 자리에 그린다.
 * 지어낸 좌표가 아니라 "그 언저리"라는 정직한 근사이고, 조건 자체는 손대지 않는다.
 */
function nearestFracForMissing(date: string, dates: readonly string[]): number {
    if (dates.length === 0) return 0.5;
    let i = 0;
    while (i < dates.length && dates[i]! < date) i++;
    return dates.length <= 1 ? 0.5 : Math.min(i, dates.length - 1) / (dates.length - 1);
}
