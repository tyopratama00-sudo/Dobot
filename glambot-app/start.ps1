<#
    Glambot Photo Booth - one-command launcher.

    Nyalain backend (Go), booth (Vite), dobot (Python), dan admin (Vite) sekaligus
    di satu window Windows Terminal (4 pane), lalu buka Chrome kiosk ke booth
    dengan profil browser yang baru tiap start. Admin: http://localhost:5174/admin/

    Urutannya berantai -- backend -> dobot -> booth -- dan tiap pane nunggu
    gilirannya sendiri dengan cara ngecek port pendahulunya:

        backend    langsung jalan
        dobot      nunggu :APP_PORT   -> baru python main.py
        booth      nunggu :APP_PORT + :PORT(dobot) -> baru npm run preview
        admin      langsung jalan (vite dev, proxy /api ke backend)

    Booth defaultnya production: build lalu preview. Pakai `-Dev` untuk HMR.

    Sebelum service nyala, skrip menarik update dari origin/main dulu supaya
    kiosk tidak jalan pakai kode kemarin. Langkah ini SELALU fail-soft: offline,
    fetch lambat, ada perubahan lokal yang belum di-commit, atau merge bentrok --
    semuanya cuma jadi peringatan, start tetap lanjut pakai kode yang ada.
    Repo tidak akan pernah ditinggal dalam keadaan setengah ter-merge.

        .\start.ps1                 update dari main, build, start + kiosk
        .\start.ps1 -Dev            pakai `npm run dev -w @photobooth/booth` (HMR)
        .\start.ps1 -Rebuild        paksa build booth ulang
        .\start.ps1 -Clean          + hapus frontend\apps\booth\dist dulu
        .\start.ps1 -NoRobot        dobot jalan tanpa hardware (--no-robot)
        .\start.ps1 -NoBrowser      jangan buka Chrome
        .\start.ps1 -NoPull         jangan ambil update dari main

    Parameter -Service dipakai internal: tiap pane manggil balik skrip ini
    dengan -Service backend|frontend|dobot|admin. Jangan dipanggil manual.
#>

[CmdletBinding()]
param(
    [ValidateSet('backend', 'frontend', 'dobot', 'admin')]
    [string] $Service,

    [switch] $Clean,
    [switch] $NoRobot,
    [switch] $Dev,
    [switch] $Rebuild,
    [switch] $NoBrowser,
    [switch] $NoPull
)

$ErrorActionPreference = 'Stop'

$Root         = $PSScriptRoot
$BackendDir   = Join-Path $Root 'backend'
$FrontendDir  = Join-Path $Root 'frontend'
$DobotDir     = Join-Path $Root 'dobot'
$ProfileDir   = Join-Path $env:TEMP 'glambot-kiosk-profile'

# Batas tunggu `git fetch`. Di venue yang internetnya mati, git bisa
# menggantung menit-menitan -- kiosk tidak boleh telat nyala gara-gara itu.
$GitFetchTimeoutSec = 25

# ---------------------------------------------------------------- helpers ---

# Baca satu key dari file .env (KEY=value). Komentar dan tanda kutip dibuang.
function Get-EnvValue {
    param([string] $File, [string] $Key, [string] $Default)

    if (-not (Test-Path $File)) { return $Default }
    foreach ($line in (Get-Content $File)) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
            $val = $matches[1].Trim()
            $val = ($val -split '\s+#')[0].Trim()
            $val = $val.Trim('"').Trim("'")
            if ($val) { return $val }
        }
    }
    return $Default
}

function Test-PortOpen {
    param([int] $Port)

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(250)) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Wait-Port {
    param([int] $Port, [string] $Label, [int] $TimeoutSec = 90)

    Write-Host "  menunggu $Label (:$Port) " -NoNewline
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        if (Test-PortOpen -Port $Port) {
            Write-Host " siap." -ForegroundColor Green
            return $true
        }
        Write-Host '.' -NoNewline
        Start-Sleep -Seconds 1
    }
    Write-Host " TIMEOUT." -ForegroundColor Yellow
    return $false
}

# Pane mewarisi environment dari proses Windows Terminal, bukan dari shell yang
# menjalankan skrip ini. WT bikin window baru lewat proses WT yang sudah jalan,
# jadi PATH-nya bisa PATH lama -- dari sebelum Go/Node/Git dipasang atau sebelum
# PATH terakhir diubah. Gejalanya khas: di pane "go"/"npm" tidak dikenali,
# padahal di PowerShell biasa jalan normal. Proses yang sudah jalan tidak pernah
# ikut kena update PATH, jadi PATH-nya dibaca ulang dari registry tiap pane mulai.
# Warisan lama tetap dipakai di urutan terakhir supaya tidak ada yang hilang.
function Update-PathFromRegistry {
    $seen  = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $parts = New-Object 'System.Collections.Generic.List[string]'

    $sources = @(
        [Environment]::GetEnvironmentVariable('PATH', 'Machine'),
        [Environment]::GetEnvironmentVariable('PATH', 'User'),
        $env:PATH
    )
    foreach ($entry in (($sources -join ';') -split ';')) {
        $entry = $entry.Trim()
        if (-not $entry) { continue }
        if ($seen.Add($entry.TrimEnd('\'))) { [void] $parts.Add($entry) }
    }
    $env:PATH = $parts -join ';'
}

# Cari executable sesudah PATH di-refresh. Balikin path absolut biar pemanggilan
# berikutnya tidak bergantung PATH lagi, atau $null + pesan yang bisa ditindak.
function Get-ToolPath {
    param([string] $Name, [string] $Hint)

    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    Write-Host ("`n[X] '{0}' tidak ketemu di PATH." -f $Name) -ForegroundColor Red
    Write-Host ("    {0}" -f $Hint) -ForegroundColor Yellow
    Write-Host "    Kalau baru dipasang/baru ubah PATH: tutup SEMUA window Windows Terminal dulu," -ForegroundColor DarkYellow
    Write-Host "    baru jalankan start.ps1 lagi." -ForegroundColor DarkYellow
    return $null
}

# Bunuh apa pun yang masih pegang port. Ini penting: `go run .` di Windows
# spawn child exe, dan kalau window-nya ditutup paksa child-nya tetap hidup
# megang :8080 -> run berikutnya gagal bind tanpa pesan yang jelas.
function Stop-Port {
    param([int] $Port, [string] $Label)

    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { return }

    # Sengaja bukan $pid -- itu variabel otomatis PowerShell (read-only).
    foreach ($procId in ($conns.OwningProcess | Sort-Object -Unique)) {
        if ($procId -le 4) { continue }   # System / Idle, jangan disentuh
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        Write-Host ("  [kill] :{0} dipegang {1} (pid {2}) - {3}" -f $Port, $proc.ProcessName, $procId, $Label) -ForegroundColor DarkYellow
        try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {
            Write-Host ("  [!] gagal kill pid {0}: {1}" -f $procId, $_.Exception.Message) -ForegroundColor Red
        }
    }
    Start-Sleep -Milliseconds 400
}

function Find-Chrome {
    $candidates = @(
        (Join-Path $env:ProgramFiles        'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA        'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles        'Microsoft\Edge\Application\msedge.exe')
    )
    foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
    return $null
}

# Tarik update dari origin/main sebelum service nyala.
#
# Aturan mainnya: START TIDAK BOLEH GAGAL GARA-GARA GIT. Kiosk yang jalan pakai
# kode kemarin masih melayani customer; kiosk yang tidak nyala karena repo
# setengah ter-merge tidak. Jadi tiap cabang di bawah ujungnya `return` dengan
# peringatan, bukan `exit`.
#
# Urutannya juga sengaja dari yang paling aman:
#   1. tidak ada commit baru        -> tidak ngapa-ngapain
#   2. ada perubahan lokal          -> dilewati, kerjaan yang belum di-commit
#                                      tidak boleh disentuh
#   3. bisa fast-forward            -> tarik, tanpa commit merge
#   4. branch punya commit sendiri  -> merge beneran; kalau bentrok, --abort
function Sync-FromMain {
    # git nulis progress ke stderr; dengan ErrorActionPreference 'Stop' itu bisa
    # dianggap error terminating padahal exit code-nya 0.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    try {
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
            Write-Host '      git tidak ada di PATH - update dilewati' -ForegroundColor DarkGray
            return
        }

        & git -C "$Root" rev-parse --is-inside-work-tree 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host '      bukan repo git - update dilewati' -ForegroundColor DarkGray
            return
        }

        # Job + timeout, bukan panggilan langsung: `git fetch` tidak punya
        # opsi timeout dan bisa diam menunggu jaringan selamanya.
        Write-Host '      ambil info terbaru dari origin/main...' -ForegroundColor DarkGray
        $job = Start-Job -ScriptBlock {
            param($dir)
            & git -C $dir fetch --quiet origin main 2>&1 | Out-Null
            $LASTEXITCODE
        } -ArgumentList $Root

        $finished = Wait-Job $job -Timeout $GitFetchTimeoutSec
        $fetchCode = if ($finished) { @(Receive-Job $job)[-1] } else { $null }
        if (-not $finished) { Stop-Job $job -ErrorAction SilentlyContinue }
        Remove-Job $job -Force -ErrorAction SilentlyContinue

        if (-not $finished) {
            Write-Host ("      [!] fetch lewat {0} detik (internet lambat/mati)" -f $GitFetchTimeoutSec) -ForegroundColor Yellow
            Write-Host '          lanjut pakai kode lokal.' -ForegroundColor Yellow
            return
        }
        if ($fetchCode -ne 0) {
            Write-Host '      [!] fetch gagal (offline? remote/kredensial?) - lanjut pakai kode lokal' -ForegroundColor Yellow
            return
        }

        # Semua commit main sudah ada di sini -> tidak ada yang perlu ditarik.
        & git -C "$Root" merge-base --is-ancestor origin/main HEAD 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host '      sudah paling baru - tidak ada perubahan di main' -ForegroundColor Green
            return
        }

        $behind = @(& git -C "$Root" rev-list --count HEAD..origin/main 2>$null)[0]
        Write-Host ("      ada {0} commit baru di main" -f $behind) -ForegroundColor White

        # Ada yang belum di-commit -> jangan disentuh sama sekali. Merge di atas
        # working tree kotor gampang bikin kerjaan orang hilang.
        $dirty = @(& git -C "$Root" status --porcelain 2>$null)
        if ($dirty.Count -gt 0) {
            Write-Host '      [!] ada perubahan lokal yang belum di-commit - pull DILEWATI' -ForegroundColor Yellow
            Write-Host '          commit atau stash dulu kalau mau ikut update main.' -ForegroundColor Yellow
            return
        }

        $before = @(& git -C "$Root" rev-parse HEAD 2>$null)[0]

        # Fast-forward: paling aman, tidak bikin commit merge.
        & git -C "$Root" merge --ff-only origin/main 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host '      update terpasang (fast-forward)' -ForegroundColor Green
            Show-UpdateImpact -Before $before
            return
        }

        # Branch ini punya commit sendiri yang tidak ada di main -> perlu merge
        # beneran. Kalau bentrok, batalkan: lebih baik jalan pakai kode kemarin
        # daripada berhenti di repo yang setengah ter-merge.
        & git -C "$Root" merge --no-edit origin/main 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host '      update terpasang (merge ke branch ini)' -ForegroundColor Green
            Show-UpdateImpact -Before $before
            return
        }

        & git -C "$Root" merge --abort 2>$null | Out-Null
        Write-Host '      [!] main bentrok dengan branch ini - merge DIBATALKAN' -ForegroundColor Yellow
        Write-Host '          repo dikembalikan seperti semula, start lanjut pakai kode lokal.' -ForegroundColor Yellow
        Write-Host '          selesaikan manual nanti: git merge origin/main' -ForegroundColor Yellow
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

# Sesudah update masuk: kasih tahu kalau ada yang butuh langkah manual. Kode Go
# dan booth otomatis di-build oleh pane masing-masing, TAPI dependency
# (npm/pip) dan skema .env tidak -- itu yang perlu diomongin, bukan didiamkan
# sampai service-nya error dengan pesan yang tidak nyambung.
function Show-UpdateImpact {
    param([string] $Before)

    $changed = @(& git -C "$Root" diff --name-only $Before HEAD 2>$null)
    if (-not $changed) { return }

    $notes = @()
    if ($changed -match '^glambot-app/frontend/(package(-lock)?\.json|apps/booth/(package\.json|vite\.config\.ts|\.env\.example))$') {
        $notes += 'dependency frontend berubah -> cd frontend; npm install'
    }
    if ($changed -match '^dobot/requirements\.txt$') {
        $notes += 'dependency dobot berubah -> dobot\venv\Scripts\pip install -r dobot\requirements.txt'
    }
    if ($changed -match '^backend/go\.(mod|sum)$') {
        $notes += 'dependency backend berubah -> `go build` bakal narik module baru (butuh internet)'
    }
    if ($changed -match '\.env\.example$') {
        $notes += 'ada .env.example yang berubah -> cek key baru di file .env kamu'
    }

    Write-Host ("      {0} file berubah" -f $changed.Count) -ForegroundColor DarkGray
    foreach ($n in $notes) {
        Write-Host "      [!] $n" -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------ ports ---

$BackendPort  = [int] (Get-EnvValue (Join-Path $BackendDir  '.env')       'APP_PORT' '8080')
$DobotPort    = [int] (Get-EnvValue (Join-Path $DobotDir    '.env')       'PORT'     '5001')
$FrontendPort = 5173
$AdminPort    = 5174

# =========================================================================
#  MODE PANE - dipanggil balik oleh window utama, satu service per pane
# =========================================================================

if ($Service) {
    $Host.UI.RawUI.WindowTitle = "glambot :: $Service"
    Update-PathFromRegistry

    switch ($Service) {

        'backend' {
            Set-Location $BackendDir
            Write-Host "=== BACKEND (Go) :$BackendPort ===" -ForegroundColor Cyan
            Write-Host "compiling..." -ForegroundColor DarkGray

            # Sengaja build+run, bukan `go run .`. `go run` bikin proses anak
            # yang tidak ikut mati waktu pane ditutup; ini satu proses saja jadi
            # Ctrl+C bersih, dan build berikutnya incremental (lebih cepat).
            $go = Get-ToolPath 'go.exe' 'Pasang Go dari https://go.dev/dl/ dan pastikan folder bin-nya masuk PATH.'
            if (-not $go) { return }

            & $go build -o 'bin\photobooth.exe' .
            if ($LASTEXITCODE -ne 0) {
                Write-Host "`n[X] go build gagal. Perbaiki error di atas lalu jalankan ulang." -ForegroundColor Red
                return
            }
            & '.\bin\photobooth.exe'
        }

        'frontend' {
            Set-Location $FrontendDir
            Write-Host "=== BOOTH (Vite) :$FrontendPort ===" -ForegroundColor Magenta
            $npm = Get-ToolPath 'npm.cmd' 'Pasang Node.js dari https://nodejs.org dan pastikan folder-nya masuk PATH.'
            if (-not $npm) { return }
            if ($Dev) {
                & $npm run dev -w @photobooth/booth -- --host 0.0.0.0
                return
            }
            if ($Clean) {
                $dist = Join-Path $FrontendDir 'apps\booth\dist'
                if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
            }
            & $npm run build -w @photobooth/booth
            if ($LASTEXITCODE -ne 0) {
                Write-Host "`n[X] booth build gagal. Perbaiki error di atas lalu jalankan ulang." -ForegroundColor Red
                return
            }
            Write-Host '  nunggu giliran:' -ForegroundColor DarkGray
            $notReady = @()
            if (-not (Wait-Port -Port $BackendPort -Label 'backend' -TimeoutSec 180)) { $notReady += 'backend' }
            if (-not (Wait-Port -Port $DobotPort -Label 'dobot' -TimeoutSec 240)) { $notReady += 'dobot' }
            if ($notReady.Count -gt 0) {
                Write-Host ("  [!] {0} belum nyala sampai batas waktu; booth tetap distart." -f ($notReady -join ' & ')) -ForegroundColor Yellow
            }
            & $npm run preview -w @photobooth/booth -- --host 0.0.0.0
        }
        'admin' {
            Set-Location $FrontendDir
            Write-Host "=== ADMIN (Vite) :$AdminPort ===" -ForegroundColor Green
            $npm = Get-ToolPath 'npm.cmd' 'Pasang Node.js dari https://nodejs.org dan pastikan folder-nya masuk PATH.'
            if (-not $npm) { return }
            # ponytail: admin pakai vite dev (tanpa build). Pindah ke build+preview kalau dipakai di luar LAN.
            & $npm run dev -w @photobooth/admin -- --host 0.0.0.0
        }
        'dobot' {
            Set-Location $DobotDir
            Write-Host "=== DOBOT (Python) :$DobotPort ===" -ForegroundColor Yellow

            # Mata rantai kedua: backend -> DOBOT -> booth.
            #
            # Bukan cuma soal urutan rapi. Dobot narik tuning robot (speed,
            # timing) dari backend saat boot lewat apply_backend_overrides().
            # Dia memang punya retry sendiri, tapi kalau backend sudah siap
            # duluan, fetch pertamanya langsung kena -> nilai yang dipakai
            # benar-benar dari DB, bukan fallback .env.
            Write-Host '  nunggu giliran:' -ForegroundColor DarkGray
            if (-not (Wait-Port -Port $BackendPort -Label 'backend' -TimeoutSec 180)) {
                Write-Host '  [!] backend belum nyala. Dobot tetap distart (retry-nya' -ForegroundColor Yellow
                Write-Host '      sendiri masih jalan), tapi tuning bisa jatuh ke .env.' -ForegroundColor Yellow
            }

            $py = Join-Path $DobotDir 'venv\Scripts\python.exe'
            if ($NoRobot) {
                Write-Host "mode: --no-robot (vision only, robot dry-run)" -ForegroundColor DarkGray
                & $py main.py --no-robot
            } else {
                & $py main.py
            }
        }
    }

    Write-Host "`n--- service '$Service' berhenti (exit $LASTEXITCODE) ---" -ForegroundColor DarkGray
    return
}

# =========================================================================
#  MODE LAUNCHER - preflight, bersih-bersih, lalu spawn 4 pane
# =========================================================================

Write-Host ''
Write-Host '  GLAMBOT PHOTO BOOTH' -ForegroundColor White
Write-Host ("  backend :{0}   booth :{1}   dobot :{2}   admin :{3}" -f $BackendPort, $FrontendPort, $DobotPort, $AdminPort) -ForegroundColor DarkGray
Write-Host ''

# --- 1. update kode dari main (sebelum apa pun, biar preflight & build lihat
#        kode yang paling baru)

Write-Host '[1/6] update kode dari main' -ForegroundColor Cyan
if ($NoPull) {
    Write-Host '      -NoPull: update dilewati' -ForegroundColor DarkGray
} else {
    Sync-FromMain
}

# --- 2. preflight: gagal cepat dengan pesan jelas, bukan 3 pane yang diam-diam mati

Write-Host '[2/6] cek prasyarat' -ForegroundColor Cyan
$problems = @()

foreach ($tool in @('go', 'npm')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        $problems += "'$tool' tidak ada di PATH"
    }
}

$required = @{
    'backend\.env'               = 'config backend (copy dari backend\.env.example)'
    'dobot\.env'                 = 'config dobot (copy dari dobot\.env.example)'
    'dobot\venv\Scripts\python.exe' = 'virtualenv dobot (cd dobot; python -m venv venv; venv\Scripts\pip install -r requirements.txt)'
}
foreach ($rel in $required.Keys) {
    if (-not (Test-Path (Join-Path $Root $rel))) {
        $problems += "$rel tidak ada -> $($required[$rel])"
    }
}

if ($problems.Count -gt 0) {
    Write-Host ''
    Write-Host '  [X] belum bisa jalan:' -ForegroundColor Red
    foreach ($p in $problems) { Write-Host "      - $p" -ForegroundColor Red }
    Write-Host ''
    exit 1
}
Write-Host '      semua ada.' -ForegroundColor Green

# --- 3. bunuh sisa proses yang masih pegang port

Write-Host '[3/6] bersihin port nyangkut' -ForegroundColor Cyan
Stop-Port -Port $BackendPort  -Label 'backend'
Stop-Port -Port $FrontendPort -Label 'frontend'
Stop-Port -Port $DobotPort    -Label 'dobot'
Stop-Port -Port $AdminPort    -Label 'admin'

# --- 4. cache

Write-Host '[4/6] bersihin cache' -ForegroundColor Cyan

# __pycache__ dobot: murah, aman dihapus tiap start.
$pycache = Get-ChildItem -Path $DobotDir -Filter '__pycache__' -Recurse -Directory -ErrorAction SilentlyContinue |
           Where-Object { $_.FullName -notlike "*\venv\*" }
foreach ($d in $pycache) { Remove-Item $d.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host ("      __pycache__ dihapus ({0} folder)" -f @($pycache).Count) -ForegroundColor DarkGray

# Profil browser: dibuang tiap start, jadi kiosk selalu ketemu asset terbaru
# tanpa harus rebuild booth yang mahal itu.
if (Test-Path $ProfileDir) {
    Remove-Item $ProfileDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '      profil browser di-reset' -ForegroundColor DarkGray
}

# --- 5. spawn pane

Write-Host '[5/6] nyalain service' -ForegroundColor Cyan
Write-Host '      urutan: backend -> dobot -> booth (tiap pane nunggu gilirannya)' -ForegroundColor DarkGray

$self  = $PSCommandPath
$flags = ''
if ($Clean)   { $flags += ' -Clean' }
if ($NoRobot) { $flags += ' -NoRobot' }
if ($Dev)     { $flags += ' -Dev' }
if ($Rebuild) { $flags += ' -Rebuild' }

# Pane dijalankan oleh proses Windows Terminal, bukan oleh skrip ini, jadi PATH
# yang dipakai buat nyari "powershell" adalah PATH milik WT -- dan WT bikin
# window baru lewat proses WT yang sudah jalan (monarch), jadi PATH-nya bisa
# warisan sesi lain yang tidak punya System32\WindowsPowerShell\v1.0. Kalau itu
# kejadian, tiap pane cuma nampilin:
#     [error 0x80070002 when launching `powershell -NoExit ... `]
# Makanya shell-nya di-resolve ke path absolut di sini, sekali, terus dipakai
# apa adanya sama semua pane -- tidak lagi bergantung ke PATH proses lain.
$PSExe = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
if (-not $PSExe -or -not (Test-Path $PSExe)) {
    $PSExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
}
if (-not (Test-Path $PSExe)) {
    Write-Host "      powershell.exe tidak ketemu ($PSExe) - tidak bisa nyalain pane" -ForegroundColor Red
    exit 1
}

function Get-PaneCommand {
    param([string] $Name)
    return "`"$PSExe`" -NoExit -NoProfile -ExecutionPolicy Bypass -File `"$self`" -Service $Name$flags"
}

$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($wt) {
    # backend kiri | booth kanan / dobot bawah | admin di samping dobot.
    # split-pane selalu memecah pane yang lagi fokus, dan fokus pindah ke pane
    # baru setelah split.
    $wtArgs = @(
        "-w new new-tab --title backend -d `"$BackendDir`" $(Get-PaneCommand 'backend')",
        "split-pane -V --title booth -d `"$FrontendDir`" $(Get-PaneCommand 'frontend')",
        "split-pane -H --title dobot -d `"$DobotDir`" $(Get-PaneCommand 'dobot')",
        "split-pane -V --title admin -d `"$FrontendDir`" $(Get-PaneCommand 'admin')"
    ) -join ' ; '

    Start-Process -FilePath $wt.Source -ArgumentList $wtArgs
    Write-Host '      Windows Terminal: 4 pane (backend | booth / dobot | admin)' -ForegroundColor DarkGray
} else {
    # Fallback kalau Windows Terminal tidak terpasang: 4 window biasa.
    Write-Host '      wt.exe tidak ada -> pakai 4 window terpisah' -ForegroundColor DarkYellow
    foreach ($s in @('backend', 'frontend', 'dobot', 'admin')) {
        Start-Process -FilePath $PSExe `
            -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$self`" -Service $s$flags"
    }
}

# --- 6. tunggu booth benar-benar melayani, lalu buka kiosk

if ($NoBrowser) {
    Write-Host '[6/6] -NoBrowser: browser tidak dibuka' -ForegroundColor Cyan
    Write-Host ("`n      buka manual: http://localhost:{0}   admin: http://localhost:{1}/admin/`n" -f $FrontendPort, $AdminPort) -ForegroundColor White
    exit 0
}

# Batas atas, bukan lama tunggu -- loop di bawah berhenti begitu booth
# membalas HTTP. Production build berjalan di booth pane.
$waitSec = if ($Dev) { 240 } else { 900 }
Write-Host ("[6/6] tunggu frontend siap (batas {0} menit)" -f [math]::Round($waitSec / 60)) -ForegroundColor Cyan

$url   = "http://localhost:$FrontendPort"
$ready = $false
# Yang dicek harus response HTTP-nya, bukan cuma port kebuka.
$deadline = (Get-Date).AddSeconds($waitSec)
Write-Host '      ' -NoNewline
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) { $ready = $true; break }
    } catch {
        # belum nyala / masih compile
    }
    Write-Host '.' -NoNewline
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    Write-Host ''
    Write-Host ("      [!] booth belum merespons dalam {0} detik. Cek pane 'booth'." -f $waitSec) -ForegroundColor Yellow
    exit 1
}
Write-Host ' siap.' -ForegroundColor Green

$chrome = Find-Chrome
if (-not $chrome) {
    Write-Host "      [!] Chrome/Edge tidak ketemu. Buka manual: $url" -ForegroundColor Yellow
    exit 0
}

$chromeArgs = @(
    '--kiosk'
    "--user-data-dir=`"$ProfileDir`""
    '--no-first-run'
    '--no-default-browser-check'
    '--disable-session-crashed-bubble'
    '--disable-infobars'
    # Kiosk memutar cue audio otomatis (storage/audio/*.mp3); tanpa flag ini
    # Chrome memblokir play() sampai ada interaksi user.
    '--autoplay-policy=no-user-gesture-required'
    $url
)

Start-Process -FilePath $chrome -ArgumentList $chromeArgs
Write-Host ''
Write-Host ("      kiosk terbuka -> {0}  (profil bersih, keluar dengan Alt+F4)" -f $url) -ForegroundColor Green
Write-Host ("      admin         -> http://localhost:{0}/admin/" -f $AdminPort) -ForegroundColor Green
Write-Host ''
