// @trade-data-manager/wire — apps/api(생산)와 apps/workbench(소비)가 공유하는 HTTP 계약(타입 전용).
// 예전엔 서버(apps/api)와 클라(apps/workbench)가 같은 응답 모양을 각자 손으로 적어(드리프트 위험) 두었다.
// 이제 계약을 이 한 곳에 두고 양쪽이 import → 서버 응답 모양이 바뀌면 클라가 컴파일 에러로 잡힌다.
//
// 규칙: 와이어를 그대로 타는 도메인 값타입(캔들·타점·가격선 등)은 core/market 를 **재노출**(단일 출처),
//       화면 전용 read model 봉투(api 소유)는 여기서 **정의**한다. 런타임 코드 0 — 전부 타입.
export type * from "./chart.js";
export type * from "./daySummary.js";
export type * from "./dayReplay.js";
export type * from "./theme.js";
export type * from "./comment.js";
export type * from "./priceLine.js";
export type * from "./reviewPoint.js";
export type * from "./hypothesis.js";
export type * from "./hypothesisFilter.js";
export type * from "./news.js";
export type * from "./telegramNews.js";
export type * from "./stockMeta.js";
export type * from "./dataDate.js";
export type * from "./live.js";
