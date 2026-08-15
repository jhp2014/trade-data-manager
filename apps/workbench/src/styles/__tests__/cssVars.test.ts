// 폴백 없는 `var(--이름)` 은 theme.css 에 **정의돼 있어야 한다**.
//
// 왜 테스트로 막나: 정의 없는 CSS 변수는 에러를 내지 않는다. 그 선언 하나가 조용히 무효가 되어
// 그리기가 멈출 뿐이다 — 실제로 맵의 겹침 선이 `var(--text-muted)`(이 앱에 없는 이름, 다른 디자인
// 시스템의 어휘였다) 때문에 통째로 안 그려졌고, 화살촉과 숫자만 허공에 떠 있었다. 타입도 린트도
// 못 잡고, 화면을 직접 봐야만 드러나는 종류라 여기서 값으로 잠근다.
//
// 폴백이 있는 것(`var(--danger, #dc2626)`)은 대상이 아니다 — 없으면 폴백이 받으므로 의도된 사용이다.
// 동적 이름(`var(--plane-${key})`)도 정적으로 검사할 수 없어 대상이 아니다(둘 다 정규식이 자연히 거른다).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(fileURLToPath(new URL("../../", import.meta.url)));

/** RF 등 라이브러리가 제 스타일시트에서 정의하는 접두사 — 우리 테마의 책임이 아니다. */
const EXTERNAL_PREFIXES = ["--xy-"];

/** 주석은 뺀다 — 설명문에 적힌 `var(--x)` 는 코드가 아니다. */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "__tests__" || e.name === "test") continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) sourceFiles(p, out);
        else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
}

describe("CSS 변수 — 폴백 없이 쓰는 이름은 테마에 있어야 한다", () => {
    const theme = readFileSync(join(SRC, "styles/theme.css"), "utf8");
    const defined = new Set([...theme.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]!));

    it("테마가 실제로 변수를 정의한다 — 아래 검사가 빈 사전을 상대로 헛돌지 않게", () => {
        expect(defined.size).toBeGreaterThan(10);
        expect(defined.has("--text-primary")).toBe(true);
    });

    it("소스 전체에서 미정의 변수를 쓰지 않는다", () => {
        const bad: string[] = [];
        for (const file of sourceFiles(SRC)) {
            const src = stripComments(readFileSync(file, "utf8"));
            // 닫는 괄호가 바로 오는 것 = 폴백 없음. 동적(`${`)은 이 패턴에 안 걸린다.
            for (const m of src.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) {
                const name = m[1]!;
                if (defined.has(name) || EXTERNAL_PREFIXES.some((p) => name.startsWith(p))) continue;
                bad.push(`${name} ← ${file.slice(SRC.length).replace(/\\/g, "/")}`);
            }
        }
        expect(bad).toEqual([]);
    });
});
