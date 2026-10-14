// GramJS TL 객체 → 순수 JSON. 아카이브의 raw 박제용(지운 메시지는 재수집이 불가능하므로 원본을 남긴다).
// ⚠ GramJS 객체는 자기 인자 사본(originalArgs)과 내부 캐시(_client·_chat 등)를 들고 있어 그대로 JSON 화하면
//   단계마다 두 배로 부푼다(recon 05 첫 측정이 건당 수백 KB 로 나온 원인). 여기서 그 둘을 걷어낸다.
//   BigInteger(big-integer 인스턴스) → 10진 문자열, Buffer → 길이만(바이너리는 raw 의 관심사가 아니다).

const MAX_DEPTH = 12;
const SKIP_KEYS = new Set(["originalArgs", "CONSTRUCTOR_ID", "SUBCLASS_OF_ID", "classType"]);

export function toPlain(v: unknown, depth = 0): unknown {
    if (depth > MAX_DEPTH || v === null || v === undefined) return v;
    if (typeof v === "bigint") return v.toString();
    if (typeof v !== "object") return v;
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
