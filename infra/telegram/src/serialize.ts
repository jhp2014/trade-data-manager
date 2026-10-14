// GramJS TL 객체 → 순수 JSON. 아카이브의 raw 박제용(지운 메시지는 재수집이 불가능하므로 원본을 남긴다).
// ⚠ GramJS 객체는 자기 인자 사본(originalArgs)과 내부 캐시(_client·_chat 등)를 들고 있어 그대로 JSON 화하면
//   단계마다 두 배로 부푼다(recon 05 첫 측정이 건당 수백 KB 로 나온 원인). 여기서 그 둘을 걷어낸다.
//   BigInteger(big-integer 인스턴스) → 10진 문자열, Buffer → 길이만(바이너리는 raw 의 관심사가 아니다).
//   조회수·전달수·반응·댓글수(views·forwards·reactions·replies)는 뺀다 — 수집 시점마다 뜻이 다른 값이라
//   raw 에 박제하면 나중에 통계를 왜곡한다(decisions.md "조회수·전달수 저장 안 함" 의 raw 쪽 집행).
//   깊이 상한을 넘는 가지는 표식 문자열로 자른다 — 원객체를 그대로 돌려주면 JSON.stringify 가 순환·bigint 로 죽고,
//   같은 페이지가 매번 같은 이유로 실패해 백필이 그 방에서 영구히 멈춘다.

const MAX_DEPTH = 12;
const DEPTH_MARK = "[depth]";
const SKIP_KEYS = new Set([
    "originalArgs",
    "CONSTRUCTOR_ID",
    "SUBCLASS_OF_ID",
    "classType",
    "views",
    "forwards",
    "reactions",
    "replies",
]);

export function toPlain(v: unknown, depth = 0): unknown {
    if (v === null || v === undefined) return v;
    if (typeof v === "bigint") return v.toString();
    if (typeof v !== "object") return v;
    if (depth > MAX_DEPTH) return DEPTH_MARK;
    if (Buffer.isBuffer(v)) return { bytes: v.length };
    if (v instanceof Date) return v.toISOString();
    const o = v as Record<string, unknown>;
    // big-integer 라이브러리 인스턴스(GramJS 의 long 표현) — toJSNumber 가 있고 value 를 든다.
    if (typeof o.toJSNumber === "function" && "value" in o) return String(o.toString());
    if (Array.isArray(v)) return v.map((x) => toPlain(x, depth + 1));
    const out: Record<string, unknown> = {};
    if (typeof o.className === "string") out.className = o.className;
    for (const [k, val] of Object.entries(o)) {
        if (k.startsWith("_") || SKIP_KEYS.has(k)) continue;
        if (typeof val === "function") continue;
        out[k] = toPlain(val, depth + 1);
    }
    return out;
}
