// 가로 가격선 한 벌의 수명주기 — 걷고 다시 그리기. 일봉·분봉·가이드선이 같은 춤을 따로 추고 있었다.
//
// lightweight-charts 의 `createPriceLine` 은 핸들을 돌려주고 지울 때 그 핸들이 필요하다. 그래서 어느
// 소비자든 같은 세 가지를 한다: 핸들 배열을 ref 에 쥐고 · 바뀌면 전부 걷고 · 다시 만들어 담는다.
// 걷을 때 try/catch 가 필요한 것도 공통이다(차트가 먼저 정리되면 시리즈가 이미 죽어 있다).
//
// **무엇을 그릴지**는 소비자가 정한다(색·자리·제목). 분봉은 %축이라 가격을 %로 환산해 넣고, 일봉은
// 원가를 그대로 넣는다 — 그 환산이 각자의 도메인 지식이라 여기 안 들인다.
import { useEffect, useRef, type MutableRefObject } from "react";
import { LineStyle, type IPriceLine, type ISeriesApi } from "lightweight-charts";

/** 그릴 선 하나. `price` 는 **그 시리즈의 축 단위**다(분봉이면 %, 일봉이면 원). */
export interface PriceLineSpec {
    price: number;
    color: string;
    title: string;
    /** 기본 파선. 가이드선처럼 성격이 다른 선만 점선으로 바꾼다. */
    style?: LineStyle;
}

/**
 * 명세대로 가격선을 맞춘다. 명세가 **내용상** 바뀔 때만 다시 그린다 — 배열 참조가 매 렌더 새로 와도
 * 값이 같으면 차트를 안 건드린다(예전엔 `[lines]` 의존이라 같은 선을 지웠다 다시 그렸다).
 *
 * ⚠ 시리즈가 만들어진 **뒤에** 호출되어야 한다. 이 훅은 시리즈 생성을 기다리지 않고, 없으면 그냥
 * 넘어간다 — 부르는 컴포넌트가 시리즈 훅을 먼저 선언해 두는 것으로 그 순서를 지킨다(효과 실행 순서).
 */
export function usePriceLineSet(
    seriesRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>,
    specs: readonly PriceLineSpec[],
): void {
    const handles = useRef<IPriceLine[]>([]);
    const sig = specs.map((s) => `${s.price}|${s.color}|${s.title}|${s.style ?? ""}`).join(";");
    useEffect(() => {
        const series = seriesRef.current;
        if (!series) return;
        for (const h of handles.current) {
            try {
                series.removePriceLine(h);
            } catch {
                /* 차트가 먼저 정리됨 — 지울 대상이 이미 없다 */
            }
        }
        handles.current = specs.map((s) =>
            series.createPriceLine({
                price: s.price,
                color: s.color,
                lineWidth: 1,
                lineStyle: s.style ?? LineStyle.Dashed,
                axisLabelVisible: true,
                title: s.title,
            }),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sig]);
}
