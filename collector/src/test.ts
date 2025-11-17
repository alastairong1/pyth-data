import { collectQuotes } from './orders.js';
import { collectPythPrices } from './pyth.js';
import { openDatabase } from './db.js';

async function test() {
  console.log('🧪 Testing collector...\n');

  try {
    // Create in-memory database for testing
    const db = openDatabase(':memory:');
    console.log('✅ Database opened\n');

    const latestBlock = 38300000; // Approximate recent block
    const startBlock = latestBlock - 100; // Test last 100 blocks

    // Test 1: Pyth price collection
    console.log(`📊 Test 1: Pyth Prices (blocks ${startBlock} to ${latestBlock})...\n`);
    const pythResult = await collectPythPrices(db, startBlock, latestBlock);
    console.log(`\n📈 Pyth Results:`);
    console.log(`  Blocks: ${startBlock} -> ${pythResult.lastBlock}`);
    console.log(`  Prices collected: ${pythResult.count}`);

    // Test 2: Quote collection
    console.log(`\n📊 Test 2: Quotes at block ${latestBlock}...\n`);
    const quoteResult = await collectQuotes(db, latestBlock);
    console.log(`\n📈 Quote Results:`);
    console.log(`  Block: ${quoteResult.blockNumber}`);
    console.log(`  Quotes collected: ${quoteResult.count}`);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY:');
    console.log(`  ✅ Pyth prices: ${pythResult.count} updates`);
    console.log(`  ✅ Quotes: ${quoteResult.count} quotes`);

    if (pythResult.count === 0 && quoteResult.count === 0) {
      console.log('\n⚠️  WARNING: No data collected (check configuration)');
    } else {
      console.log('\n✅ Test PASSED - Data collected successfully!');
    }

    db.close();
  } catch (error) {
    console.error('\n❌ Test FAILED:', error);
    process.exit(1);
  }
}

test();
