'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchAllThemesChartDataAction } from '@/actions/chartActions';
import styles from './StockChartList.module.css';
import MiniChart from '@/components/common/MiniChart';

export default function StockChartList() {
    const searchParams = useSearchParams();

    const date = searchParams.get('date');
    const themeId = searchParams.get('themeId');

    const { data: allData, isLoading } = useQuery({
        queryKey: ['chartDataByDate', date],
        queryFn: () => fetchAllThemesChartDataAction(date!),
        enabled: !!date,
    });

    if (isLoading) return <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>데이터 로딩 중...</div>;
    if (!allData || !themeId) return <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>선택된 데이터가 없습니다.</div>;

    const stocks = allData[themeId] || [];

    return (
        <div className={styles.container}>
            {/* styles.grid 였던 부분을 styles.listContainer 로 변경했습니다 */}
            <div className={styles.listContainer}>
                {stocks.map((stock) => (
                    <div key={stock.stockCode} className={styles.stockCard}>
                        {/* 종목 정보 헤더 */}
                        <div className={styles.cardHeader}>
                            <div>
                                <span className={styles.stockName}>{stock.stockName}</span>
                                <span className={styles.stockCode}>{stock.stockCode}</span>
                            </div>
                            <div className={styles.amount}>
                                {stock.dailyInfo.tradingAmountKrx}억
                            </div>
                        </div>

                        {/* 차트 영역 */}
                        <div className={styles.chartArea}>
                            {stock.minuteCandles && stock.minuteCandles.length > 0 ? (
                                <MiniChart />
                                /* 아직은 가짜 데이터가 들어간 MiniChart 입니다 */
                            ) : (
                                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    No chart data
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}