// 엔진 설정 영속(조건검색 선택) — alerts/configStore 와 같은 패턴: JSON 파일 + 원자쓰기(tmp→rename).
// 진실 소스: 이 파일 > env LIVE_CONDITION_NAME(부팅 기본값). 워크벤치 설정 모달에서 선택하면 여기 저장.
// 손상 파일은 .corrupt-<ts> 로 백업 후 빈 설정으로 시작(다음 저장이 유실을 확정하지 않게 원본 보존).
import fs from "node:fs";
import path from "node:path";

interface EngineConfigFile {
    /** 선택된 조건식 이름. 빈 문자열=명시적 해제(env 기본값도 무시). 필드 부재=미설정(env 폴백). */
    conditionName?: string;
}

export class EngineConfigStore {
    private cfg: EngineConfigFile = {};
    private readonly abs: string;

    constructor(filePath: string) {
        this.abs = path.resolve(process.cwd(), filePath);
    }

    /** 파일 로드. 없음=빈 설정. 손상=원본 백업 후 빈 설정. @returns 손상 백업 경로(정상이면 null) */
    load(): string | null {
        if (!fs.existsSync(this.abs)) {
            this.cfg = {};
            return null;
        }
        try {
            const raw = JSON.parse(fs.readFileSync(this.abs, "utf8")) as Partial<EngineConfigFile>;
            this.cfg = { ...(typeof raw.conditionName === "string" ? { conditionName: raw.conditionName } : {}) };
            return null;
        } catch {
            const backup = `${this.abs}.corrupt-${Date.now()}`;
            fs.renameSync(this.abs, backup);
            this.cfg = {};
            return backup;
        }
    }

    /** 저장된 조건식 이름 — 미설정이면 null(호출자가 env 폴백). 빈 문자열은 명시적 해제로 그대로 반환. */
    get conditionName(): string | null {
        return this.cfg.conditionName ?? null;
    }

    setConditionName(name: string): void {
        this.cfg.conditionName = name;
        this.save();
    }

    private save(): void {
        fs.mkdirSync(path.dirname(this.abs), { recursive: true });
        const tmp = `${this.abs}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.cfg, null, 2), "utf8");
        fs.renameSync(tmp, this.abs);
    }
}
