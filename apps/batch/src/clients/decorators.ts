import { logger } from "../utils/logger.js";

/**
 * Kiwoom API 요청 전용 로깅 및 에러 핸들링 데코레이터
 * @param apiId - 키움 API 서비스 ID (예: 'OPT10001', 'GetCommData')
 */
export function KiwoomRequest(apiId: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        const className = target.constructor?.name || "KiwoomClient";

        descriptor.value = async function (...args: any[]) {
            const startTime = Date.now();

            try {
                // 1. 요청 전 로깅 (Debug): 클래스명과 메서드명을 명시하여 추적성 강화
                logger.debug(`[${apiId}][${className}] API 요청 시작`, {
                    method: propertyKey,
                    args
                });

                const result = await originalMethod.apply(this, args);

                // 2. 요청 성공 로깅 (Info): 소요 시간 추가로 성능 모니터링 가능
                const duration = Date.now() - startTime;
                logger.info(`[${apiId}][${className}] API 요청 성공 (${duration}ms)`);

                return result;
            } catch (error: any) {
                const duration = Date.now() - startTime;

                // 스택 트레이스 가공: 최상단 2줄만 추출하여 가독성 확보
                const shortStack = error.stack
                    ? error.stack.split('\n').slice(0, 3).join(' | ')
                    : "No stack trace";

                logger.error(`[${apiId}][${className}] API 처리 중 오류 발생 (소요: ${duration}ms)`, {
                    method: propertyKey,
                    message: error.message,
                    status: error.response?.status,
                    location: shortStack,
                    data: error.response?.data ? JSON.stringify(error.response.data).slice(0, 200) : undefined
                });

                // 배치는 에러를 전파시켜 멈추거나 재시도 메커니즘을 타게 함
                throw error;
            }
        };
        return descriptor;
    };
}