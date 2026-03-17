@echo off
setlocal enabledelayedexpansion

set API=http://localhost:5000/api
set ADMIN_KEY=space3key

echo ============================================
echo  SPIN System CRUD Test Suite
echo ============================================
echo.

echo [TEST 1] GET /api/units (List all units)
echo ------
curl -s -X GET "%API%/units" | findstr /C:"name" | head -5
echo.

echo [TEST 2] POST /api/units (Create new unit)
echo ------
curl -s -X POST "%API%/units" -H "Content-Type: application/json" -H "x-admin-key: %ADMIN_KEY%" -d "{\"name\":\"Rheumatology\",\"duration_days\":4,\"workload\":\"Medium\",\"patient_count\":5}"
echo.

echo [TEST 3] GET /api/settings/system (Get system settings)
echo ------
curl -s -X GET "%API%/settings/system"
echo.

echo [TEST 4] PUT /api/settings/system (Update settings)
echo ------
curl -s -X PUT "%API%/settings/system" -H "Content-Type: application/json" -H "x-admin-key: %ADMIN_KEY%" -d "{\"system_name\":\"SPIN Testing\",\"auto_rotation_enabled\":true}"
echo.

echo [TEST 5] GET /api/interns (List interns)
echo ------
curl -s -X GET "%API%/interns"
echo.

echo [TEST 6] GET /api/rotations (List rotations)
echo ------
curl -s -X GET "%API%/rotations"
echo.

echo [TEST 7] GET /api/config (Server config check)
echo ------
curl -s -X GET "%API%/config"
echo.

echo ============================================
echo  Tests Complete
echo ============================================
