'use server';

import { getAvailableDates, getThemesByDate } from '@/lib/db-service';

/**
 * [Server Action] 클라이언트에서 호출 가능한 날짜 조회 함수
 */
export async function fetchAvailableDatesAction() {
    try {
        const dates = await getAvailableDates();
        return dates;
    } catch (error) {
        console.error("Failed to fetch dates:", error);
        throw new Error("데이터를 불러오지 못했습니다.");
    }
}

/**
 * [Server Action] 클라이언트에서 호출 가능한 테마 조회 함수
 */
export async function fetchThemesByDateAction(date: string) {
    try {
        const themes = await getThemesByDate(date);
        return themes;
    } catch (error) {
        console.error(`Failed to fetch themes for ${date}:`, error);
        throw new Error("테마 정보를 불러오지 못했습니다.");
    }
}