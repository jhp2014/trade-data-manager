// 첫 시선 날짜를 **데이터가 있는 날**로 맞춘다(2026-09-20).
//
// `focusSlice` 의 초기값은 `kstToday()` 인데, 그 날에 데이터가 있는지는 안 본다 — 주말·휴장일에 앱을
// 켜면 복기 쪽 패널이 전부 빈 채로 서고, 화면은 "조건을 넓히거나 w/s 로 날짜를 넘기세요" 라고
// **조건 탓을 한다**(진짜 이유는 "그 날은 장이 안 섰다"). 사용자가 그 거짓말을 먼저 알아챈 자리다.
//
// ## 한 번만, 그리고 사용자가 안 만졌을 때만
// 날짜 목록은 비동기라 스토어 초기값이 알 수가 없다. 그래서 목록이 도착한 **첫 순간에 한 번** 맞춘다.
// ⚠ 그 뒤로는 절대 안 건드린다 — 사용자가 일부러 빈 날로 간 것을 되돌리면 "내가 고른 날이 튕긴다"가
// 된다. 시선 날짜는 영속이 아니라 매 로드가 오늘부터 시작하므로, 이 1회 보정이면 충분하다.
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataDatesQuery } from "../api/queries.js";
import { useWorkbench } from "../store/workbench.js";

export function useSnapFocusDate(): void {
    const { data: dates } = useQuery(dataDatesQuery());
    const setDate = useWorkbench((s) => s.setDate);
    const done = useRef(false);

    useEffect(() => {
        if (done.current || !dates || dates.length === 0) return;
        done.current = true;
        const today = useWorkbench.getState().focus.date;
        if (dates.includes(today)) return; // 데이터가 있는 날이면 그대로 둔다
        // 오늘 **이하**의 마지막 거래일 — 미래로 튀지 않게(목록에 다음 주가 들어 있어도).
        const past = dates.filter((d) => d <= today);
        const snap = past.length > 0 ? past[past.length - 1]! : dates[dates.length - 1]!;
        setDate(snap, "snap");
    }, [dates, setDate]);
}
