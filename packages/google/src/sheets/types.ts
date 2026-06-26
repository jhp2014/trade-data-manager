/** 쓰기 시 값 해석 방식. RAW=리터럴 보존(앞 0·수식 안전), USER_ENTERED=사람 입력처럼 파싱. */
export type ValueInputOption = "RAW" | "USER_ENTERED";

/** 읽기 시 셀 값 렌더 방식. 기본 FORMATTED_VALUE(화면 표시 그대로). */
export type ValueRenderOption = "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA";
