/** 폴더 내 파일 식별 최소 정보. */
export interface DriveFile {
    id: string;
    name: string;
}

/** 업로드 결과의 md5/size (무결성 검증용). 소비자가 로컬 파일과 대조한다. */
export interface UploadResult {
    id: string;
    md5Checksum: string;
    size: string;
}
