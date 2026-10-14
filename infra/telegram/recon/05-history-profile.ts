// 정찰 5: 방 히스토리 프로파일 — DB 적재(전부 저장) 설계용 실측. 읽기 전용.
// 사용: pnpm --filter @trade-data-manager/telegram recon:history-profile [YYYY-MM-DD ...]
//   방마다: 가장 오래된/최신 메시지, 2023-01-01 이후 메시지 수 추정(msg_id 차),
//   표본일 하루 메시지 수, 최근 표본일의 필드 분포(전달·숨은링크·앨범·답글·미디어·수정)·plain JSON 크기.
//   표본일 기본 = 최근 평일 + 2025-06-16 + 2023-06-15 (KST 하루).
import { Api, type TelegramClient } from "telegram";
import { NEWS_CHANNELS } from "../src/channels.js";
import { connectedClient, saveExploration, handleError } from "./_shared.js";

const KST_OFFSET = "+09:00";
const DAY_CAP = 3000; // 하루 표본 안전 상한
const SINCE_2023 = Math.floor(new Date(`2023-01-01T00:00:00${KST_OFFSET}`).getTime() / 1000);

function toPeer(p: string): string | number {
    return /^-?\d+$/.test(p) ? Number(p) : p;
}

function kstDayRange(day: string): { start: number; end: number } {
    const start = Math.floor(new Date(`${day}T00:00:00${KST_OFFSET}`).getTime() / 1000);
    return { start, end: start + 86400 };
}

/** GramJS TL 객체 → 순수 JSON(내부 캐시 _client/_chat 등 제외, BigInteger→문자열, Buffer→길이). */
function toPlain(v: unknown, depth = 0): unknown {
    if (depth > 12 || v === null || v === undefined) return v;
    if (typeof v === "bigint") return v.toString();
    if (typeof v !== "object") return v;
    if (Buffer.isBuffer(v)) return { bytes: v.length };
    const o = v as Record<string, unknown>;
    // big-integer 라이브러리 인스턴스
    if (typeof o.toJSNumber === "function" && "value" in o) return String(o.toString());
    if (Array.isArray(v)) return v.map((x) => toPlain(x, depth + 1));
    const out: Record<string, unknown> = {};
    if (typeof o.className === "string") out.className = o.className;
    for (const [k, val] of Object.entries(o)) {
        if (k.startsWith("_") || k === "originalArgs" || k === "CONSTRUCTOR_ID" || k === "SUBCLASS_OF_ID" || k === "classType") continue;
        if (typeof val === "function") continue;
        out[k] = toPlain(val, depth + 1);
    }
    return out;
}

async function messagesInDay(client: TelegramClient, peer: string | number, day: string): Promise<Api.Message[]> {
    const { start, end } = kstDayRange(day);
    const out: Api.Message[] = [];
    for await (const m of client.iterMessages(peer, { offsetDate: end, limit: DAY_CAP })) {
        if (!(m instanceof Api.Message)) continue;
        if (m.date < start) break;
        out.push(m);
    }
    return out;
}

function mediaKind(m: Api.Message): string {
    const md = m.media;
    if (!md) return "none";
    if (md instanceof Api.MessageMediaPhoto) return "photo";
    if (md instanceof Api.MessageMediaWebPage) return "webpage";
    if (md instanceof Api.MessageMediaDocument) {
        const doc = md.document;
        if (doc instanceof Api.Document) {
            const isVideo = doc.attributes.some((a) => a instanceof Api.DocumentAttributeVideo);
            if (isVideo) return "video";
            return `document:${doc.mimeType}`;
        }
        return "document";
    }
    return md.className;
}

function profileFields(msgs: Api.Message[]) {
    const n = msgs.length || 1;
    const media: Record<string, number> = {};
    let fwd = 0, fwdChannel = 0, textUrl = 0, textUrlMsgs = 0, grouped = 0, reply = 0, edited = 0, webpage = 0, emptyText = 0;
    let plainBytes = 0, textBytes = 0;
    const entityKinds: Record<string, number> = {};
    for (const m of msgs) {
        const k = mediaKind(m);
        media[k] = (media[k] ?? 0) + 1;
        if (m.fwdFrom) {
            fwd++;
            if (m.fwdFrom.fromId instanceof Api.PeerChannel) fwdChannel++;
        }
        const ents = m.entities ?? [];
        let hasTextUrl = false;
        for (const e of ents) {
            entityKinds[e.className] = (entityKinds[e.className] ?? 0) + 1;
            if (e instanceof Api.MessageEntityTextUrl) {
                textUrl++;
                hasTextUrl = true;
            }
        }
        if (hasTextUrl) textUrlMsgs++;
        if (m.groupedId) grouped++;
        if (m.replyTo) reply++;
        if (m.editDate) edited++;
        if (m.media instanceof Api.MessageMediaWebPage) webpage++;
        if (!m.message) emptyText++;
        plainBytes += Buffer.byteLength(JSON.stringify(toPlain(m)));
        textBytes += Buffer.byteLength(m.message ?? "");
    }
    const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`;
    return {
        count: msgs.length,
        fwd: pct(fwd),
        fwdFromChannel: pct(fwdChannel),
        textUrlMsgs: pct(textUrlMsgs),
        textUrlTotal: textUrl,
        grouped: pct(grouped),
        reply: pct(reply),
        edited: pct(edited),
        webpage: pct(webpage),
        emptyText: pct(emptyText),
        media,
        entityKinds,
        avgPlainJsonBytes: Math.round(plainBytes / n),
        avgTextBytes: Math.round(textBytes / n),
    };
}

function recentWeekday(): string {
    const d = new Date(Date.now() + 9 * 3600_000); // KST 기준 오늘
    do d.setUTCDate(d.getUTCDate() - 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return d.toISOString().slice(0, 10);
}

async function main() {
    const days = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
    const sampleDays = days.length ? days : [recentWeekday(), "2025-06-16", "2023-06-15"];
    const client = await connectedClient();

    const summary: unknown[] = [];
    const rawSamples: Record<string, unknown[]> = {};

    for (const ch of NEWS_CHANNELS) {
        const peer = toPeer(ch.peer);
        try {
            const entity = await client.getEntity(peer);
            const id = (entity as { id?: unknown }).id?.toString();
            const title = (entity as { title?: string }).title;
            const username = (entity as { username?: string }).username;

            const [newest] = await client.getMessages(peer, { limit: 1 });
            const [oldest] = await client.getMessages(peer, { limit: 1, reverse: true });
            // 2023-01-01 직전 메시지(없으면 방이 그 뒤 개설)
            const [before2023] = await client.getMessages(peer, { limit: 1, offsetDate: SINCE_2023 });

            const perDay: Record<string, number> = {};
            let recentProfile: ReturnType<typeof profileFields> | null = null;
            for (const [i, day] of sampleDays.entries()) {
                const msgs = await messagesInDay(client, peer, day);
                perDay[day] = msgs.length;
                if (i === 0) {
                    recentProfile = profileFields(msgs);
                    // 설계 검증용 원본: 성격이 다른 것 위주로 최대 6건
                    const pick = [
                        msgs.find((m) => m.fwdFrom),
                        msgs.find((m) => m.entities?.some((e) => e instanceof Api.MessageEntityTextUrl)),
                        msgs.find((m) => m.groupedId),
                        msgs.find((m) => m.media instanceof Api.MessageMediaPhoto),
                        msgs.find((m) => m.media instanceof Api.MessageMediaWebPage),
                        msgs.find((m) => m.replyTo),
                    ].filter((m): m is Api.Message => !!m);
                    rawSamples[ch.label] = [...new Set(pick)].map((m) => toPlain(m));
                }
            }

            const sinceBase = before2023 ? before2023.id : 0;
            const row = {
                label: ch.label,
                peer: ch.peer,
                id,
                title,
                username,
                newest: newest ? { id: newest.id, date: new Date(newest.date * 1000).toISOString() } : null,
                oldest: oldest ? { id: oldest.id, date: new Date(oldest.date * 1000).toISOString() } : null,
                idSpanSince2023: newest ? newest.id - sinceBase : 0,
                openedAfter2023: !before2023,
                perDay,
                recentProfile,
            };
            summary.push(row);
            console.log(
                `[ok] ${ch.label}: oldest=${row.oldest?.date.slice(0, 10)} span2023=${row.idSpanSince2023} perDay=${JSON.stringify(perDay)}`,
            );
        } catch (err) {
            const e = err as { errorMessage?: string; seconds?: number; message?: string };
            console.log(`[fail] ${ch.label}: ${e.errorMessage ?? e.message} ${e.seconds ? `wait=${e.seconds}s` : ""}`);
            summary.push({ label: ch.label, peer: ch.peer, error: e.errorMessage ?? e.message, floodSeconds: e.seconds });
        }
        await new Promise((r) => setTimeout(r, 1500));
    }

    saveExploration({
        label: "history-profile",
        request: { sampleDays, channels: NEWS_CHANNELS.map((c) => c.peer) },
        response: summary,
        raw: rawSamples,
    });

    await client.disconnect();
    process.exit(0);
}

main().catch(handleError);
