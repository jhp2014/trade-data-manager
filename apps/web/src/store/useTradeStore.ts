import { create } from 'zustand';

interface TradeState {
    // 1. 큰 슬라이드 상태 (0: 검색, 1: 워크스페이스)
    step: number;
    setStep: (step: number) => void;

    // 2. 워크스페이스 내 상세 모드 상태
    // null 이면 Slide #2 (전체 종목 그리드)
    // '005930' 같은 종목코드가 있으면 Slide #3 (해당 종목 정밀 분석)
    selectedStock: string | null;
    setSelectedStock: (stockCode: string | null) => void;
}

export const useTradeStore = create<TradeState>((set) => ({
    // 초기값 설정
    step: 0,
    selectedStock: null,

    // 액션 설정
    setStep: (step) => set({ step }),

    setSelectedStock: (stockCode) => set({ selectedStock: stockCode }),
}));