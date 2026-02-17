@echo off
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "Get-ChildItem -Recurse -Force | " ^
    "Where-Object { $_.FullName -notmatch 'node_modules|\.git|dist|coverage' } | " ^
    "Sort-Object FullName | " ^
    "ForEach-Object { " ^
    "    $depth = ($_.FullName -split '\\\\').Count - 3; " ^
    "    '  ' * [Math]::Max(0, $depth) + $_.Name " ^
    "} > list.txt"

echo  list.txt
pause