import { IChartApi, ISeriesApi, LogicalRange, UTCTimestamp } from 'lightweight-charts';

export interface ChartRegistry {
    id: string;
    chart: IChartApi;
    series: ISeriesApi<"Candlestick" | "Line">;
    getCrosshairRate: (time: UTCTimestamp) => number | null;
}

class ChartSyncManager {
    private registries: ChartRegistry[] = [];
    private isSyncing = false;

    register(registry: ChartRegistry) {
        // 이미 등록된 ID가 있다면 중복 방지
        if (!this.registries.find(r => r.id === registry.id)) {
            this.registries.push(registry);
        }
    }

    unregister(id: string) {
        this.registries = this.registries.filter(r => r.id !== id);
    }

    syncRange(sourceId: string, range: LogicalRange | null) {
        if (this.isSyncing || !range) return;
        this.isSyncing = true;

        try {
            this.registries.forEach(reg => {
                if (reg.id !== sourceId) {
                    reg.chart.timeScale().setVisibleLogicalRange(range);
                }
            });
        } finally {
            this.isSyncing = false;
        }
    }

    syncCrosshair(sourceId: string | null, time: number | null, isLocked: boolean) {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            const chartTime = time as UTCTimestamp;

            this.registries.forEach(reg => {
                if (time === null) {
                    // 마우스가 차트 밖으로 나갔을 때 십자선 제거
                    reg.chart.clearCrosshairPosition();
                    return;
                }

                const isSource = reg.id === sourceId;

                const rate = reg.getCrosshairRate(chartTime);
                if (isLocked) {
                    if (rate !== null) {
                        reg.chart.setCrosshairPosition(rate, chartTime, reg.series);
                    }
                } else {
                    // 일반 모드: 타겟 차트가 아니면 세로선(시간축)만 표시
                    if (isSource) return;

                    if (rate !== null) {
                        reg.chart.setCrosshairPosition(rate, chartTime, reg.series);
                    }
                }
            });
        } finally {
            this.isSyncing = false;
        }
    }
}

// 싱글톤 인스턴스로 내보내기
export const chartSyncManager = new ChartSyncManager();