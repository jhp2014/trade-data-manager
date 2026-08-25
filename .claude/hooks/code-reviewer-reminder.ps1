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

    $normalized = $path -replace '\\', '/'
    $isMarkdown = $normalized -match '\.md$'
    $isTargetDir = $normalized -match '/(core|apps|infra|contracts)/'

    if ((-not $isMarkdown) -and $isTargetDir) {
        $message = "코드 변경 감지: $path -- code-reviewer 서브에이전트 호출을 검토하세요 (헥사고날 경계 / ISP / market-curation 스키마 분리 체크)."
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
