import { clearMock, connect } from "./_mock";

async function main(): Promise<void> {
    const { db, close } = connect();
    try {
        await clearMock(db);
        console.log("[mock] cleared: hypothesis 스키마 비움 + review 마커 행 삭제");
    } finally {
        await close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
