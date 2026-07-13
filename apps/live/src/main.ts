import "dotenv/config"; // apps/live/.env 로드(LIVE_* 설정). 파일 없으면 no-op. 키움 크레덴셜은 infra/kiwoom/.env.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

// apps/live = 실시간 모니터/알람 백엔드(상주 데몬).
// 조건검색 WS + ka10095 폴링 → SSE 로 workbench 에 라이브 스냅샷 push.
// apps/api(무상태 DB 읽기)와 분리 — 이건 stateful 라이브 read model.
// (설계: memory realtime-monitor-trader-design)
const PORT = Number(process.env.LIVE_PORT ?? 3002);
// 바인드 호스트 — 기본 0.0.0.0(로컬 개발 편의). 호스팅 시엔 Tailscale IP(100.x)로 지정해
// 공인 IP 에 포트를 열지 않는다(공개 노출 금지). 방화벽(ufw)과 이중 방어.
const HOST = process.env.LIVE_HOST ?? "0.0.0.0";

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    // 로컬 프론트(workbench)가 붙는다. 배포 시엔 Tailscale 뒤라 공개 노출 안 함.
    app.enableCors();
    await app.listen(PORT, HOST);
    console.log(`▶ live listening on http://${HOST}:${PORT}`);
}

void bootstrap();
