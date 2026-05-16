import { create } from "zustand";

export interface ChartModalTarget {
    stockCode: string;
    stockName: string;
    tradeDate: string;
    tradeTime: string;
    themeId: string;
    priceLines?: Record<string, number[]>;
}

interface ChartModalState {
    target: ChartModalTarget | null;
    open: (t: ChartModalTarget) => void;
    close: () => void;
}

export const useChartModalStore = create<ChartModalState>((set) => ({
    target: null,
    open: (target) => set({ target }),
    close: () => set({ target: null }),
}));
