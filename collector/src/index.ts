import dotenv from 'dotenv';
import { collectPythPrices } from './pyth.js';
import { collectQuotes } from './orders.js';
import { collectTrades } from './trades.js';
import {
  getDatabasePath,
  getInitialPythBlock,
  getInitialTradeTimestamp,
  getQuoteSnapshotInterval,
  NETWORK_CONFIG
} from './config.js';
import { getLatestBlockNumber, unixTimestamp } from './utils.js';
import { getMetadata, openDatabase, setMetadata } from './db.js';

dotenv.config();

async function main(): Promise<void> {
  const dbPath = getDatabasePath();
  const db = openDatabase(dbPath);
  const nowTimestamp = unixTimestamp();

  try {
    const latestBlock = await getLatestBlockNumber(NETWORK_CONFIG.fallbackRpcUrls);

    const storedPythBlock = getMetadata(db, 'last_pyth_block');
    const pythStartBlock = storedPythBlock ? Number.parseInt(storedPythBlock, 10) : getInitialPythBlock();
    const pythResult = await collectPythPrices(db, pythStartBlock, latestBlock);
    setMetadata(db, 'last_pyth_block', String(pythResult.lastBlock));
    console.log(
      `Collected ${pythResult.count} Pyth price updates (blocks ${pythStartBlock} -> ${pythResult.lastBlock})`
    );

    const storedTradeTimestamp = getMetadata(db, 'last_trade_timestamp');
    const tradeStartTimestamp = storedTradeTimestamp
      ? Number.parseInt(storedTradeTimestamp, 10)
      : getInitialTradeTimestamp();
    const tradeResult = await collectTrades(db, tradeStartTimestamp, nowTimestamp);
    setMetadata(db, 'last_trade_timestamp', String(tradeResult.lastTimestamp));
    console.log(
      `Collected ${tradeResult.count} trades (timestamps ${tradeStartTimestamp} -> ${tradeResult.lastTimestamp})`
    );

    const storedQuoteBlock = getMetadata(db, 'last_quote_block');
    const lastQuoteBlock = storedQuoteBlock ? Number.parseInt(storedQuoteBlock, 10) : undefined;
    const quoteInterval = getQuoteSnapshotInterval();

    const quoteBlocks: number[] = [];
    if (quoteInterval > 0) {
      let nextBlock = lastQuoteBlock !== undefined ? lastQuoteBlock + quoteInterval : latestBlock - (latestBlock % quoteInterval);
      if (nextBlock <= 0) {
        nextBlock = quoteInterval;
      }

      while (nextBlock <= latestBlock) {
        quoteBlocks.push(nextBlock);
        nextBlock += quoteInterval;
      }

      if (quoteBlocks.length === 0 && lastQuoteBlock === undefined) {
        quoteBlocks.push(latestBlock);
      }
    } else {
      quoteBlocks.push(latestBlock);
    }

    for (const block of quoteBlocks) {
      const quoteResult = await collectQuotes(db, block);
      setMetadata(db, 'last_quote_block', String(quoteResult.blockNumber));
      console.log(`Collected ${quoteResult.count} quotes at block ${quoteResult.blockNumber}`);
    }

    setMetadata(db, 'last_run_at', String(nowTimestamp));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Collector failed:', message);
  process.exitCode = 1;
});
