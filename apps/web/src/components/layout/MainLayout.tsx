'use client';

import { motion } from 'framer-motion';
import { useTradeStore } from '@/store/useTradeStore';
import { ReactNode } from 'react';
import styles from './MainLayout.module.css';

interface MainLayoutProps {
    slide1: ReactNode; // 검색 화면
    slide2: ReactNode; // 분석 워크스페이스
}

export default function MainLayout({ slide1, slide2 }: MainLayoutProps) {
    const step = useTradeStore((state) => state.step);

    return (
        <div className={styles.viewport}>
            <motion.div
                className={styles.track}
                animate={{ x: step === 0 ? '0%' : '-50%' }}
                transition={{
                    type: 'spring',
                    stiffness: 260,
                    damping: 25,
                    restDelta: 0.001
                }}
            >
                <section className={styles.slide}>
                    {slide1}
                </section>

                <section className={styles.slide}>
                    {slide2}
                </section>
            </motion.div>
        </div>
    );
}