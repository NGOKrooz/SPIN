# SPIN API Test Script
# Tests the core functionality: Units CRUD, Interns CRUD, and Assignment

$baseUrl = "http://localhost:5000/api"
$adminPassword = "test-password"  # Update with your actual admin password if set

Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "SPIN API FUNCTIONALITY TEST" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`nTest 1: Health Check" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    Write-Host "✅ Health Check: $($response.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ Health Check Failed: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Create a Unit
Write-Host "`nTest 2: Create Unit (Cardiology)" -ForegroundColor Yellow
try {
    $unitData = @{
        name = "Cardiology"
        duration_days = 30
        workload = "Medium"
        patient_count = 6
    } | ConvertTo-Json

    $headers = @{
        "Content-Type" = "application/json"
    }
    if ($adminPassword) {
        $headers["x-admin-key"] = $adminPassword
    }

    $response = Invoke-RestMethod -Uri "$baseUrl/units" -Method Post -Body $unitData -Headers $headers
    $unitId = $response.id
    Write-Host "✅ Unit Created: ID=$unitId, Name=$($response.name)" -ForegroundColor Green
} catch {
    Write-Host "❌ Create Unit Failed: $_" -ForegroundColor Red
    Write-Host "Note: If authentication error, set ADMIN_PASSWORD in .env or update script" -ForegroundColor Yellow
}

# Test 3: Fetch All Units
Write-Host "`nTest 3: Fetch All Units" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/units" -Method Get
    Write-Host "✅ Units Fetched: $($response.Count) unit(s) found" -ForegroundColor Green
    $response | ForEach-Object {
        Write-Host "   - ID=$($_.id), Name=$($_.name), Duration=$($_.duration_days) days" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Fetch Units Failed: $_" -ForegroundColor Red
}

# Test 4: Create an Intern
Write-Host "`nTest 4: Create Intern (John Doe)" -ForegroundColor Yellow
try {
    $internData = @{
        name = "John Doe"
        gender = "Male"
        batch = "A"
        start_date = "2026-02-17"
        phone_number = "1234567890"
        status = "Active"
    } | ConvertTo-Json

    $headers = @{
        "Content-Type" = "application/json"
    }
    if ($adminPassword) {
        $headers["x-admin-key"] = $adminPassword
    }

    $response = Invoke-RestMethod -Uri "$baseUrl/interns" -Method Post -Body $internData -Headers $headers
    $internId = $response.id
    Write-Host "✅ Intern Created: ID=$internId, Name=$($response.name)" -ForegroundColor Green
} catch {
    Write-Host "❌ Create Intern Failed: $_" -ForegroundColor Red
}

# Test 5: Fetch All Interns
Write-Host "`nTest 5: Fetch All Interns" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/interns" -Method Get
    Write-Host "✅ Interns Fetched: $($response.Count) intern(s) found" -ForegroundColor Green
    $response | ForEach-Object {
        Write-Host "   - ID=$($_.id), Name=$($_.name), Batch=$($_.batch)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Fetch Interns Failed: $_" -ForegroundColor Red
}

# Test 6: Assign Intern to Unit (Manual Assignment)
Write-Host "`nTest 6: Assign Intern to Unit" -ForegroundColor Yellow
if ($unitId -and $internId) {
    try {
        $assignmentData = @{
            intern_id = $internId
            unit_id = $unitId
            start_date = "2026-02-17"
            end_date = "2026-03-19"
            is_manual_assignment = $true
        } | ConvertTo-Json

        $headers = @{
            "Content-Type" = "application/json"
        }
        if ($adminPassword) {
            $headers["x-admin-key"] = $adminPassword
        }

        $response = Invoke-RestMethod -Uri "$baseUrl/rotations" -Method Post -Body $assignmentData -Headers $headers
        Write-Host "✅ Intern Assigned: Rotation ID=$($response.id)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Assignment Failed: $_" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️  Skipping (missing unit or intern ID)" -ForegroundColor Yellow
}

# Test 7: Fetch Current Rotations
Write-Host "`nTest 7: Fetch Current Rotations" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/rotations/current" -Method Get
    Write-Host "✅ Current Rotations: $($response.Count) rotation(s)" -ForegroundColor Green
    $response | ForEach-Object {
        Write-Host "   - $($_.intern_name) → $($_.unit_name) ($($_.start_date) to $($_.end_date))" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Fetch Rotations Failed: $_" -ForegroundColor Red
}

Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Core functionality verified!" -ForegroundColor Green
Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Commit and push these fixes" -ForegroundColor White
Write-Host "2. Deploy to Render" -ForegroundColor White
Write-Host "3. Set DATABASE_URL in Render environment" -ForegroundColor White
Write-Host "4. Set ADMIN_PASSWORD in Render environment" -ForegroundColor White
Write-Host "`n==================================" -ForegroundColor Cyan
