/**
 * Test script to verify autorotation functionality
 * Tests both the helper function and the actual rotation advancement
 */

const ADMIN_KEY = process.env.ADMIN_PASSWORD || 'space3key';
const BASE_URL = process.env.API_URL || 'http://localhost:5000/api';

// Test the helper function
const { isAutoRotationEnabled } = require('./server/utils/autoRotation');

console.log('🧪 Testing AUTO_ROTATION helper function...\n');

// Test cases
const testCases = [
  { env: undefined, expected: true, name: 'undefined (should default to true)' },
  { env: null, expected: true, name: 'null (should default to true)' },
  { env: 'true', expected: true, name: 'string "true"' },
  { env: 'True', expected: true, name: 'string "True" (case insensitive)' },
  { env: 'TRUE', expected: true, name: 'string "TRUE"' },
  { env: '1', expected: true, name: 'string "1"' },
  { env: true, expected: true, name: 'boolean true' },
  { env: 'false', expected: false, name: 'string "false"' },
  { env: 'False', expected: false, name: 'string "False"' },
  { env: 'FALSE', expected: false, name: 'string "FALSE"' },
  { env: '0', expected: false, name: 'string "0"' },
  { env: false, expected: false, name: 'boolean false' },
  { env: '', expected: false, name: 'empty string' },
];

let passed = 0;
let failed = 0;

testCases.forEach(({ env, expected, name }) => {
  const originalEnv = process.env.AUTO_ROTATION;
  if (env === undefined) {
    delete process.env.AUTO_ROTATION;
  } else if (env === null) {
    process.env.AUTO_ROTATION = null;
  } else {
    process.env.AUTO_ROTATION = env;
  }
  
  const result = isAutoRotationEnabled();
  const success = result === expected;
  
  if (success) {
    console.log(`✅ ${name}: ${result} (expected ${expected})`);
    passed++;
  } else {
    console.log(`❌ ${name}: ${result} (expected ${expected})`);
    failed++;
  }
  
  // Restore original
  if (originalEnv === undefined) {
    delete process.env.AUTO_ROTATION;
  } else {
    process.env.AUTO_ROTATION = originalEnv;
  }
});

console.log(`\n📊 Helper function tests: ${passed} passed, ${failed} failed\n`);

// Test actual API endpoint
async function testAutoRotationAPI() {
  console.log('🧪 Testing autorotation via API...\n');
  
  const request = async (path, options = {}) => {
    const { body, headers, ...rest } = options;

    const response = await fetch(`${BASE_URL}${path}`, {
      method: rest.method || 'GET',
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_KEY,
        ...(headers || {}),
      },
      body: body !== undefined && body !== null && typeof body !== 'string' ? JSON.stringify(body) : body,
    });

    let data = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = text;
      }
    }

    return { status: response.status, data };
  };

  try {
    // 1. Check config endpoint
    console.log('1. Checking config endpoint for autoRotationEnabled...');
    const configRes = await request('/config');
    if (configRes.status === 200 && configRes.data.autoRotationEnabled !== undefined) {
      console.log(`   ✅ Config shows autoRotationEnabled: ${configRes.data.autoRotationEnabled}`);
    } else {
      console.log(`   ❌ Config endpoint failed or missing autoRotationEnabled`);
      return;
    }

    // 2. Check if there are any interns
    console.log('\n2. Checking for active interns...');
    const internsRes = await request('/interns?status=Active');
    if (internsRes.status !== 200 || !Array.isArray(internsRes.data)) {
      console.log('   ❌ Failed to fetch interns');
      return;
    }
    
    const activeInterns = internsRes.data.filter(i => i.status === 'Active' || i.status === 'Extended');
    console.log(`   ℹ️  Found ${activeInterns.length} active/extended interns`);
    
    if (activeInterns.length === 0) {
      console.log('   ⚠️  No active interns to test autorotation with');
      return;
    }

    // 3. Test schedule endpoint (should trigger autorotation)
    console.log(`\n3. Testing schedule endpoint for intern ${activeInterns[0].id}...`);
    const scheduleRes1 = await request(`/interns/${activeInterns[0].id}/schedule`);
    if (scheduleRes1.status === 200) {
      console.log(`   ✅ Schedule fetched successfully (${scheduleRes1.data.length} rotations)`);
    } else {
      console.log(`   ❌ Failed to fetch schedule: ${scheduleRes1.status}`);
      return;
    }

    // 4. Check current rotations endpoint (should trigger autorotation)
    console.log('\n4. Testing current rotations endpoint (should trigger autorotation)...');
    const currentRes = await request('/rotations/current');
    if (currentRes.status === 200) {
      console.log(`   ✅ Current rotations fetched successfully`);
      if (Array.isArray(currentRes.data)) {
        console.log(`   ℹ️  Found ${currentRes.data.length} current rotations`);
      }
    } else {
      console.log(`   ❌ Failed to fetch current rotations: ${currentRes.status}`);
    }

    // 5. Test manual auto-advance endpoint
    console.log('\n5. Testing manual auto-advance endpoint...');
    const advanceRes = await request('/rotations/auto-advance', { method: 'POST' });
    if (advanceRes.status === 200) {
      console.log(`   ✅ Auto-advance completed successfully`);
      if (advanceRes.data) {
        console.log(`   ℹ️  Result:`, JSON.stringify(advanceRes.data, null, 2));
      }
    } else {
      console.log(`   ❌ Auto-advance failed: ${advanceRes.status}`, advanceRes.data);
    }

    // 6. Check schedule again to see if new rotations were created
    console.log(`\n6. Checking schedule again for new rotations...`);
    const scheduleRes2 = await request(`/interns/${activeInterns[0].id}/schedule`);
    if (scheduleRes2.status === 200) {
      const rotationCount2 = scheduleRes2.data.length;
      console.log(`   ✅ Schedule fetched (${rotationCount2} rotations)`);
      if (rotationCount2 > scheduleRes1.data.length) {
        console.log(`   ✅ New rotations created! (was ${scheduleRes1.data.length}, now ${rotationCount2})`);
      } else {
        console.log(`   ℹ️  No new rotations (may already be up to date)`);
      }
    }

    console.log('\n✅ Autorotation API tests completed!\n');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  }
}

// Run API tests if BASE_URL is not localhost (or if explicitly requested)
if (BASE_URL.includes('localhost') || process.env.TEST_API === 'true') {
  // Check if fetch is available (Node 18+)
  if (typeof fetch === 'undefined') {
    console.log('⚠️  fetch not available. Install node-fetch or use Node 18+ for API tests.\n');
    console.log('   Helper function tests completed above.\n');
  } else {
    testAutoRotationAPI().catch(err => {
      console.error('❌ API test error:', err);
      process.exitCode = 1;
    });
  }
} else {
  console.log('ℹ️  Skipping API tests (set TEST_API=true to run them)\n');
}

if (failed > 0) {
  process.exitCode = 1;
}

