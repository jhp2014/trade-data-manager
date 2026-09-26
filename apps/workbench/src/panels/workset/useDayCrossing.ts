// 날짜 경계 넘기(비동기부) — 목록 끝에서 w/s 가 날짜를 넘길 때의 상태기계.
// 날짜 산수는 `dayCrossing.ts`(순수)가, 재료 로딩을 기다리는 일만 여기가 한다.
//
// 규칙(decisions 「집합」): s = 다음 날짜의 **첫** 항목 · w = 이전 날짜의 **마지막** 항목 ·
// 조건 0건인 날은 자동 스킵(상한) · 날짜 칩 고정이면 멈춤 · 잘린 날을 지나면 경고 · 넘어가면 접힘 초기화.
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkbench } from "../../store/workbench.js";
import { MAX_SKIP_DAYS, MAX_SKIP_DAYS_HEAVY, nextDates } from "./dayCrossing.js";

export interface DayCrossingState {
    /** 지금 날짜를 넘는 중인가 — 화면이 "불러오는 중"을 말할 재료. */
    seeking: boolean;
    /** 이번 손짓에서 건너뛴 빈 날 수(0 이면 표시 안 함). */
    skipped: number;
    /** 멈춘 이유 — 상한 도달·고정·넘길 곳 없음. 사라지는 안내라 다음 손짓에 지워진다. */
    note: string | null;
}

export interface DayCrossing extends DayCrossingState {
    /** 경계에 닿았다 — 이 방향으로 날짜를 넘긴다(고정이면 안 넘고 안내만). */
    cross: (dir: 1 | -1) => void;
}

/**
 * @param active  지금 이 우주가 서 있나(하루) — 꺼지면 진행 중인 손짓을 **버린다**(안 그러면 종단으로
 *                갈아탄 뒤에도 `넘기는 중…` 이 남고, 돌아오는 순간 낡은 손짓이 시선을 끌어간다)
 * @param dates   거래일 목록(분봉 보유일, 오름차순)
 * @param ready   지금 날짜의 목록이 확정됐나(로딩 중이면 판정하지 않는다)
 * @param failed  이 날의 재료가 실패했나 — **빈 날이 아니다**(스킵 금지, 손짓을 버리고 멈춘다)
 * @param count   지금 날짜의 밟을 수 있는 항목 수 — 0 이면 빈 날(스킵 대상)
 * @param heavy   무거운 재료(존 순위·격자)를 쓰는 조건인가 — 스킵 상한이 줄어든다
 * @param pinned  날짜 고정 — 경계에서 멈춘다("이 날만 보겠다"는 선언)
 * @param onLand  착지 — 도착한 날짜에서 방향에 맞는 끝 항목으로 시선을 옮기는 일은 호출자가 안다
 */
export function useDayCrossing({ active, dates, ready, failed, count, heavy, pinned, truncated, onLand, origin = "workset-cross" }: {
    active: boolean;
    dates: readonly string[];
    ready: boolean;
    failed: boolean;
    count: number;
    heavy: boolean;
    pinned: boolean;
    truncated: boolean;
    onLand: (dir: 1 | -1) => void;
    /** setDate 출처 — 패널마다 제 이름(포커스 추종·스냅 로직이 출처를 본다). */
    origin?: string;
}): DayCrossing {
    const date = useWorkbench((s) => s.focus.date);
    const setDate = useWorkbench((s) => s.setDate);
    const [state, setState] = useState<DayCrossingState>({ seeking: false, skipped: 0, note: null });
    /**
     * 진행 중인 손짓 — 방향·**목표 날짜**·남은 스킵·지나온 잘린 날. null = 놀고 있음.
     * `to` 를 드는 이유: 착지 판정이 "항목이 섰다" 하나뿐이면, 넘기는 동안 사용자가 **다른 패널에서**
     * 날짜를 고른 순간 그 날의 평가가 끝나며 낡은 손짓이 시선을 첫 항목으로 끌어간다(리뷰가 잡은 자리).
     */
    const job = useRef<{ dir: 1 | -1; to: string; remaining: number; skipped: number; sawTruncated: boolean } | null>(null);

    const cross = useCallback((dir: 1 | -1) => {
        if (!active) return;
        if (pinned) {
            setState({ seeking: false, skipped: 0, note: "날짜 고정 — 경계에서 멈춥니다(칩의 📌 를 끄면 넘어갑니다)" });
            return;
        }
        const max = heavy ? MAX_SKIP_DAYS_HEAVY : MAX_SKIP_DAYS;
        const to = nextDates(dates, date, dir, 1)[0];
        if (to === undefined) {
            setState({ seeking: false, skipped: 0, note: dir > 0 ? "마지막 거래일입니다" : "첫 거래일입니다" });
            return;
        }
        // ⚠ 마지막 손짓만 유효 — 연타하면 job 이 덮인다(기존 in-flight 가드와 같은 수법).
        job.current = { dir, to, remaining: max, skipped: 0, sawTruncated: truncated };
        setState({ seeking: true, skipped: 0, note: null });
        setDate(to, origin);
    }, [active, pinned, heavy, dates, date, truncated, setDate, origin]);

    // 도착 판정 — 새 날짜의 목록이 **확정된 뒤에만** 본다(로딩 중의 0건은 "빈 날"이 아니다).
    useEffect(() => {
        const j = job.current;
        if (!active) {
            // 우주를 떠났다 — 손짓을 버리고 안내도 지운다(남겨 두면 돌아오는 순간 발화한다).
            if (j !== null) job.current = null;
            setState((v) => (v.seeking || v.note !== null ? { seeking: false, skipped: 0, note: null } : v));
            return;
        }
        if (!j) return;
        if (j.to !== date) {
            // 내가 보낸 날짜가 아니다 = 그 사이 **다른 손**이 날짜를 바꿨다. 손짓을 버린다(시선은 그 손의 것).
            job.current = null;
            setState({ seeking: false, skipped: 0, note: null });
            return;
        }
        if (failed) {
            // 재료 실패 — 0건이 "빈 날"의 증거가 아니다. 여기서 멈춘다(그 날 화면은 오류를 말한다).
            job.current = null;
            setState({ seeking: false, skipped: j.skipped, note: "재료를 못 읽어 날짜 넘기기를 멈췄습니다" });
            return;
        }
        if (!ready) return;
        if (count > 0) {
            job.current = null;
            setState({
                seeking: false,
                skipped: j.skipped,
                note: j.sawTruncated ? "지나온 날 중 상한에서 잘린 날이 있습니다 — 조건을 조이면 전부 보입니다" : null,
            });
            onLand(j.dir);
            return;
        }
        // 빈 날 — 상한까지 계속 넘긴다(빈 날마다 멈추면 손이 아프다).
        if (j.remaining <= 1) {
            job.current = null;
            setState({ seeking: false, skipped: j.skipped + 1, note: `${j.skipped + 1}일 건너뛰고 멈춤 — 걸린 항목이 없습니다` });
            return;
        }
        const to = nextDates(dates, date, j.dir, 1)[0];
        if (to === undefined) {
            job.current = null;
            setState({ seeking: false, skipped: j.skipped, note: j.dir > 0 ? "마지막 거래일입니다" : "첫 거래일입니다" });
            return;
        }
        job.current = { ...j, to, remaining: j.remaining - 1, skipped: j.skipped + 1, sawTruncated: j.sawTruncated || truncated };
        setState((v) => ({ ...v, seeking: true, skipped: j.skipped + 1 }));
        setDate(to, origin);
    }, [active, ready, failed, count, date, dates, truncated, setDate, onLand]);

    return { ...state, cross };
}
