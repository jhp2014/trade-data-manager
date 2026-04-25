import {
    STAT_RATES,
    STAT_AMOUNTS,
    type TradingOpportunityInsert
} from "@trade-data-manager/database";
import { processorRepository } from "../db/processorRepository.js";
import { logger } from "../utils/logger.js";
import path from "path";
import fs from "fs";

export class OpportunityService {

    /**
     * 📁 지정된 폴더의 CSV 파일들을 순차적으로 처리하고 폴더를 이동시킵니다.
     */
    async collectFromFolder(folderPath: string) {
        const processedDir = path.join(folderPath, "processed");
        const failedDir = path.join(folderPath, "failed");

        // 대상 폴더 자동 생성
        fs.mkdirSync(processedDir, { recursive: true });
        fs.mkdirSync(failedDir, { recursive: true });

        // .csv 파일 스캔 및 정렬
        const csvFiles = fs.readdirSync(folderPath)
            .filter(file => file.endsWith(".csv") && fs.lstatSync(path.join(folderPath, file)).isFile())
            .sort();

        if (csvFiles.length === 0) {
            logger.info(`[Opportunity] 처리할 CSV 파일이 없습니다.`);
            return;
        }

        for (const fileName of csvFiles) {
            const srcPath = path.join(folderPath, fileName);
            logger.info(`[Opportunity] ▶ 파일 처리 시작: ${fileName}`);

            try {
                // 파일 처리 실행
                await this.processFromFile(srcPath);

                // 성공 -> processed/ 이동
                const destPath = path.join(processedDir, fileName);
                fs.copyFileSync(srcPath, destPath);
                fs.unlinkSync(srcPath);
                logger.info(`[Opportunity] ✅ 완료 및 이동: ${fileName} → processed/`);
            } catch (err) {
                // 실패 -> failed/ 이동
                const destPath = path.join(failedDir, fileName);
                fs.copyFileSync(srcPath, destPath);
                fs.unlinkSync(srcPath);
                logger.error(`[Opportunity] ❌ 실패 및 이동: ${fileName} → failed/ (사유: ${(err as Error).message})`);
            }
        }
    }

    /**
     * 개별 CSV 파일을 읽어 매핑 로직을 수행합니다.
     */
    private async processFromFile(filePath: string) {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split(/\r?\n/).filter(line => line.trim());

        // 헤더: 날짜, 시간, 종목코드, 종목명 (두 번째 줄부터 처리)
        /* 
            예시 데이터:
            날짜, 시간, 종목코드, 종목명
            20260420, 091500, 041190, 우리기술투자
            20260420, 103000, 005930, 삼성전자
            20260420, 134500, 000660, SK하이닉스
         */
        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(",").map(s => s.trim());
            if (columns.length < 3) continue;

            // 🛡️ 방어적 프로그래밍: 하이픈이나 콜론이 섞여있어도 숫자만 추출하도록 처리
            const tradeDate = columns[0].replace(/[^0-9]/g, ""); // "2026-04-20" -> "20260420"
            const tradeTime = columns[1].replace(/[^0-9]/g, ""); // "09:30:00" -> "093000"
            const stockCode = columns[2];

            // 시간이 4자리(0930)로 들어오면 뒤에 00을 붙여주는 센스
            const formattedTime = tradeTime.length === 4 ? `${tradeTime}00` : tradeTime;

            await this.createOpportunity(stockCode, tradeDate, formattedTime);
        }
    }


    /**
     * 특정 시점의 데이터 조각들을 모아 최종 TradingOpportunityInsert 객체로 변환 및 저장합니다.
     */
    async createOpportunity(stockCode: string, tradeDate: string, tradeTime: string) {
        // 1. 기본 데이터 조회 (종목 피처 + 테마 + 테마 통계 + 순위 + 종목마스터)
        const sourceDataList = await processorRepository.getOpportunitySourceData(stockCode, tradeDate, tradeTime);

        if (sourceDataList.length === 0) {
            logger.warn(`[Opportunity] 사전 계산된 피처가 없습니다. (먼저 processor를 돌려주세요): ${stockCode}`);
            return;
        }

        for (const source of sourceDataList) {
            const { feature, theme, themeFeature, context, stock } = source;

            // 2. 슬롯(Top 6) 데이터 조회 (NXT 등락률 순위 기준)
            const topStocks = await processorRepository.getTopStocksInTheme(themeFeature.id, 6);

            // 3. 데이터 매핑 (비정규화)
            const opportunity: TradingOpportunityInsert = {
                // 식별 정보
                tradeDate: feature.tradeDate,
                tradeTime: feature.tradeTime,
                stockCode: feature.stockCode,
                stockName: stock.stockName, // CSV에서 추가하기로 한 종목명 활용
                themeId: theme.themeId,
                themeName: theme.themeName,

                // 포착 종목(Base) 상세
                closeRateKrx: feature.closeRateKrx,
                closeRateNxt: feature.closeRateNxt,
                tradingAmount: feature.tradingAmount,
                cumulativeTradingAmount: feature.cumulativeTradingAmount,

                // [자동화] 거래대금 구간별 횟수
                ...this.mapAmtCounts(feature),

                changeRate5m: feature.changeRate5m,
                changeRate10m: feature.changeRate10m,
                changeRate30m: feature.changeRate30m,
                changeRate60m: feature.changeRate60m,
                changeRate120m: feature.changeRate120m,

                // 포착 종목 순위
                rankByRateKrx: context.rankByRateKrx,
                rankByRateNxt: context.rankByRateNxt,
                rankByCumulativeTradingAmount: context.rankByCumulativeTradingAmount,

                // 테마 통계
                avgRate: themeFeature.avgRate,
                cntTotalStock: themeFeature.cntTotalStock,
                ...this.mapThemeStats(themeFeature),

                // [자동화] 슬롯 데이터 (S1 ~ S6)
                ...this.mapAllSlots(topStocks)
            };

            await processorRepository.saveTradingOpportunity(opportunity);
            logger.info(`[Opportunity] 저장 완료: ${stock.stockName} (${theme.themeName} 테마)`);
        }
    }

    /**
     * STAT_AMOUNTS 상수를 이용해 거래대금 횟수 컬럼을 매핑합니다.
     */
    private mapAmtCounts(source: any, prefix: string = "") {
        const res: any = {};
        const tsPre = prefix ? `${prefix}Cnt` : "cnt";
        STAT_AMOUNTS.forEach(a => {
            res[`${tsPre}${a}Amt`] = source[`${tsPre}${a}Amt`] ?? 0;
        });
        return res;
    }

    /**
     * STAT_RATES, STAT_AMOUNTS 상수를 이용해 테마 통계 컬럼을 매핑합니다.
     */
    private mapThemeStats(tf: any) {
        const res: any = {};
        STAT_RATES.forEach(r => res[`cnt${r}RateStockNum`] = tf[`cnt${r}RateStockNum`] ?? 0);
        STAT_AMOUNTS.forEach(a => res[`cnt${a}AmtStockNum`] = tf[`cnt${a}AmtStockNum`] ?? 0);
        return res;
    }

    /**
     * S1~S6 슬롯 전체를 반복문을 통해 매핑합니다.
     */
    private mapAllSlots(topStocks: any[]) {
        let allSlots: any = {};
        for (let i = 1; i <= 6; i++) {
            allSlots = { ...allSlots, ...this.mapSingleSlot(i, topStocks[i - 1]) };
        }
        return allSlots;
    }

    /**
     * 개별 슬롯(Si)의 컬럼들을 매핑합니다.
     */
    private mapSingleSlot(index: number, target?: any) {
        const p = `s${index}`;
        const f = target?.feature;

        return {
            [`${p}StockCode`]: f?.stockCode ?? null,
            [`${p}RateKrx`]: f?.closeRateKrx ?? null,
            [`${p}RateNxt`]: f?.closeRateNxt ?? null,
            [`${p}TradingAmount`]: f?.tradingAmount ?? null,
            [`${p}CumulativeTradingAmount`]: f?.cumulativeTradingAmount ?? null,
            [`${p}ChangeRate5m`]: f?.changeRate5m ?? null,
            [`${p}ChangeRate10m`]: f?.changeRate10m ?? null,
            [`${p}ChangeRate30m`]: f?.changeRate30m ?? null,
            [`${p}ChangeRate60m`]: f?.changeRate60m ?? null,
            [`${p}ChangeRate120m`]: f?.changeRate120m ?? null,
            [`${p}DayHighRate`]: f?.dayHighRate ?? null,
            [`${p}DayHighTime`]: f?.dayHighTime ?? null,
            [`${p}PullbackFromDayHigh`]: f?.pullbackFromDayHigh ?? null,
            [`${p}MinutesSinceDayHigh`]: f?.minutesSinceDayHigh ?? null,
            // 슬롯 내 거래대금 횟수도 상수로 자동 매핑
            ...this.mapAmtCounts(f ?? {}, p)
        };
    }
}