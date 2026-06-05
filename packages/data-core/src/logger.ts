/**
 * 공용 console 기반 로거. 의존성 0 (서브패스 export로 배럴을 끌어오지 않음).
 * 필요 시 winston 등으로 교체 가능.
 */
export const logger = {
    info: (msg: string, ...args: unknown[]) =>
        console.log(`[INFO] ${new Date().toISOString()} ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) =>
        console.warn(`[WARN] ${new Date().toISOString()} ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) =>
        console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, ...args),
};
