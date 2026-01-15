// Verify which Prisma client deepquill is using
console.log('=== Prisma Client Verification ===');
console.log('Current working directory:', process.cwd());
console.log('');

try {
  const prismaPath = require.resolve('@prisma/client');
  console.log('✅ @prisma/client resolved to:');
  console.log('   ', prismaPath);
  console.log('');
  
  // Check if it's from deepquill or agnes-next
  if (prismaPath.includes('deepquill')) {
    console.log('✅ CORRECT: Using deepquill\'s Prisma client');
  } else if (prismaPath.includes('agnes-next')) {
    console.log('❌ WRONG: Using agnes-next\'s Prisma client!');
    console.log('   This will cause schema mismatches.');
  } else {
    console.log('⚠️  WARNING: Prisma client path is unexpected');
  }
  console.log('');
  
  // Check Prisma version
  const p = require('@prisma/client');
  console.log('Prisma version:', p.Prisma.prismaVersion);
  console.log('');
  
  // Check if we can access the prisma singleton
  try {
    const { prisma } = require('./server/prisma.cjs');
    console.log('✅ Prisma singleton loaded successfully');
    console.log('   Database path:', require('./server/prisma.cjs').dbPath);
    console.log('   Datasource URL:', require('./server/prisma.cjs').datasourceUrl);
  } catch (e) {
    console.log('❌ Failed to load Prisma singleton:', e.message);
  }
} catch (e) {
  console.log('❌ Error:', e.message);
  process.exit(1);
}

