import Database from 'better-sqlite3';
import { DecodedPythUpdate, ProcessedQuote, ProcessedTrade } from './types.js';
import { ensureDirectoryForFile } from './utils.js';

export type SqliteDatabase = Database.Database;

const METADATA_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const PYTH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS pyth_prices (
    id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    publish_time INTEGER NOT NULL,
    price_raw TEXT NOT NULL,
    conf_raw TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    transaction_hash TEXT NOT NULL,
    collected_at INTEGER NOT NULL
  );
`;

const TRADES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    order_hash TEXT NOT NULL,
    owner TEXT,
    input_token_symbol TEXT NOT NULL,
    output_token_symbol TEXT NOT NULL,
    input_token_address TEXT NOT NULL,
    output_token_address TEXT NOT NULL,
    input_token_decimals INTEGER NOT NULL,
    output_token_decimals INTEGER NOT NULL,
    input_amount_raw TEXT NOT NULL,
    output_amount_raw TEXT NOT NULL,
    input_amount REAL NOT NULL,
    output_amount REAL NOT NULL,
    price REAL,
    direction TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    transaction_hash TEXT NOT NULL,
    collected_at INTEGER NOT NULL
  );
`;

const QUOTES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    order_hash TEXT NOT NULL,
    owner TEXT NOT NULL,
    direction TEXT NOT NULL,
    price REAL NOT NULL,
    ratio_raw TEXT NOT NULL,
    max_output_raw TEXT NOT NULL,
    max_output REAL NOT NULL,
    input_token_symbol TEXT NOT NULL,
    output_token_symbol TEXT NOT NULL,
    input_token_address TEXT NOT NULL,
    output_token_address TEXT NOT NULL,
    input_token_decimals INTEGER NOT NULL,
    output_token_decimals INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    collected_at INTEGER NOT NULL
  );
`;

const QUOTES_INDEXES_SQL = [
  'CREATE INDEX IF NOT EXISTS quotes_collected_at_idx ON quotes(collected_at)',
  'CREATE INDEX IF NOT EXISTS quotes_block_number_idx ON quotes(block_number)',
  'CREATE INDEX IF NOT EXISTS quotes_order_hash_idx ON quotes(order_hash)',
  'CREATE INDEX IF NOT EXISTS idx_quotes_owner ON quotes(owner)',
  'CREATE INDEX IF NOT EXISTS idx_quotes_orderhash_collected ON quotes(order_hash, collected_at)',
  'CREATE INDEX IF NOT EXISTS idx_quotes_orderhash_maxout ON quotes(order_hash, max_output)'
];

export function openDatabase(dbPath: string): SqliteDatabase {
  ensureDirectoryForFile(dbPath);
  const originalUmask = process.umask(0o002);
  try {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 1000');
    db.pragma('foreign_keys = ON');

    db.exec(METADATA_TABLE_SQL);
    db.exec(PYTH_TABLE_SQL);
    db.exec(TRADES_TABLE_SQL);
    db.exec(QUOTES_TABLE_SQL);

    for (const indexSql of QUOTES_INDEXES_SQL) {
      db.exec(indexSql);
    }

    return db;
  } finally {
    process.umask(originalUmask);
  }
}

export function getMetadata(db: SqliteDatabase, key: string): string | undefined {
  const statement = db.prepare('SELECT value FROM metadata WHERE key = ?');
  const row = statement.get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMetadata(db: SqliteDatabase, key: string, value: string): void {
  db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  );
}

export function insertPythUpdates(db: SqliteDatabase, updates: DecodedPythUpdate[]): void {
  if (updates.length === 0) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO pyth_prices
      (id, ticker, publish_time, price_raw, conf_raw, block_number, transaction_hash, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const transaction = db.transaction((rows: DecodedPythUpdate[]) => {
    for (const row of rows) {
      insert.run(
        row.id,
        row.ticker,
        row.publishTime,
        row.priceRaw,
        row.confRaw,
        row.blockNumber,
        row.transactionHash,
        row.collectedAt
      );
    }
  });
  transaction(updates);
}

export function insertTrades(db: SqliteDatabase, trades: ProcessedTrade[]): void {
  if (trades.length === 0) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO trades (
      id, order_hash, owner, input_token_symbol, output_token_symbol, input_token_address,
      output_token_address, input_token_decimals, output_token_decimals, input_amount_raw,
      output_amount_raw, input_amount, output_amount, price, direction, block_number,
      timestamp, transaction_hash, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const transaction = db.transaction((rows: ProcessedTrade[]) => {
    for (const row of rows) {
      insert.run(
        row.id,
        row.orderHash,
        row.owner,
        row.inputTokenSymbol,
        row.outputTokenSymbol,
        row.inputTokenAddress,
        row.outputTokenAddress,
        row.inputTokenDecimals,
        row.outputTokenDecimals,
        row.inputAmountRaw,
        row.outputAmountRaw,
        row.inputAmount,
        row.outputAmount,
        row.price,
        row.direction,
        row.blockNumber,
        row.timestamp,
        row.transactionHash,
        row.collectedAt
      );
    }
  });

  transaction(trades);
}

export function insertQuotes(db: SqliteDatabase, quotes: ProcessedQuote[]): void {
  if (quotes.length === 0) return;
  const insert = db.prepare(
    `INSERT OR REPLACE INTO quotes (
      id, order_hash, owner, direction, price, ratio_raw, max_output_raw, max_output,
      input_token_symbol, output_token_symbol, input_token_address, output_token_address,
      input_token_decimals, output_token_decimals, block_number, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const transaction = db.transaction((rows: ProcessedQuote[]) => {
    for (const row of rows) {
      insert.run(
        row.quoteId,
        row.orderHash,
        row.owner,
        row.direction,
        row.price,
        row.ratioRaw,
        row.maxOutputRaw,
        row.maxOutput,
        row.inputTokenSymbol,
        row.outputTokenSymbol,
        row.inputTokenAddress,
        row.outputTokenAddress,
        row.inputTokenDecimals,
        row.outputTokenDecimals,
        row.blockNumber,
        row.collectedAt
      );
    }
  });

  transaction(quotes);
}
