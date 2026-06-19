function Search-File($path, $filename) {
    try {
        $files = Get-ChildItem -Path $path -Filter $filename -ErrorAction SilentlyContinue
        foreach ($f in $files) {
            Write-Host $f.FullName
        }
        $dirs = Get-ChildItem -Path $path -Directory -ErrorAction SilentlyContinue
        foreach ($d in $dirs) {
            if ($d.Attributes -match "ReparsePoint") { continue }
            Search-File $d.FullName $filename
        }
    } catch {}
}

Write-Host "Searching for node.exe..."
Search-File "C:\Users\ronal" "node.exe"

Write-Host "Searching for npm.cmd..."
Search-File "C:\Users\ronal" "npm.cmd"

Write-Host "Search completed."
