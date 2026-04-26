import winston from "winston";
import fs from "fs";
import path from "path";

// 로그 폴더 생성
const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// NODE_ENV=production 이면 info 이상만, 개발 시에는 debug까지 출력
const LOG_LEVEL = process.env.NODE_ENV === "production" ? "info" : "debug";

const jsonFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
        const stackStr = stack ? `\n${stack}` : "";
        return `[${timestamp}] ${level}: ${message}${metaStr}${stackStr}`;
    })
);

export const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: jsonFormat,
    transports: [
        // 1. error 이상만 별도 파일에 기록 (stack trace 포함)
        new winston.transports.File({
            filename: path.join(logDir, "error.log"),
            level: "error",
        }),
        // 2. 전체 흐름 기록 (info 이상)
        new winston.transports.File({
            filename: path.join(logDir, "web.log"),
            level: "info",
        }),
        // 3. 진단용 상세 로그 (debug 이상, 개발 시에만)
        new winston.transports.File({
            filename: path.join(logDir, "debug.log"),
            level: "debug",
        }),
        // 4. 콘솔 출력
        new winston.transports.Console({
            level: LOG_LEVEL,
            format: consoleFormat,
        }),
    ],
});
