import styles from "./page.module.css";
import { db } from "@trade-data-manager/database";

export default async function HomePage() {
    // 백엔드 연결 테스트: 실제 테이블이 있다면 여기서 fetch를 시도합니다.
    // const stocks = await db.query.marketTable.findMany(); 

    return (
        <main className={styles.container}>
            <h1 className={styles.title}>Trade Data Manager</h1>
            <div className={styles.statusCard}>
                <p>Backend Status: <span style={{ color: '#00ff88' }}>Ready</span></p>
                <p>CSS Modules: <span style={{ color: '#00ff88' }}>Active</span></p>
            </div>
        </main>
    );
}
