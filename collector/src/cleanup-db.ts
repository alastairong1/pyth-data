#!/usr/bin/env node
import { openDatabase } from './db.js';
import { getDatabasePath } from './config.js';
import { PYTH_TICKERS, TRACKED_TOKENS } from './config.js';

/**
 * CLI tool to remove database entries for tokens/tickers not in the configured lists.
 *
 * Usage:
 *   npm run cleanup-db          # Dry run - shows what would be deleted
 *   npm run cleanup-db --execute # Actually deletes the data
 */

const ALLOWED_PYTH_TICKERS = PYTH_TICKERS.map(t => t.ticker);
const ALLOWED_TOKEN_SYMBOLS = TRACKED_TOKENS.map(t => t.symbol);

function cleanupPythPrices(db: any, execute: boolean): number {
  // First, show which tickers will be removed
  const placeholders = ALLOWED_PYTH_TICKERS.map(() => '?').join(', ');
  const findTickersStmt = db.prepare(`
    SELECT DISTINCT ticker, COUNT(*) as count
    FROM pyth_prices
    WHERE ticker NOT IN (${placeholders})
    GROUP BY ticker
    ORDER BY ticker
  `);

  const tickersToRemove = findTickersStmt.all(...ALLOWED_PYTH_TICKERS) as { ticker: string; count: number }[];

  if (tickersToRemove.length === 0) {
    console.log('✓ pyth_prices: No entries to remove');
    return 0;
  }

  console.log('  pyth_prices tickers to remove:');
  for (const { ticker, count } of tickersToRemove) {
    console.log(`    - ${ticker}: ${count} rows`);
  }

  const totalCount = tickersToRemove.reduce((sum, t) => sum + t.count, 0);

  if (execute) {
    const deleteStmt = db.prepare(`
      DELETE FROM pyth_prices
      WHERE ticker NOT IN (${placeholders})
    `);
    const deleteResult = deleteStmt.run(...ALLOWED_PYTH_TICKERS);
    console.log(`✓ pyth_prices: Deleted ${deleteResult.changes} rows`);
    return deleteResult.changes;
  } else {
    console.log(`  pyth_prices: Would delete ${totalCount} total rows`);
    return totalCount;
  }
}

function cleanupTrades(db: any, execute: boolean): number {
  const placeholders = ALLOWED_TOKEN_SYMBOLS.map(() => '?').join(', ');

  // Find tokens to remove
  const findTokensStmt = db.prepare(`
    SELECT DISTINCT
      CASE
        WHEN input_token_symbol NOT IN (${placeholders}) THEN input_token_symbol
        WHEN output_token_symbol NOT IN (${placeholders}) THEN output_token_symbol
      END as token,
      COUNT(*) as count
    FROM trades
    WHERE input_token_symbol NOT IN (${placeholders})
       OR output_token_symbol NOT IN (${placeholders})
    GROUP BY token
    ORDER BY token
  `);

  const params = [...ALLOWED_TOKEN_SYMBOLS, ...ALLOWED_TOKEN_SYMBOLS, ...ALLOWED_TOKEN_SYMBOLS, ...ALLOWED_TOKEN_SYMBOLS];
  const tokensToRemove = findTokensStmt.all(...params) as { token: string | null; count: number }[];

  if (tokensToRemove.length === 0 || tokensToRemove.every(t => !t.token)) {
    console.log('✓ trades: No entries to remove');
    return 0;
  }

  console.log('  trades with non-tracked tokens:');
  for (const { token, count } of tokensToRemove) {
    if (token) {
      console.log(`    - ${token}: ${count} rows`);
    }
  }

  // Get total count
  const countStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM trades
    WHERE input_token_symbol NOT IN (${placeholders})
       OR output_token_symbol NOT IN (${placeholders})
  `);
  const countParams = [...ALLOWED_TOKEN_SYMBOLS, ...ALLOWED_TOKEN_SYMBOLS];
  const result = countStmt.get(...countParams) as { count: number };
  const count = result.count;

  if (execute) {
    const deleteStmt = db.prepare(`
      DELETE FROM trades
      WHERE input_token_symbol NOT IN (${placeholders})
         OR output_token_symbol NOT IN (${placeholders})
    `);
    const deleteResult = deleteStmt.run(...countParams);
    console.log(`✓ trades: Deleted ${deleteResult.changes} rows`);
    return deleteResult.changes;
  } else {
    console.log(`  trades: Would delete ${count} total rows`);
    return count;
  }
}

function cleanupQuotes(db: any, execute: boolean): number {
  const placeholders = ALLOWED_TOKEN_SYMBOLS.map(() => '?').join(', ');

  // Find tokens to remove
  const findTokensStmt = db.prepare(`
    SELECT DISTINCT
      CASE
        WHEN input_token_symbol NOT IN (${placeholders}) THEN input_token_symbol
        WHEN output_token_symbol NOT IN (${placeholders}) THEN output_token_symbol
      END as token,
      COUNT(*) as count
    FROM quotes
    WHERE input_token_symbol NOT IN (${placeholders})
       OR output_token_symbol NOT IN (${placeholders})
    GROUP BY token
    ORDER BY token
  `);

  const params = [...ALLOWED_TOKEN_SYMBOLS, ...ALLOWED_TOKEN_SYMBOLS, ...ALLOWED_TOKEN_SYMBOLS, ...ALLOWED_TOKEN_SYMBOLS];
  const tokensToRemove = findTokensStmt.all(...params) as { token: string | null; count: number }[];

  if (tokensToRemove.length === 0 || tokensToRemove.every(t => !t.token)) {
    console.log('✓ quotes: No entries to remove');
    return 0;
  }

  console.log('  quotes with non-tracked tokens:');
  for (const { token, count } of tokensToRemove) {
    if (token) {
      console.log(`    - ${token}: ${count} rows`);
    }
  }

  // Get total count
  const countStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM quotes
    WHERE input_token_symbol NOT IN (${placeholders})
       OR output_token_symbol NOT IN (${placeholders})
  `);
  const countParams = [...ALLOWED_TOKEN_SYMBOLS, ...ALLOWED_TOKEN_SYMBOLS];
  const result = countStmt.get(...countParams) as { count: number };
  const count = result.count;

  if (execute) {
    const deleteStmt = db.prepare(`
      DELETE FROM quotes
      WHERE input_token_symbol NOT IN (${placeholders})
         OR output_token_symbol NOT IN (${placeholders})
    `);
    const deleteResult = deleteStmt.run(...countParams);
    console.log(`✓ quotes: Deleted ${deleteResult.changes} rows`);
    return deleteResult.changes;
  } else {
    console.log(`  quotes: Would delete ${count} total rows`);
    return count;
  }
}

function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute') || args.includes('-x');

  const dbPath = getDatabasePath();
  console.log(`Database: ${dbPath}`);
  console.log('');

  console.log('Configured Pyth tickers:', ALLOWED_PYTH_TICKERS.join(', '));
  console.log('Configured token symbols:', ALLOWED_TOKEN_SYMBOLS.join(', '));
  console.log('');

  if (!execute) {
    console.log('DRY RUN MODE - No data will be deleted');
    console.log('Run with --execute to actually delete data');
    console.log('');
  } else {
    console.log('EXECUTE MODE - Data will be permanently deleted!');
    console.log('');
  }

  const db = openDatabase(dbPath);

  try {
    const pythDeleted = cleanupPythPrices(db, execute);
    console.log('');
    const tradesDeleted = cleanupTrades(db, execute);
    console.log('');
    const quotesDeleted = cleanupQuotes(db, execute);

    const total = pythDeleted + tradesDeleted + quotesDeleted;

    console.log('');
    if (execute) {
      console.log(`Total rows deleted: ${total}`);
    } else {
      console.log(`Total rows that would be deleted: ${total}`);
      console.log('');
      console.log('Run with --execute to delete these rows');
    }
  } finally {
    db.close();
  }
}

main();
