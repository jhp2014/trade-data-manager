import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // React 17+ automatic JSX 런타임 (컴포넌트 테스트에서 React import 불필요).
  esbuild: {
    jsx: "automatic",
  },
  test: {
    // 기본은 node(순수 lib 테스트). 컴포넌트 테스트는 파일 상단
    // `// @vitest-environment jsdom` 로 개별 지정한다.
    environment: "node",
  },
});
