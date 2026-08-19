import "reflect-metadata";
import compression from "compression";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

// apps/api = core/market inbound 포트를 HTTP 로 노출하는 driving adapter(CLI 처럼 가장자리).
// 개발땐 Vite server.proxy 가 /api→여기로 프록시하지만, 보수적으로 CORS 도 열어둔다.
const PORT = Number(process.env.API_PORT ?? 3001);

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    // SIGINT/SIGTERM 에 OnModuleDestroy 훅이 실제로 돌게 한다 — 없으면 pool.end()·텔레그램 disconnect 가
    // 스킵돼 커넥션이 그냥 끊긴다(Nest 는 기본으로 시그널을 안 듣는다).
    app.enableShutdownHooks();
    app.enableCors();
    // 큰 응답(당일 축약물 등)은 raw JSON 수 MB — gzip 으로 압축해 내려보낸다.
    app.use(compression());
    await app.listen(PORT);
    console.log(`▶ api listening on http://localhost:${PORT}`);
}

void bootstrap();
