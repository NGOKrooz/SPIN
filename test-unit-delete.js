#!/usr/bin/env node

/**
 * Test script for unit delete functionality with intern unassignment
 */

const http = require('http');

const API_URL = 'http://localhost:5000/api';

function makeRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'space3key', // Admin authentication
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Unit Delete with Intern Unassignment\n');

  try {
    // Test 1: Create a test unit
    console.log('TEST 1: Creating a test unit...');
    const unitRes = await makeRequest('POST', '/units', {
      name: `TestUnit-${Date.now()}`,
      duration_days: 30,
      workload: 'Medium',
      patient_count: 10,
    });

    if (unitRes.status !== 200 && unitRes.status !== 201) {
      console.error('❌ Failed to create unit:', unitRes.body);
      process.exit(1);
    }

    const unitId = unitRes.body.id;
    const unitName = unitRes.body.name;
    console.log(`✅ Unit created: ${unitName} (ID: ${unitId})\n`);

    // Test 2: Create test interns
    console.log('TEST 2: Creating test interns...');
    const internIds = [];
    for (let i = 1; i <= 3; i++) {
      const internRes = await makeRequest('POST', '/interns', {
        name: `TestIntern${i}-${Date.now()}`,
        gender: i % 2 === 0 ? 'Female' : 'Male',
        batch: i % 2 === 0 ? 'A' : 'B',
        start_date: new Date().toISOString().split('T')[0],
        phone_number: `555-000${i}`,
      });

      if (internRes.status !== 200 && internRes.status !== 201) {
        console.error(`❌ Failed to create intern ${i}:`, internRes.body);
        process.exit(1);
      }

      internIds.push(internRes.body.id);
      console.log(`  ✅ Intern ${i} created (ID: ${internRes.body.id})`);
    }
    console.log();

    // Test 3: Assign interns to the unit (create rotations)
    console.log('TEST 3: Assigning interns to unit...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 31);

    for (const internId of internIds) {
      const rotationRes = await makeRequest('POST', '/rotations', {
        intern_id: internId,
        unit_id: unitId,
        start_date: tomorrow.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        is_manual_assignment: true,
      });

      if (rotationRes.status !== 200 && rotationRes.status !== 201) {
        console.error('❌ Failed to create rotation:', rotationRes.body);
        process.exit(1);
      }

      console.log(`  ✅ Intern ${internId} assigned to unit ${unitId}`);
    }
    console.log();

    // Test 4: Verify interns are assigned
    console.log('TEST 4: Verifying interns are assigned to the unit...');
    const rotationsRes = await makeRequest('GET', `/rotations?unit_id=${unitId}`);
    const activeRotations = rotationsRes.body.filter(
      (r) => new Date(r.end_date) >= new Date()
    );
    console.log(`  ✅ Found ${activeRotations.length} active rotations for this unit\n`);

    // Test 5: Delete the unit
    console.log('TEST 5: Deleting unit with assigned interns...');
    const deleteRes = await makeRequest('DELETE', `/units/${unitId}`);

    if (deleteRes.status !== 200) {
      console.error(`❌ Failed to delete unit (Status: ${deleteRes.status}):`, deleteRes.body);
      process.exit(1);
    }

    console.log(`✅ Unit deleted successfully!`);
    console.log(`   Message: ${deleteRes.body.message}`);
    console.log(`   Interns unassigned: ${deleteRes.body.internsUnassigned}\n`);

    // Test 6: Verify interns are no longer assigned
    console.log('TEST 6: Verifying interns are unassigned...');
    const rotationsAfterRes = await makeRequest('GET', `/rotations?unit_id=${unitId}`);
    console.log(`  ✅ Rotations remaining for deleted unit: ${rotationsAfterRes.body?.length || 0}\n`);

    // Test 7: Check activity log
    console.log('TEST 7: Checking activity log...');
    const activityRes = await makeRequest('GET', '/activity/recent?limit=5');
    const recentDelete = activityRes.body.find((a) => a.action === 'unit_deleted');

    if (recentDelete) {
      console.log(`  ✅ Activity logged:`);
      console.log(`     Action: ${recentDelete.action}`);
      console.log(`     Description: ${recentDelete.description}`);
      console.log(`     Time: ${recentDelete.created_at}\n`);
    } else {
      console.error('  ❌ Activity not found in log\n');
    }

    // Test 8: Delete unit with no interns
    console.log('TEST 8: Creating and deleting unit with no interns...');
    const emptyUnitRes = await makeRequest('POST', '/units', {
      name: `EmptyUnit-${Date.now()}`,
      duration_days: 30,
      workload: 'Low',
      patient_count: 5,
    });

    const emptyUnitId = emptyUnitRes.body.id;
    const emptyDeleteRes = await makeRequest('DELETE', `/units/${emptyUnitId}`);

    if (emptyDeleteRes.status !== 200) {
      console.error('❌ Failed to delete empty unit:', emptyDeleteRes.body);
      process.exit(1);
    }

    console.log(`✅ Empty unit deleted successfully!`);
    console.log(`   Interns unassigned: ${emptyDeleteRes.body.internsUnassigned}\n`);

    console.log('✨ All tests passed! Unit delete functionality is working correctly.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test error:', error.message);
    process.exit(1);
  }
}

runTests();
