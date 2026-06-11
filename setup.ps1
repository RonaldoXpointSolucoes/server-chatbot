Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Iniciando configuracao do ChatBoot..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Restaurar arquivos do Git caso estejam faltando (como package.json)
Write-Host "1. Verificando e restaurando arquivos do Git..." -ForegroundColor Yellow
try {
    & "C:\Program Files\Git\bin\git.exe" restore .
    Write-Host "Arquivos do Git verificados/restaurados com sucesso." -ForegroundColor Green
} catch {
    try {
        git restore .
        Write-Host "Arquivos do Git verificados/restaurados com sucesso." -ForegroundColor Green
    } catch {
        Write-Host "Aviso: Nao foi possivel rodar o git restore. Verifique se o Git esta instalado." -ForegroundColor Red
    }
}

# 2. Verificar se o Node.js esta instalado
Write-Host "`n2. Verificando instalacao do Node.js..." -ForegroundColor Yellow
$nodeInstalled = $false
try {
    node --version
    $nodeInstalled = $true
} catch {}

if (-not $nodeInstalled) {
    Write-Host "Node.js nao encontrado. Instalando automaticamente via winget..." -ForegroundColor Yellow
    try {
        winget install --id OpenJS.NodeJS --silent --accept-source-agreements --accept-package-agreements
        Write-Host "Node.js instalado com sucesso! Carregando no PATH..." -ForegroundColor Green
        $env:PATH = "C:\Program Files\nodejs;" + $env:PATH
    } catch {
        Write-Host "Falha ao instalar via winget. Tentando baixar instalador MSI..." -ForegroundColor Red
        $msiPath = "$env:TEMP\node-v20.msi"
        Write-Host "Baixando instalador do Node.js v20..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.12.2/node-v20.12.2-x64.msi" -OutFile $msiPath
        Write-Host "Instalando Node.js..." -ForegroundColor Yellow
        Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait
        Remove-Item -Path $msiPath -Force
        $env:PATH = "C:\Program Files\nodejs;" + $env:PATH
        Write-Host "Node.js instalado via MSI com sucesso!" -ForegroundColor Green
    }
} else {
    Write-Host "Node.js ja esta instalado." -ForegroundColor Green
}

# 3. Instalar dependencias do projeto
Write-Host "`n3. Instalando dependencias do projeto..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    Write-Host "Executando npm install..." -ForegroundColor Yellow
    npm install
} elseif (Test-Path "baileys-core\package.json") {
    Write-Host "Executando npm install em baileys-core..." -ForegroundColor Yellow
    cd baileys-core
    npm install
    cd ..
} else {
    Write-Host "Aviso: Nenhum package.json encontrado para instalar dependencias." -ForegroundColor Red
}

# 4. Iniciar o projeto
Write-Host "`n4. Iniciando o servidor de desenvolvimento..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    npm run dev
} elseif (Test-Path "baileys-core\package.json") {
    cd baileys-core
    npm run dev
} else {
    Write-Host "Nao foi possivel iniciar o projeto pois o package.json nao foi encontrado." -ForegroundColor Red
}
