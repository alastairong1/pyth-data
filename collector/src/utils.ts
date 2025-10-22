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
    fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
  }

  try {
    const stat = fs.statSync(dir);
    const currentMode = stat.mode & 0o777;
    if (currentMode !== 0o777) {
      fs.chmodSync(dir, 0o777);
    }
  } catch (error) {
    console.warn(`Failed to ensure writable directory permissions for ${dir}:`, error);
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

export async function getBlockTimestamp(blockNumber: number, rpcUrls: string[]): Promise<number | null> {
  const blockTag = `0x${blockNumber.toString(16)}`;

  for (const url of rpcUrls) {
    try {
      const response = await axios.post<{ result?: { timestamp?: string } | null }>(
        url,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'eth_getBlockByNumber',
          params: [blockTag, false]
        },
        { timeout: 10_000 }
      );

      const timestampHex = response.data?.result?.timestamp;
      if (!timestampHex) continue;

      const parsed = Number.parseInt(timestampHex, 16);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn(
        `Failed to fetch block ${blockNumber} timestamp from ${url}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return null;
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

export function isSubgraphLagError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('has only indexed up to block');
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxDurationMs: number = 60_000,
  initialDelayMs: number = 1000
): Promise<T | null> {
  const startTime = Date.now();
  let delayMs = initialDelayMs;

  while (Date.now() - startTime < maxDurationMs) {
    try {
      return await fn();
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const remaining = maxDurationMs - elapsed;

      if (remaining <= 0) {
        console.warn('Retry timeout reached, giving up');
        return null;
      }

      const waitTime = Math.min(delayMs, remaining);
      console.warn(
        `Retry attempt failed (${elapsed}ms elapsed, ${remaining}ms remaining), waiting ${waitTime}ms before retry: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
      delayMs = Math.min(delayMs * 1.5, 10_000); // Exponential backoff, max 10s
    }
  }

  return null;
}
