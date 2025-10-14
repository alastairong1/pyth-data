import axios from 'axios';
import { insertPythUpdates, SqliteDatabase } from './db.js';
import {
  HYPERSYNC_CLIENT,
  HYPERSYNC_FILTER_FROM,
  PYTH_CONTRACT,
  PYTH_EVENT_TOPIC,
  PYTH_TICKERS
} from './config.js';
import { DecodedPythUpdate } from './types.js';
import { hexToBigInt, unixTimestamp } from './utils.js';

interface HyperSyncLog {
  data?: string;
  topic0?: string;
  topic1?: string;
  topics?: string[];
  topics1?: string;
  block_number: number;
  transaction_hash: string;
  address: string;
}

interface HyperSyncResponse {
  data?: { logs?: HyperSyncLog[] }[];
  next_block?: number;
}

const FEED_MAP = new Map<string, string>(
  PYTH_TICKERS.map((feed) => [feed.feedId.toLowerCase(), feed.ticker])
);

function decodeTicker(log: HyperSyncLog): string | undefined {
  const candidates = [log.topics1, log.topic1];
  if (log.topics && log.topics.length > 1) {
    candidates.push(log.topics[1]);
  }
  for (const value of candidates) {
    if (!value) continue;
    const ticker = FEED_MAP.get(value.toLowerCase());
    if (ticker) return ticker;
  }
  return undefined;
}

function decodePriceFeedUpdate(log: HyperSyncLog, collectedAt: number): DecodedPythUpdate | null {
  if (!log.data || !log.topic0) return null;
  if (log.topic0.toLowerCase() !== PYTH_EVENT_TOPIC.toLowerCase()) return null;

  const ticker = decodeTicker(log);
  if (!ticker) return null;

  const dataHex = log.data.startsWith('0x') ? log.data.slice(2) : log.data;
  if (dataHex.length < 192) return null;

  const publishTime = hexToBigInt(`0x${dataHex.slice(0, 64)}`);
  const price = hexToBigInt(`0x${dataHex.slice(64, 128)}`);
  const conf = hexToBigInt(`0x${dataHex.slice(128, 192)}`);

  return {
    id: `${log.transaction_hash}:${ticker}:${publishTime.toString()}`,
    ticker,
    publishTime: Number(publishTime),
    priceRaw: price.toString(),
    confRaw: conf.toString(),
    blockNumber: log.block_number,
    transactionHash: log.transaction_hash,
    collectedAt
  };
}

export async function collectPythPrices(
  db: SqliteDatabase,
  startBlock: number,
  targetBlock: number
): Promise<{ lastBlock: number; count: number }> {
  if (startBlock > targetBlock) {
    return {
      lastBlock: startBlock,
      count: 0
    };
  }

  let currentBlock = startBlock;
  let lastProcessedBlock = startBlock;
  const collectedAt = unixTimestamp();
  const collectedUpdates: DecodedPythUpdate[] = [];

  while (currentBlock <= targetBlock) {
    try {
      const response = await axios.post<HyperSyncResponse>(HYPERSYNC_CLIENT, {
        from_block: currentBlock,
        to_block: targetBlock,
        transactions: [
          {
            from: [HYPERSYNC_FILTER_FROM],
            to: [PYTH_CONTRACT]
          }
        ],
        logs: [
          {
            address: [PYTH_CONTRACT],
            topics: [[PYTH_EVENT_TOPIC]]
          }
        ],
        field_selection: {
          log: ['block_number', 'transaction_hash', 'data', 'address', 'topic0', 'topic1'],
          block: ['number', 'timestamp']
        }
      });

      const frames = response.data.data ?? [];
      for (const frame of frames) {
        const logs = frame.logs ?? [];
        for (const log of logs) {
          const decoded = decodePriceFeedUpdate(log, collectedAt);
          if (decoded) {
            collectedUpdates.push(decoded);
            if (log.block_number > lastProcessedBlock) {
              lastProcessedBlock = log.block_number;
            }
          }
        }
      }

      const nextBlock = response.data.next_block;
      if (!nextBlock || nextBlock <= currentBlock) {
        break;
      }

      currentBlock = nextBlock;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to fetch Pyth data:', message);
      break;
    }
  }

  if (collectedUpdates.length > 0) {
    insertPythUpdates(db, collectedUpdates);
    if (lastProcessedBlock < targetBlock) {
      lastProcessedBlock = targetBlock;
    }
  } else {
    lastProcessedBlock = targetBlock;
  }

  return {
    lastBlock: lastProcessedBlock,
    count: collectedUpdates.length
  };
}
