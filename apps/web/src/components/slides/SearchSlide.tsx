'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Database, TableProperties } from 'lucide-react';
import styles from './SearchSlide.module.css';
import BasicSearchMode from './search/BasicSearchMode';
import ProSearchMode from './search/ProSearchMode';

export default function SearchSlide() {
    const searchParams = useSearchParams();
    const initialMode = searchParams.get('mode') === 'pro';
    const [isProMode, setIsProMode] = useState(initialMode);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>Trading Strategy</div>
                <div className={styles.toggleWrapper}>
                    <button
                        className={styles.toggleBtn}
                        data-active={!isProMode}
                        onClick={() => setIsProMode(false)}
                    >
                        <TableProperties size={16} /> Basic
                    </button>
                    <button
                        className={styles.toggleBtn}
                        data-active={isProMode}
                        onClick={() => setIsProMode(true)}
                    >
                        <Database size={16} /> Pro
                    </button>
                </div>
            </header>
            <div className={styles.content}>
                {!isProMode ? <BasicSearchMode /> : <ProSearchMode />}
            </div>
        </div>
    );
}