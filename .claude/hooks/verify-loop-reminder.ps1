[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false

try {
    $json = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $path = $json.tool_response.filePath
    if (-not $path) { $path = $json.tool_input.file_path }

    if (-not $path) {
        '{}'
        return
    }

    $normalized = $path.Replace([char]92, "/")
    $isMarkdown = $normalized -match '\.md$'
    $isTargetDir = $normalized -match '/(core|apps|infra|contracts)/'

    if ((-not $isMarkdown) -and $isTargetDir) {
        $message = "코드 변경 감지: $path -- 이번 구현이 끝났으면 verify-loop 스킬로 검증 루프를 도세요 (리뷰 -> A/B/C 분류 -> 수정 -> 재확인, UI 변경이면 실측까지). 아직 편집 중이면 무시하고 계속하세요."
        $output = @{
            hookSpecificOutput = @{
                hookEventName = 'PostToolUse'
                additionalContext = $message
            }
        }
        $output | ConvertTo-Json -Compress -Depth 5
    } else {
        '{}'
    }
} catch {
    '{}'
}
