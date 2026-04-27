'use client';

import { useState } from 'react';
import { useTradeStore } from '@/store/useTradeStore';
import { useRouter, usePathname } from 'next/navigation';
import { Play } from 'lucide-react';
import styles from './BasicSearchMode.module.css';

// TODO: 추후 DB 연동
const AVAILABLE_DATES = ['2024-05-20', '2024-05-17', '2024-05-16'];
const THEMES_BY_DATE: Record<string, { id: string; name: string }[]> = {
    '2024-05-20': [{ id: '101', name: '반도체 HBM' }, { id: '102', name: '전력설비' }],
    '2024-05-17': [{ id: '103', name: '화장품' }, { id: '101', name: '반도체 HBM' }],
    '2024-05-16': [{ id: '104', name: '2차전지 전고체' }],
};

export default function BasicSearchMode() {
    const setStep = useTradeStore((state) => state.setStep);
    const router = useRouter();
    const pathname = usePathname();

    const [selectedDate, setSelectedDate] = useState(AVAILABLE_DATES[0]);
    const availableThemes = THEMES_BY_DATE[selectedDate] || [];
    const [selectedThemeId, setSelectedThemeId] = useState(availableThemes[0]?.id || '');

    const handleDateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDate = e.target.value;
        setSelectedDate(newDate);
        const newThemes = THEMES_BY_DATE[newDate] || [];
        setSelectedThemeId(newThemes.length > 0 ? newThemes[0].id : '');
    };

    const handleExecute = () => {
        if (!selectedDate || !selectedThemeId) return;
        const params = new URLSearchParams();
        params.set('mode', 'basic');
        params.set('date', selectedDate);
        params.set('themeId', selectedThemeId);

        router.push(`${pathname}?${params.toString()}`);
        setStep(1); // Slide #2 로 이동
    };

    return (
        <div className={styles.container}>
            <div className={styles.formWrapper}>
                <div className={styles.selectGroup}>
                    <label className={styles.label}>Trade Date</label>
                    <select className={styles.dropdown} value={selectedDate} onChange={handleDateChange}>
                        {AVAILABLE_DATES.map(date => <option key={date} value={date}>{date}</option>)}
                    </select>
                </div>

                <div className={styles.selectGroup}>
                    <label className={styles.label}>Target Theme</label>
                    <select
                        className={styles.dropdown}
                        value={selectedThemeId}
                        onChange={(e) => setSelectedThemeId(e.target.value)}
                        disabled={availableThemes.length === 0}
                    >
                        {availableThemes.map(theme => (
                            <option key={theme.id} value={theme.id}>{theme.name}</option>
                        ))}
                    </select>
                </div>

                <button className={styles.executeBtn} onClick={handleExecute} disabled={!selectedDate || !selectedThemeId}>
                    <Play size={18} fill="currentColor" /> Load Workspace
                </button>
            </div>
        </div>
    );
}