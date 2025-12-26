/**
 * Setup Verification Script
 * Checks if all required configuration is in place
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying BrickLink App Setup...\n');

let hasErrors = false;

// Check 1: .env.local exists
console.log('1️⃣  Checking environment file...');
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  console.log('   ✅ .env.local found');
  
  // Read and check required vars
  const envContent = fs.readFileSync(envPath, 'utf8');
  const requiredVars = [
    'BRICKLINK_CONSUMER_KEY',
    'BRICKLINK_CONSUMER_SECRET',
    'BRICKLINK_TOKEN',
    'BRICKLINK_TOKEN_SECRET',
    'DATABASE_URL'
  ];
  
  const missingVars = requiredVars.filter(v => 
    !envContent.includes(`${v}=`) || 
    envContent.includes(`${v}=your_`) ||
    envContent.includes(`${v}=`) && envContent.split(`${v}=`)[1].split('\n')[0].trim() === ''
  );
  
  if (missingVars.length > 0) {
    console.log('   ⚠️  Missing or incomplete environment variables:');
    missingVars.forEach(v => console.log(`      - ${v}`));
    hasErrors = true;
  } else {
    console.log('   ✅ All required environment variables set');
  }
} else {
  console.log('   ❌ .env.local not found');
  console.log('   💡 Run: cp .env.example .env.local');
  hasErrors = true;
}

// Check 2: node_modules exists
console.log('\n2️⃣  Checking dependencies...');
const nodeModulesPath = path.join(process.cwd(), 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  console.log('   ✅ Dependencies installed');
} else {
  console.log('   ❌ node_modules not found');
  console.log('   💡 Run: npm install');
  hasErrors = true;
}

// Check 3: drizzle folder (migrations)
console.log('\n3️⃣  Checking database setup...');
const drizzlePath = path.join(process.cwd(), 'drizzle');
if (fs.existsSync(drizzlePath)) {
  console.log('   ✅ Migration files generated');
  console.log('   💡 Don\'t forget to run: npm run db:migrate');
} else {
  console.log('   ⚠️  Migration files not generated yet');
  console.log('   💡 Run: npm run db:generate');
}

// Check 4: Required directories
console.log('\n4️⃣  Checking project structure...');
const requiredDirs = [
  'src/app',
  'src/components',
  'src/lib',
  'src/db',
  'src/types'
];

const missingDirs = requiredDirs.filter(dir => 
  !fs.existsSync(path.join(process.cwd(), dir))
);

if (missingDirs.length === 0) {
  console.log('   ✅ Project structure complete');
} else {
  console.log('   ❌ Missing directories:', missingDirs.join(', '));
  hasErrors = true;
}

// Summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.log('❌ Setup incomplete. Please address the issues above.');
  console.log('\n📖 Quick Start Guide: See QUICKSTART.md');
  process.exit(1);
} else {
  console.log('✅ Setup verification passed!');
  console.log('\n🚀 Next steps:');
  console.log('   1. Ensure PostgreSQL is running (or Supabase is configured)');
  console.log('   2. Run migrations: npm run db:migrate');
  console.log('   3. Start dev server: npm run dev');
  console.log('   4. Open http://localhost:3000');
  console.log('\n📖 Full documentation: See README.md');
}

