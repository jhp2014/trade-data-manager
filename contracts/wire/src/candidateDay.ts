// /candidate-days 계약 — 후보 하루(분석의 모수). 도메인 값타입은 core/market 를 **재노출**(단일 출처).
// 맵 계약과 분리한 이유: 후보는 맵과 무관하게 변하고(앵커 하나만 찍어도 늘어난다) 맵을 안 열어도
// 시트·깔때기가 쓴다. 미배치 트레이 = 후보 − 그 맵의 자리 이므로 뺄셈은 화면이 한다.
import type { CandidateDay, CandidateTrace } from "@trade-data-manager/market";

export type { CandidateDay, CandidateTrace };
