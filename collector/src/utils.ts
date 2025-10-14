import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { formatUnits } from 'ethers';
import { Token } from './types.js';

export function hexToBigInt(value: string | null | undefined): bigint {
  if (!value) return 0n;
  const normalized = value.startsWith('0x') ? value : `0x${value}`;
  try {
    return BigInt(normalized);
  } catch {
    return 0n;
  }
}

export function formatAmount(amount: bigint, decimals: number): number {
  try {
    return Number.parseFloat(formatUnits(amount, decimals));
  } catch {
    return 0;
  }
}

export function ensureDirectoryForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function getLatestBlockNumber(rpcUrls: string[]): Promise<number> {
  for (const url of rpcUrls) {
    try {
      const response = await axios.post<{ result: string }>(
        url,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'eth_blockNumber',
          params: []
        },
        { timeout: 10_000 }
      );
      const hex = response.data?.result;
      if (!hex) continue;
      return Number.parseInt(hex, 16);
    } catch (error) {
      console.warn(`Failed to get latest block from ${url}:`, error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error('Unable to fetch latest block number from any RPC endpoint');
}

export function getTokenByAddress(address: string, tokens: Token[]): Token | undefined {
  const target = address.toLowerCase();
  return tokens.find((token) => token.address.toLowerCase() === target);
}

export function buildQuoteId(orderHash: string, inputIndex: number, outputIndex: number, blockNumber: number): string {
  return `${orderHash}:${inputIndex}:${outputIndex}:${blockNumber}`;
}

export function unixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function parseNumber(value: string | number | undefined | null): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
