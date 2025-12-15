/**
 * System Check Script
 * Run with: npx tsx tests/system-check.ts
 */

async function testDatabaseConnection() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const userCount = await prisma.user.count();
    await prisma.$disconnect();
    return { success: true, userCount };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function testPrismaSchema() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const models = ['user', 'trip', 'activity', 'tripSurvey', 'notification'];
    const results: Record<string, boolean> = {};
    
    for (const model of models) {
      try {
        // @ts-ignore - dynamic access
        await prisma[model].findFirst();
        results[model] = true;
      } catch (e: any) {
        results[model] = false;
      }
    }
    
    await prisma.$disconnect();
    return { success: Object.values(results).every(v => v), results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function testTypeImports() {
  const imports: Record<string, boolean> = {};
  
  try {
    await import('../src/types/index');
    imports['types/index'] = true;
  } catch (e: any) {
    imports['types/index'] = false;
  }
  
  try {
    await import('../src/lib/prisma');
    imports['lib/prisma'] = true;
  } catch (e: any) {
    imports['lib/prisma'] = false;
  }
  
  try {
    await import('../src/lib/ai/client');
    imports['lib/ai/client'] = true;
  } catch (e: any) {
    imports['lib/ai/client'] = false;
  }
  
  return { success: Object.values(imports).every(v => v), imports };
}

async function runAllTests() {
  console.log('🔍 Running System Checks...\n');
  
  const results: Record<string, any> = {};
  
  console.log('1. Testing Type Imports...');
  results.imports = await testTypeImports();
  console.log(`   ${results.imports.success ? '✅' : '❌'} Imports: ${JSON.stringify(results.imports.imports)}`);
  
  console.log('\n2. Testing Database Connection...');
  results.database = await testDatabaseConnection();
  console.log(`   ${results.database.success ? '✅' : '❌'} Database: ${results.database.success ? `Connected (${results.database.userCount} users)` : results.database.error}`);
  
  console.log('\n3. Testing Prisma Schema Models...');
  results.schema = await testPrismaSchema();
  console.log(`   ${results.schema.success ? '✅' : '❌'} Schema: ${JSON.stringify(results.schema.results || results.schema.error)}`);
  
  console.log('\n' + '='.repeat(50));
  const allPassed = Object.values(results).every((r: any) => r.success);
  console.log(`\n${allPassed ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'}\n`);
  
  return results;
}

runAllTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  });
