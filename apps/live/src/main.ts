import "dotenv/config"; // apps/live/.env 로드(LIVE_* 설정). 파일 없으면 no-op. 키움 크레덴셜은 infra/kiwoom/.env.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

// apps/live = 실시간 모니터/알람 백엔드(상주 데몬).
// 조건검색 WS + ka10095 폴링 → SSE 로 workbench 에 라이브 스냅샷 push.
// apps/api(무상태 DB 읽기)와 분리 — 이건 stateful 라이브 read model.
// (설계: memory realtime-monitor-trader-design)
const PORT = Number(process.env.LIVE_PORT ?? 3002);

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    // 로컬 프론트(workbench)가 붙는다. 배포 시엔 Tailscale 뒤라 공개 노출 안 함.
    app.enableCors();
    await app.listen(PORT);
    console.log(`▶ live listening on http://localhost:${PORT}`);
}

void bootstrap();
