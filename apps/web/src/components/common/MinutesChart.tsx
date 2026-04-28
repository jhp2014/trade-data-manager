'use client';

import { useEffect, useMemo, useRef } from 'react';
import { createChart, ColorType, UTCTimestamp, IChartApi } from 'lightweight-charts';
import { FilledCandle } from '@/type/charts';
import { useTradeStore } from '@/store/useTradeStore';
import { chartSyncManager } from '@/lib/ChartSyncManager';
import styles from './MinutesChart.module.css';

export interface MinutesChartProps {
    stockCode: string;
    minutesCandles: FilledCandle[];
}

export default function MinutesChart({ stockCode, minutesCandles }: MinutesChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    // 빠른 검색을 위해 시간(tradeTime)을 Key로 하는 Map 생성 (O(1) 성능)
    const candleMap = useMemo(() => {
        const map = new Map<number, number>();
        minutesCandles.forEach(m => {
            // 등락률 Y축 위치 (closeRateNxt) 저장
            map.set(m.unixTimestamp, m.closeRateNxt);
        });
        return map;
    }, [minutesCandles]);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            autoSize: true, // 컨테이너 크기에 자동으로 맞춤
            layout: {
                background: { type: ColorType.Solid, color: '#ffffff' }, // --bg-panel 색상과 일치
                textColor: '#787b86', // --text-mute 색상과 일치
            },
            // 💡 1. 십자선(Crosshair) 라벨 및 툴팁의 시간 포맷 변경 (KST 기준)
            localization: {
                timeFormatter: (time: UTCTimestamp) => {
                    // time은 Unix timestamp (초 단위)이므로 밀리초로 변환 후,
                    // 한국 시간대(KST, UTC+9) 문자열로 포맷팅합니다.
                    const date = new Date(time * 1000);
                    return date.toLocaleTimeString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false // 24시간 형식 (예: 14:30)
                    });
                },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderVisible: false, // 하단 X축의 수평선을 제거합니다.
                tickMarkFormatter: (time: UTCTimestamp) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleTimeString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                },
            },
            rightPriceScale: {
                visible: true,
                borderVisible: false, // 축 경계선 숨기기
                alignLabels: true, // 라벨이 겹치지 않게 정렬
                autoScale: true, // 데이터 범위에 맞춰 축 자동 조절
            },
            // 💡 2. 거래대금을 위한 왼쪽 축 설정 (새로 추가!)
            leftPriceScale: {
                visible: true,          // 왼쪽 축 활성화
                borderVisible: false,   // 선 숨기기 (깔끔하게)
                alignLabels: true,
                autoScale: true,
            },
            grid: {
                vertLines: {
                    color: '#e6e7ea', // 아주 연한 회색 (rgba로 투명도 조절)
                    style: 2, // LineStyle.Dashed (0: Solid, 1: Dotted, 2: Dashed)

                },
                horzLines: {
                    color: '#e6e7ea',
                    style: 2,
                },
            },
            handleScroll: {
                mouseWheel: false, // 마우스 휠로 이동 가능 여부
                pressedMouseMove: true, // 클릭 드래그로 이동 가능 여부
            },
            handleScale: {
                mouseWheel: false,  // 마우스 휠을 통한 차트 확대/축소 비활성화
                pinch: true,        // 터치 패드 핀치 줌은 허용 (선택 사항)
            },
            crosshair: {
                mode: 1, // 0: Normal, 1: Magnet (캔들에 자석처럼 붙음)
            },
        });


        // 2. 캔들스틱 시리즈 추가
        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#ef5350',
            downColor: '#26a69a',
            borderVisible: false,
            wickUpColor: '#ef5350',
            wickDownColor: '#26a69a',
            priceFormat: { type: 'percent' } // 등락률이므로 퍼센트 형식 권장
        });

        // 💡 가격 차트의 영역 설정 (상단 70% 사용, 하단 30% 비움)
        candlestickSeries.priceScale().applyOptions({
            scaleMargins: {
                top: 0.1,    // 최상단 10% 여백
                bottom: 0.3, // 하단 30% 공간을 거래대금 위해 비워둠
            },
        });

        candlestickSeries.setData(minutesCandles.map(m => {
            return {
                time: m.unixTimestamp as UTCTimestamp,
                open: m.openRateNxt,
                high: m.highRateNxt,
                low: m.lowRateNxt,
                close: m.closeRateNxt
            }
        }));

        // 3. 거래대금(히스토그램) 시리즈 추가
        const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: 'left',
        });

        // 💡 거래대금 차트의 영역 설정 (하단 20%만 사용, 위쪽 80% 비움)
        // 이렇게 하면 가격 차트와 거래대금 차트 사이에 10%의 빈 공간(0.3 - 0.2)이 생겨 확연히 구분됩니다.
        volumeSeries.priceScale().applyOptions({
            scaleMargins: {
                top: 0.8,    // 상단 80%를 비워 가격 차트와 겹치지 않게 함
                bottom: 0,   // 바닥에 붙임
            },
        });

        volumeSeries.setData(minutesCandles.map(m => ({
            time: m.unixTimestamp as UTCTimestamp,
            value: m.tradingAmount,
            color: m.closeRateNxt >= m.openRateNxt ? 'rgba(239, 83, 80, 0.5)' : 'rgba(38, 166, 154, 0.5)',
        })));

        chart.timeScale().fitContent();
        chartRef.current = chart;

        // 매니저 등록
        chartSyncManager.register({
            id: stockCode,
            chart: chart,
            series: candlestickSeries,
            getCrosshairRate: (time) => candleMap.get(time) ?? null,
        });

        // 이벤트 구독: 시간축(줌/스크롤) 동기화
        chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            chartSyncManager.syncRange(stockCode, range);
        });

        // 이벤트 구독: 마우스 이동 동기화
        chart.subscribeCrosshairMove((params) => {
            // Zustand의 가장 최신 상태를 가져와서 전달
            const currentIsLocked = useTradeStore.getState().isCrosshairLocked;
            chartSyncManager.syncCrosshair(
                stockCode,
                params.time ? (params.time as number) : null,
                currentIsLocked
            );
        });

        return () => {
            chartSyncManager.unregister(stockCode);
            chart.remove();
        };
    }, [stockCode, minutesCandles, candleMap]);

    return (
        <div ref={chartContainerRef} className={styles.chartContainer} />
    );
}