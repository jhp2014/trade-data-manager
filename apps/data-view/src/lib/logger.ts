const isDev = process.env.NODE_ENV !== "production";

export const logger = {
    error: (msg: string, cause?: unknown) =>
        console.error(`[data-view] ${msg}`, cause ?? ""),
    warn: (msg: string) => {
        if (isDev) console.warn(`[data-view] ${msg}`);
    },
    info: (msg: string) => {
        if (isDev) console.info(`[data-view] ${msg}`);
    },
};
