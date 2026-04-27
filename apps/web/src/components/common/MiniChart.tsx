'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

export default function MiniChart() {
    const chartContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // 1. 차트 생성 (다크 모드 배경)
        const chart = createChart(chartContainerRef.current, {
            autoSize: true, // 컨테이너 크기에 자동으로 맞춤
            layout: {
                background: { type: ColorType.Solid, color: '#1e222d' },
                textColor: '#d1d4dc',
            },
        });

        // 2. 캔들스틱 시리즈 추가
        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#ef5350',
            downColor: '#26a69a',
            borderVisible: false,
            wickUpColor: '#ef5350',
            wickDownColor: '#26a69a',
        });

        // 3. 테스트용 가짜 데이터 주입 (딱 3개)
        candlestickSeries.setData([
            { time: '2024-05-20', open: 100, high: 120, low: 90, close: 110 },
            { time: '2024-05-21', open: 110, high: 130, low: 100, close: 105 },
            { time: '2024-05-22', open: 105, high: 150, low: 100, close: 140 },
        ]);

        chart.timeScale().fitContent();

        // 4. 클린업 (메모리 누수 방지)
        return () => {
            chart.remove();
        };
    }, []);

    return (
        <div ref={chartContainerRef} />
    );
}