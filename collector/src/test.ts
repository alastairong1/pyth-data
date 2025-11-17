import { collectQuotes } from './orders.js';
import { openDatabase } from './db.js';

async function test() {
  console.log('🧪 Testing collector...\n');

  try {
    // Create in-memory database for testing
    const db = openDatabase(':memory:');
    console.log('✅ Database opened\n');

    // Test quote collection at a recent block
    const latestBlock = 38300000; // Approximate recent block
    console.log(`📊 Testing quote collection at block ${latestBlock}...\n`);

    const result = await collectQuotes(db, latestBlock);

    console.log('\n📈 Results:');
    console.log(`  Block: ${result.blockNumber}`);
    console.log(`  Quotes collected: ${result.count}`);

    if (result.count > 0) {
      console.log('\n✅ Test PASSED - Quotes collected successfully!');
    } else {
      console.log('\n⚠️  Test WARNING - No quotes found (this may be normal if no active orders)');
    }

    db.close();
  } catch (error) {
    console.error('\n❌ Test FAILED:', error);
    process.exit(1);
  }
}

test();
