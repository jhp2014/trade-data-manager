import { LineStyle, type ChartOptions, type DeepPartial } from "lightweight-charts";

/**
 * 세 차트(분봉·일봉·테마오버레이)가 공유하는 createChart 기본 옵션.
 *
 * 여기 담는 것은 차트 종류와 무관하게 동일한 "외형/조작" 설정이다:
 *  - layout : 투명 배경·기본 글자색·pane 구분선
 *  - grid   : 점선 그리드 색
 *  - handleScroll / handleScale : 마우스·터치 스크롤/줌 동작
 *
 * 차트별로 달라지는 부분(가격축 마진·시간축 포매터·크로스헤어·로컬라이제이션)은
 * 각 차트의 makeOptions에서 이 베이스를 펼친 뒤(`...baseChartOptions()`) 덮어쓴다.
 * 베이스와 키가 겹치지 않으므로 얕은 스프레드로 충분하다.
 */
export function baseChartOptions(): DeepPartial<ChartOptions> {
    return {
        layout: {
            background: { color: "transparent" },
            textColor: "#6b7280",
            fontSize: 11,
            panes: {
                separatorColor: "rgba(0,0,0,0.12)",
                separatorHoverColor: "rgba(0,0,0,0.2)",
                enableResize: true,
            },
        },
        grid: {
            vertLines: { color: "rgba(0,0,0,0.04)", style: LineStyle.Dotted },
            horzLines: { color: "rgba(0,0,0,0.07)", style: LineStyle.Dotted },
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    };
}
