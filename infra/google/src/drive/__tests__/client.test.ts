import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { makeDriveClient } from "../client.js";
import type { DriveTransport } from "../transport.js";
import type { DriveFile } from "../types.js";

/**
 * fake transport — 네트워크 없이 client 의 upsert/dedup 을 검증한다.
 * calls 에 호출 흔적을 남기고 files 로 폴더 상태를 흉내낸다.
 */
function createFake(initial: DriveFile[] = []) {
    const calls: string[] = [];
    let files: DriveFile[] = [...initial];
    let seq = initial.length;

    const transport: DriveTransport = {
        async createFile(_folderId, name) {
            calls.push(`create:${name}`);
            const id = `id-${++seq}`;
            files.push({ id, name });
            return { id, md5Checksum: "md5", size: "1" };
        },
        async updateFile(fileId) {
            calls.push(`update:${fileId}`);
        },
        async listFilesInFolder() {
            calls.push("list");
            return [...files];
        },
        async deleteFile(fileId) {
            calls.push(`delete:${fileId}`);
            files = files.filter((f) => f.id !== fileId);
        },
        async downloadFile(fileId) {
            calls.push(`download:${fileId}`);
            return Readable.from(["x"]);
        },
    };

    return {
        transport,
        calls,
        get files() {
            return files;
        },
    };
}

const body = () => Readable.from(["x"]);

describe("uploadOrUpdate", () => {
    it("동명 파일이 없으면 새로 생성한다", async () => {
        const f = createFake();
        const c = makeDriveClient(f.transport);

        await c.uploadOrUpdate({ folderId: "F", name: "manifest.json", body: body() });

        expect(f.calls).toEqual(["list", "create:manifest.json"]);
        expect(f.files.map((x) => x.name)).toEqual(["manifest.json"]);
    });

    it("동명 파일이 있으면 내용만 갱신(생성 안 함)", async () => {
        const f = createFake([{ id: "id-1", name: "manifest.json" }]);
        const c = makeDriveClient(f.transport);

        await c.uploadOrUpdate({ folderId: "F", name: "manifest.json", body: body() });

        expect(f.calls).toEqual(["list", "update:id-1"]);
    });

    it("동명 중복이 여럿이면 첫 개만 갱신하고 나머지는 정리한다", async () => {
        const f = createFake([
            { id: "id-1", name: "manifest.json" },
            { id: "id-2", name: "manifest.json" },
            { id: "id-3", name: "other.dump" },
        ]);
        const c = makeDriveClient(f.transport);

        await c.uploadOrUpdate({ folderId: "F", name: "manifest.json", body: body() });

        expect(f.calls).toEqual(["list", "update:id-1", "delete:id-2"]);
        expect(f.files.map((x) => x.name).sort()).toEqual(["manifest.json", "other.dump"]);
    });
});

describe("uploadFile / listFiles / deleteFile", () => {
    it("uploadFile 은 createFile 로 위임하고 결과를 그대로 반환", async () => {
        const f = createFake();
        const c = makeDriveClient(f.transport);

        const res = await c.uploadFile({ folderId: "F", name: "a.dump", body: body() });

        expect(res).toEqual({ id: "id-1", md5Checksum: "md5", size: "1" });
        expect(f.calls).toEqual(["create:a.dump"]);
    });

    it("listFiles/deleteFile 은 transport 로 통과", async () => {
        const f = createFake([{ id: "id-1", name: "a.dump" }]);
        const c = makeDriveClient(f.transport);

        expect(await c.listFiles("F")).toEqual([{ id: "id-1", name: "a.dump" }]);
        await c.deleteFile("id-1");
        expect(f.calls).toEqual(["list", "delete:id-1"]);
    });
});
