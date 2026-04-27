'use server';

import { getAllThemesChartDataByDate } from '@/lib/db-service';

/**
 * [Server Action] 특정 날짜의 모든 테마와 종목 차트(분봉/일봉) 데이터를 한 번에 가져옵니다.
 */
export async function fetchAllThemesChartDataAction(date: string) {
    try {
        const data = await getAllThemesChartDataByDate(date);
        return data;
    } catch (error) {
        throw new Error("테마 차트 데이터를 불러오지 못했습니다.", { cause: error });
    }
}