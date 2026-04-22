import winston from "winston";
import fs from "fs";
import path from "path";

// 로그 폴더 생성
const logDir = "logs";
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// AI와 사람이 모두 읽기 좋은 하이브리드 로거 설정
export const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }), // 에러 스택 트레이스 포함
        winston.format.json() // 파일에는 JSON 포맷으로 저장 (AI 파싱용)
    ),
    transports: [
        // 1. 에러 로그만 따로 모으는 파일
        new winston.transports.File({
            filename: path.join(logDir, "error.log"),
            level: "error"
        }),
        // 2. 전체 배치의 흐름을 기록하는 파일
        new winston.transports.File({
            filename: path.join(logDir, "batch.log")
        }),
        // 3. 개발용 콘솔 출력 (색상 적용)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
                    return `[${timestamp}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""
                        }${stack ? `\n${stack}` : ""}`;
                })
            ),
        }),
    ],
});