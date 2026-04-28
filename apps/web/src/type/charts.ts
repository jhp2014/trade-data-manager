
export interface FilledCandle {
    unixTimestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    openRateKrx: number;
    highRateKrx: number;
    lowRateKrx: number;
    closeRateKrx: number;
    openRateNxt: number;
    highRateNxt: number;
    lowRateNxt: number;
    closeRateNxt: number;
    tradingAmount: number;
    accumulatedTradingAmount: number;
}