'use client';

import { useState, useEffect } from 'react';
import { useTradeStore } from '@/store/useTradeStore';
import { useRouter, usePathname } from 'next/navigation';
import { Play, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import styles from './BasicSearchMode.module.css';

import { fetchAvailableDatesAction, fetchThemesByDateAction } from '@/actions/searchActions';


export default function BasicSearchMode() {
    const setStep = useTradeStore((state) => state.setStep);
    const router = useRouter();
    const pathname = usePathname();

    const [selectedDate, setSelectedDate] = useState('');
    const [selectedThemeId, setSelectedThemeId] = useState('');

    const { data: dates, isLoading: isDatesLoading } = useQuery({
        queryKey: ['availableDates'],
        queryFn: () => fetchAvailableDatesAction(),
    });

    const { data: themes, isLoading: isThemesLoading, isFetching: isThemesFetching } = useQuery({
        queryKey: ['themesByDate', selectedDate],
        queryFn: () => fetchThemesByDateAction(selectedDate),
        enabled: !!selectedDate, // 💡 핵심: 날짜가 없으면 실행하지 않음
    });

    useEffect(() => {
        if (dates && dates.length > 0 && !selectedDate) {
            setSelectedDate(dates[0]);
        }
    }, [dates, selectedDate]);

    useEffect(() => {
        if (themes && themes.length > 0) {
            setSelectedThemeId(themes[0].themeId);
        } else {
            setSelectedThemeId('');
        }
    }, [themes]);

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

                {/* 1. 날짜 선택 드롭다운 */}
                <div className={styles.selectGroup}>
                    <label className={styles.label}>Trade Date</label>
                    <div className={styles.inputWrapper}>
                        <select
                            className={styles.dropdown}
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            disabled={isDatesLoading}
                        >
                            {isDatesLoading ? (
                                <option value="">Loading dates...</option>
                            ) : (
                                dates?.map(date => <option key={date} value={date}>{date}</option>)
                            )}
                        </select>
                        {isDatesLoading && <Loader2 className={styles.spinner} size={16} />}
                    </div>
                </div>

                {/* 2. 테마 선택 드롭다운 */}
                <div className={styles.selectGroup}>
                    <label className={styles.label}>Target Theme</label>
                    <div className={styles.inputWrapper}>
                        <select
                            className={styles.dropdown}
                            value={selectedThemeId}
                            onChange={(e) => setSelectedThemeId(e.target.value)}
                            disabled={isThemesLoading || !themes || themes.length === 0}
                        >
                            {isThemesLoading ? (
                                <option value="">Loading themes...</option>
                            ) : !themes || themes.length === 0 ? (
                                <option value="">No data available</option>
                            ) : (
                                themes.map(theme => (
                                    <option key={theme.themeId} value={theme.themeId}>{theme.themeName}</option>
                                ))
                            )}
                        </select>
                        {/* 새로운 날짜를 눌러서 테마를 다시 가져올 때 스피너 표시 */}
                        {(isThemesLoading || isThemesFetching) && <Loader2 className={styles.spinner} size={16} />}
                    </div>
                </div>

                <button
                    className={styles.executeBtn}
                    onClick={handleExecute}
                    disabled={!selectedDate || !selectedThemeId || isDatesLoading || isThemesLoading}
                >
                    <Play size={18} fill="currentColor" /> Load Workspace
                </button>
            </div>
        </div>
    );
}