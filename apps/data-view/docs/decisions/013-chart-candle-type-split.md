# ADR-013: ChartCandle 타입 분리

**상태**: Accepted  
**날짜**: 2026-05-10

## 맥락

기존 `ChartCandle` 하나가 일봉(가격 OHLCV)과 분봉(% 등락률)을 모두 담당하고 있었다.
NXT 필드는 일봉에서는 NXT 가격, 분봉에서는 NXT 등락률로 혼용되어 의미가 모호했다.
분봉·오버레이에 KRX/NXT 토글(ADR-014)을 추가하면서 optional 필드가 더 폭증하므로
도메인별로 타입을 분리한다.

## 결정

`src/types/chart.ts`를 다음 세 인터페이스로 재설계한다.

```ts
/** 일봉 1봉 — KRX/NXT 양쪽 가격 시리즈 보유 */
export interface DailyCandle {
    time: number;                       // unix seconds (UTC)
    krx: { open: number; high: number; low: number; close: number };
    nxt: { open: number; high: number; low: number; close: number };
    volumeKrx?: number;
    amountKrx?: number;                 // MIL 단위 (DB trading_amount_krx)
    volumeNxt?: number;
    amountNxt?: number;
    prevCloseKrx?: number;
    prevCloseNxt?: number;
}

/** 분봉 1봉 — KRX/NXT 양쪽 등락률(%) 시리즈 보유 */
export interface MinuteCandle {
    time: number;
    krx: { open: number; high: number; low: number; close: number };  // 모두 % 단위
    nxt: { open: number; high: number; low: number; close: number };  // 모두 % 단위
    volume?: number;
    amount?: number;                    // KRW 단위 (DB trading_amount)
    accAmount?: number;                 // KRW 단위
}

/** 오버레이 1포인트 — KRX/NXT 양쪽 % */
export interface ChartOverlayPoint {
    time: number;
    valueKrx: number;
    valueNxt: number;
    amount: number;                     // 분 거래대금 KRW
    cumAmount: number;                  // 누적 거래대금 KRW
}
```

`ChartPreviewDTO`에 `prevCloseKrx: number | null`, `prevCloseNxt: number | null` 추가.
이 값은 진입일(`tradeDate`) 일봉에서 추출하며, 분봉 % 변환의 기준값으로 사용한다.

## 결과

- 모드 토글 시 데이터 페치 없이 메모리 내 필드 swap만으로 처리 가능.
- 일봉의 NXT 가격과 분봉의 NXT %가 같은 필드명으로 충돌하지 않음.
- `ChartCandle` 타입은 삭제되고, 일봉 컴포넌트는 `DailyCandle[]`, 분봉 컴포넌트는 `MinuteCandle[]`을 받음.
