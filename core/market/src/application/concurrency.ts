// 제한 동시성 map — 최대 limit 개를 동시에 실행하되 결과는 입력 순서로 돌려준다.
// 외부 API rate limit 은 CredentialPool 이 자체 페이싱하므로(동시에 던져도 슬롯이 시간분배됨),
// 여기 limit 은 "네트워크 대기를 겹쳐 천장까지 채우는" 인플라이트 상한일 뿐 — 천장을 넘기지 않는다.
// fn 의 예외는 전파된다 → 호출자는 fn 내부에서 try/catch 로 종목 실패를 격리하길 권장.
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const n = items.length;
    const results = new Array<R>(n);
    if (n === 0) return results;

    const workers = Math.max(1, Math.min(Math.floor(limit), n));
    let cursor = 0;

    async function run(): Promise<void> {
        // cursor++ 는 싱글스레드라 워커 간 경쟁 없이 다음 인덱스를 집어온다.
        while (true) {
            const i = cursor++;
            if (i >= n) return;
            results[i] = await fn(items[i], i);
        }
    }

    await Promise.all(Array.from({ length: workers }, run));
    return results;
}
