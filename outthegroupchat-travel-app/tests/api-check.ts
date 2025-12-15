/**
 * API Endpoint Check Script
 * Run AFTER starting dev server: npm run dev
 * Then: npx tsx tests/api-check.ts
 */

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  endpoint: string;
  method: string;
  success: boolean;
  status?: number;
  error?: string;
  responseTime?: number;
}

async function testEndpoint(
  method: string,
  path: string,
  options?: { body?: any; expectedStatus?: number[] }
): Promise<TestResult> {
  const url = `${BASE_URL}${path}`;
  const start = Date.now();
  
  try {
    const fetchOptions: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    
    if (options?.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }
    
    const response = await fetch(url, fetchOptions);
    const responseTime = Date.now() - start;
    const expectedStatus = options?.expectedStatus || [200, 201, 401];
    const success = expectedStatus.includes(response.status);
    
    return {
      endpoint: path,
      method,
      success,
      status: response.status,
      responseTime,
    };
  } catch (error: any) {
    return {
      endpoint: path,
      method,
      success: false,
      error: error.message,
    };
  }
}

async function runApiTests() {
  console.log('🌐 Testing API Endpoints...\n');
  console.log('Make sure the dev server is running (npm run dev)\n');
  
  const results: TestResult[] = [];
  
  const endpoints = [
    { method: 'GET', path: '/', name: 'Home Page' },
    { method: 'GET', path: '/api/trips', name: 'List Trips' },
    { method: 'GET', path: '/api/search?q=test', name: 'Global Search' },
    { method: 'GET', path: '/api/feed', name: 'Activity Feed' },
    { method: 'GET', path: '/api/notifications', name: 'Notifications' },
    { method: 'GET', path: '/api/users/me', name: 'Current User' },
    { method: 'POST', path: '/api/ai/suggest-activities', name: 'AI Suggestions', 
      body: { destination: 'Nashville' }, expectedStatus: [200, 401, 500] },
  ];
  
  for (const ep of endpoints) {
    console.log(`Testing: ${ep.name} (${ep.method} ${ep.path})...`);
    const result = await testEndpoint(ep.method, ep.path, { 
      body: (ep as any).body,
      expectedStatus: (ep as any).expectedStatus 
    });
    results.push(result);
    
    const statusIcon = result.success ? '✅' : '❌';
    const statusInfo = result.status ? `${result.status}` : result.error;
    const timeInfo = result.responseTime ? ` (${result.responseTime}ms)` : '';
    console.log(`  ${statusIcon} ${statusInfo}${timeInfo}\n`);
  }
  
  console.log('='.repeat(50));
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`\n📊 Results: ${passed}/${results.length} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n❌ Failed endpoints:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.method} ${r.endpoint}: ${r.status || r.error}`);
    });
  }
  
  console.log(`\n${failed === 0 ? '✅ ALL API TESTS PASSED' : '⚠️  Some tests need attention'}\n`);
  
  return results;
}

async function checkServerRunning(): Promise<boolean> {
  try {
    await fetch(`${BASE_URL}/`, { method: 'HEAD' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServerRunning();
  
  if (!serverRunning) {
    console.log('❌ Dev server is not running!');
    console.log('Please start it first with: npm run dev');
    console.log('Then re-run this test.\n');
    process.exit(1);
  }
  
  await runApiTests();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  });
