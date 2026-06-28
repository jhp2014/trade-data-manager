/** KIS 코어가 의존하는 최소 로거 인터페이스. winston 등 무거운 의존성을 패키지에 끌어들이지 않으려고 주입형으로 둔다. */
export interface Logger {
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
}

/** 아무것도 출력하지 않는 로거 (테스트 기본값). */
export const silentLogger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
};

/** 콘솔로 흘리는 로거 (recon/배치 기본값). */
export const consoleLogger: Logger = {
    debug: (m, meta) => console.debug(`[kis] ${m}`, meta ?? ""),
    info: (m, meta) => console.info(`[kis] ${m}`, meta ?? ""),
    warn: (m, meta) => console.warn(`[kis] ${m}`, meta ?? ""),
    error: (m, meta) => console.error(`[kis] ${m}`, meta ?? ""),
};
