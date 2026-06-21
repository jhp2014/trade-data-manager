"use client";

import { useWorkbench } from "@/stores/workbench";
import styles from "./HelpModal.module.css";

/** 단축키 한 줄: 키 조합 + 설명. */
function Row({ keys, desc }: { keys: string[]; desc: string }) {
    return (
        <div className={styles.row}>
            <span className={styles.keys}>
                {keys.map((k, i) => (
                    <kbd key={i} className={styles.kbd}>
                        {k}
                    </kbd>
                ))}
            </span>
            <span className={styles.desc}>{desc}</span>
        </div>
    );
}

/** 설정에서 여는 도움말 모달 — 단축키·필터 입력법·가설 검색법 안내. */
export function HelpModal() {
    const open = useWorkbench((s) => s.helpOpen);
    const close = useWorkbench((s) => s.closeHelp);

    if (!open) return null;

    return (
        <div className={styles.overlay} onClick={close}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <header className={styles.head}>
                    <h2>도움말</h2>
                    <button className={styles.x} onClick={close} aria-label="닫기">
                        ×
                    </button>
                </header>

                <section className={styles.section}>
                    <h3>단축키</h3>
                    <div className={styles.rows}>
                        <Row keys={["Space"]} desc="가설 추가/검색 입력칸으로 포커스" />
                        <Row keys={["Ctrl", "Space"]} desc="입력칸 포커스 해제 (a/d 탐색 복귀)" />
                        <Row keys={["f"]} desc="필터 식 입력칸으로 포커스" />
                        <Row keys={["1"]} desc="작업셋 → Date" />
                        <Row keys={["2"]} desc="작업셋 → Sheet" />
                        <Row keys={["3"]} desc="작업셋 → History" />
                        <Row keys={["4"]} desc="작업셋 → Filter" />
                        <Row keys={["a"]} desc="이전 케이스" />
                        <Row keys={["d"]} desc="다음 케이스" />
                        <Row keys={["Tab"]} desc="가설 입력칸에서 추가 ↔ 검색 모드 토글" />
                    </div>
                    <h3 className={styles.subHead}>그래프 (마우스)</h3>
                    <div className={styles.rows}>
                        <Row keys={["좌-드래그"]} desc="화면 이동" />
                        <Row keys={["Ctrl", "좌-드래그"]} desc="박스 다중선택" />
                        <Row keys={["더블클릭"]} desc="가설 상세 열기" />
                        <Row keys={["우클릭"]} desc="가설을 필터식에 추가 (연속 시 연산자 순환)" />
                        <Row keys={["Shift", "우클릭"]} desc="필터식에서 가설 제거" />
                    </div>
                </section>

                <section className={styles.section}>
                    <h3>필터 입력법 (Filter 모드)</h3>
                    <p className={styles.muted}>
                        가설 <b>코드</b>로 케이스를 거르는 불리언식입니다. 식에 맞는 케이스만
                        레일에 남습니다.
                    </p>
                    <div className={styles.opList}>
                        <Row keys={["&"]} desc="AND — 둘 다 연결된 케이스 (and 도 가능)" />
                        <Row keys={["|"]} desc="OR — 둘 중 하나 (or 도 가능)" />
                        <Row keys={["!"]} desc="NOT — 연결 안 된 케이스 (not 도 가능)" />
                        <Row keys={["( )"]} desc="그룹 묶기" />
                    </div>
                    <p className={styles.muted}>
                        우선순위: NOT &gt; AND &gt; OR. 예시:
                    </p>
                    <code className={styles.example}>(H0001 &amp; H0002) | !H0003</code>
                </section>

                <section className={styles.section}>
                    <h3>가설 검색법 (패널 검색 모드)</h3>
                    <p className={styles.muted}>
                        가설 자체를 텍스트·태그로 거릅니다. 매칭된 가설은 위로 모이고, 그래프에서는
                        비매칭이 흐려집니다.
                    </p>
                    <div className={styles.opList}>
                        <Row keys={["단어"]} desc="가설 텍스트 부분일치" />
                        <Row keys={["#태그"]} desc="태그 일치" />
                        <Row keys={["공백", "&"]} desc="AND (공백은 암묵적 AND)" />
                        <Row keys={["|"]} desc="OR" />
                        <Row keys={["!"]} desc="NOT" />
                        <Row keys={["( )"]} desc="그룹 묶기" />
                    </div>
                    <p className={styles.muted}>예시:</p>
                    <code className={styles.example}>삼성 #급등 | !장기</code>
                </section>
            </div>
        </div>
    );
}
