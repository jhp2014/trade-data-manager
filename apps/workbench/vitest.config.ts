import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// 테스트 설정을 vite.config 에서 갈라 둔다 — 그쪽은 개발 서버 프록시가 본체라 테스트와 관심사가 다르다.
//
// 환경은 **파일마다 고른다**(`environmentMatchGlobs`): 순수 함수 테스트가 절대 다수인데 그것들까지
// jsdom 을 켜면 전체 실행이 눈에 띄게 느려진다. 화면을 실제로 그려 보는 테스트만 `.dom.test.tsx` 로
// 이름 지어 jsdom 을 받는다 — 이름이 곧 "이 파일은 DOM 을 쓴다"는 선언이다.
export default defineConfig({
    plugins: [react()],
    test: {
        environmentMatchGlobs: [["**/*.dom.test.tsx", "jsdom"]],
        setupFiles: ["./src/test/setup.ts"],
    },
});
