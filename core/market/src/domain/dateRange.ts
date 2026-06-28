// 공용 값객체 — 거래일 범위. inbound·outbound·service 어디에도 속하지 않는 도메인 어휘이므로
// 도메인에 둔다(포트끼리 곁가지 의존이 생기지 않게). YYYY-MM-DD, 양끝 포함(inclusive).
export interface DateRange {
    from: string;
    to: string;
}
