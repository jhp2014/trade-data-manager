import { logger } from "../utils/logger.js";

/**
 * 서비스 메서드 실행 시 에러 핸들링과 로깅을 자동화하는 데코레이터
 * @param context - 로그에 표시할 서비스/도메인 명칭
 */
export function ServiceOperation(context: string) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;

        // target.constructor.name을 통해 실제 클래스명을 추출하여 로그의 풍부함을 더합니다.
        const className = target.constructor?.name || "UnknownService";

        descriptor.value = async function (...args: any[]) {
            const startTime = Date.now();
            const methodName = propertyKey;

            // 로깅용 메타데이터: 핵심 정보 위주로 구성
            const meta = {
                context,
                className,
                methodName,
                // 인자가 너무 클 경우를 대비해 문자열화 후 제한적으로 관리 가능
                args: args.length > 0 ? JSON.stringify(args) : undefined
            };

            try {
                // 1. 작업 시작 로깅
                logger.debug(`[${context}][${className}] ${methodName} 시작`, meta);

                const result = await originalMethod.apply(this, args);

                // 2. 성공 및 소요 시간 로깅
                const duration = Date.now() - startTime;
                logger.info(`[${context}][${className}] ${methodName} 완료 (${duration}ms)`);

                return result;
            } catch (error: any) {
                const duration = Date.now() - startTime;

                // Stack Trace 요약: 최상단 3줄만 추출하여 한 줄로 변환
                const shortStack = error.stack
                    ? error.stack.split('\n').slice(0, 3).join(' | ')
                    : "No stack trace available";

                // 에러 로깅 시 target 정보와 함께 상세 내역 기록
                logger.error(`[${context}][${className}] ${methodName} 실행 중 실패 (소요: ${duration}ms)`, {
                    ...meta,
                    message: error.message,
                    errorLocation: shortStack
                });

                throw error;
            }
        };
        return descriptor;
    };
}