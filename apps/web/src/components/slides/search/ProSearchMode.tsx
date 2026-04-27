'use client';

import { useState } from 'react';
import styles from './ProSearchMode.module.css';

// TODO: 추후 DB 연동
const SERVER_QUERIES = [
    { id: 'q_momentum_top', name: '당일 거래대금 상위 20선' },
    { id: 'q_foreign_buy', name: '외인 연속 순매수 테마' },
    { id: 'q_ma20_breakout', name: '20일선 돌파 주도주' },
];

export default function ProSearchMode() {
    const [activeQueryId, setActiveQueryId] = useState(SERVER_QUERIES[0].id);

    return (
        <div className={styles.container}>
            {/* 좌측 사이드바 */}
            <aside className={styles.sidebar}>
                {SERVER_QUERIES.map((query) => (
                    <div
                        key={query.id}
                        className={styles.queryItem}
                        data-active={activeQueryId === query.id}
                        onClick={() => setActiveQueryId(query.id)}
                    >
                        {query.name}
                    </div>
                ))}
            </aside>

            {/* 우측 결과 테이블 */}
            <main className={styles.mainArea}>
                <div className={styles.tableHeader}>
                    <div className={styles.tableTitle}>
                        Query Result: {SERVER_QUERIES.find(q => q.id === activeQueryId)?.name}
                    </div>
                </div>

                <table className={styles.resultTable}>
                    <thead>
                        <tr>
                            <th>종목코드</th>
                            <th>종목명</th>
                            <th>등락률</th>
                            <th>거래대금(억)</th>
                            <th>테마 편입</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>005930</td><td>삼성전자</td>
                            <td style={{ color: 'var(--color-up)' }}>+2.45%</td>
                            <td>15,200</td><td>반도체 HBM</td>
                        </tr>
                        <tr>
                            <td>000660</td><td>SK하이닉스</td>
                            <td style={{ color: 'var(--color-up)' }}>+4.12%</td>
                            <td>8,500</td><td>반도체 HBM</td>
                        </tr>
                    </tbody>
                </table>
            </main>
        </div>
    );
}