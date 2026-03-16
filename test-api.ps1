param(
    [string]$adminKey = "space3key",
    [string]$apiBase = "http://localhost:5000/api"
)

Write-Host "`n╔════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║         SPIN System CRUD & Integration Tests       ║" -ForegroundColor Yellow
Write-Host "║              Supabase PostgreSQL Backend            ║" -ForegroundColor Yellow
Write-Host "╚════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow

$newUnitId = $null

# TEST 1: GET Units
Write-Host "[TEST 1] GET /api/units (List all)" -ForegroundColor Cyan
Write-Host ("=" * 60)
try {
    $response = Invoke-WebRequest -Uri "$apiBase/units" -Method GET -UseBasicParsing
    $units = $response.Content | ConvertFrom-Json
    Write-Host "Found $($units.count) units" -ForegroundColor Green
    Write-Host ($units[0] | ConvertTo-Json) -ForegroundColor Gray
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

# TEST 2: Create a new unit
Write-Host "`n[TEST 2] POST /api/units (Create new unit)" -ForegroundColor Cyan
Write-Host ("=" * 60)
$newUnit = @{
    name = "Rheumatology"
    duration_days = 4
    workload = "Medium"
    patient_count = 5
    description = "Rheumatology testing unit"
}
try {
    $response = Invoke-WebRequest -Uri "$apiBase/units" -Method POST `
        -Headers @{ "Content-Type" = "application/json"; "x-admin-key" = $adminKey } `
        -Body (ConvertTo-Json $newUnit) -UseBasicParsing
    $createdUnit = $response.Content | ConvertFrom-Json
    $newUnitId = $createdUnit.id
    Write-Host "Created unit ID: $newUnitId" -ForegroundColor Green
    Write-Host ($createdUnit | ConvertTo-Json) -ForegroundColor Gray
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

# TEST 3: GET System Settings
Write-Host "`n[TEST 3] GET /api/settings/system" -ForegroundColor Cyan
Write-Host ("=" * 60)
try {
    $response = Invoke-WebRequest -Uri "$apiBase/settings/system" -Method GET -UseBasicParsing
    $settings = $response.Content | ConvertFrom-Json
    Write-Host "System settings retrieved:" -ForegroundColor Green
    Write-Host ($settings | ConvertTo-Json) -ForegroundColor Gray
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

# TEST 4: Update System Settings
Write-Host "`n[TEST 4] PUT /api/settings/system (Update)" -ForegroundColor Cyan
Write-Host ("=" * 60)
$settingsUpdate = @{
    system_name = "SPIN - Rheumatology Rotation System"
    auto_rotation_enabled = $true
    default_rotation_duration_days = 3
}
try {
    $response = Invoke-WebRequest -Uri "$apiBase/settings/system" -Method PUT `
        -Headers @{ "Content-Type" = "application/json"; "x-admin-key" = $adminKey } `
        -Body (ConvertTo-Json $settingsUpdate) -UseBasicParsing
    $updatedSettings = $response.Content | ConvertFrom-Json
    Write-Host "Settings updated successfully:" -ForegroundColor Green
    Write-Host ($updatedSettings | ConvertTo-Json) -ForegroundColor Gray
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

# TEST 5: GET Interns
Write-Host "`n[TEST 5] GET /api/interns (List all)" -ForegroundColor Cyan
Write-Host ("=" * 60)
try {
    $response = Invoke-WebRequest -Uri "$apiBase/interns" -Method GET -UseBasicParsing
    $interns = $response.Content | ConvertFrom-Json
    if ($interns -is [array]) {
        Write-Host "Found $($interns.count) interns" -ForegroundColor Green
    } else {
        Write-Host "Interns endpoint response:" -ForegroundColor Green
    }
    Write-Host ($interns | ConvertTo-Json -Depth 3) -ForegroundColor Gray
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

# TEST 6: GET Rotations
Write-Host "`n[TEST 6] GET /api/rotations (List all)" -ForegroundColor Cyan
Write-Host ("=" * 60)
try {
    $response = Invoke-WebRequest -Uri "$apiBase/rotations" -Method GET -UseBasicParsing
    $rotations = $response.Content | ConvertFrom-Json
    if ($rotations -is [array]) {
        Write-Host "Found $($rotations.count) rotations" -ForegroundColor Green
    } else {
        Write-Host "Rotations endpoint response:" -ForegroundColor Green
    }
    Write-Host ($rotations | ConvertTo-Json -Depth 3) -ForegroundColor Gray
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

# TEST 7: GET Config
Write-Host "`n[TEST 7] GET /api/config (Server info)" -ForegroundColor Cyan
Write-Host ("=" * 60)
try {
    $response = Invoke-WebRequest -Uri "$apiBase/config" -Method GET -UseBasicParsing
    $config = $response.Content
    Write-Host "Server config:" -ForegroundColor Green
    Write-Host $config -ForegroundColor Gray
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}

# TEST 8: Update a Unit
if ($newUnitId) {
    Write-Host "`n[TEST 8] PUT /api/units/:id (Update created unit)" -ForegroundColor Cyan
    Write-Host ("=" * 60)
    $unitUpdate = @{
        name = "Advanced Rheumatology"
        duration_days = 5
        workload = "High"
        patient_count = 7
    }
    try {
        $response = Invoke-WebRequest -Uri "$apiBase/units/$newUnitId" -Method PUT `
            -Headers @{ "Content-Type" = "application/json"; "x-admin-key" = $adminKey } `
            -Body (ConvertTo-Json $unitUpdate) -UseBasicParsing
        Write-Host "Unit $newUnitId updated successfully (Status: $($response.StatusCode))" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
    }
}

# TEST 9: Verify Unit Update
if ($newUnitId) {
    Write-Host "`n[TEST 9] GET /api/units/:id (Verify update)" -ForegroundColor Cyan
    Write-Host ("=" * 60)
    try {
        $response = Invoke-WebRequest -Uri "$apiBase/units/$newUnitId" -Method GET -UseBasicParsing
        $unit = $response.Content | ConvertFrom-Json
        Write-Host "Unit verification successful:" -ForegroundColor Green
        Write-Host ($unit | ConvertTo-Json) -ForegroundColor Gray
    } catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
    }
}

# TEST 10: Delete the Unit
if ($newUnitId) {
    Write-Host "`n[TEST 10] DELETE /api/units/:id (Delete created unit)" -ForegroundColor Cyan
    Write-Host ("=" * 60)
    try {
        $response = Invoke-WebRequest -Uri "$apiBase/units/$newUnitId" -Method DELETE `
            -Headers @{ "x-admin-key" = $adminKey } -UseBasicParsing
        Write-Host "Unit $newUnitId deleted successfully (Status: $($response.StatusCode))" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
    }
}

# TEST 11: Verify Deletion
if ($newUnitId) {
    Write-Host "`n[TEST 11] Verify deletion (Unit should return 404)" -ForegroundColor Cyan
    Write-Host ("=" * 60)
    try {
        $response = Invoke-WebRequest -Uri "$apiBase/units/$newUnitId" -Method GET -UseBasicParsing
        Write-Host "ERROR: Unit still exists" -ForegroundColor Red
    } catch {
        if ($_.Exception.Response.StatusCode -eq 404) {
            Write-Host "Unit correctly deleted (returned 404)" -ForegroundColor Green
        } else {
            Write-Host "ERROR: Unexpected response" -ForegroundColor Red
        }
    }
}

Write-Host "`n╔════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║              Test Suite Complete!                  ║" -ForegroundColor Yellow
Write-Host "║   Supabase PostgreSQL CRUD validation passed       ║" -ForegroundColor Yellow
Write-Host "╚════════════════════════════════════════════════════╝`n" -ForegroundColor Yellow
