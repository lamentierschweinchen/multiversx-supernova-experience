import { Transaction, Account } from '@multiversx/sdk-core';
import { UserSecretKey } from '@multiversx/sdk-core/out/wallet/userKeys';
import { BON_CONFIG } from './types';
import { BonApiClient, getBonApi } from './bon-api';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface PoolWallet {
  account: Account;
  address: string;
  nonce: bigint;
  lockedBy: string | null; // sessionId or null
}

const DEV_MODE = process.env.NODE_ENV !== 'production' && !process.env.WALLET_PEM_0;

export class WalletPool {
  private wallets: PoolWallet[] = [];
  private sessionMap: Map<string, number> = new Map(); // sessionId -> wallet index
  private roundRobinIndex = 0;
  private bonApi: BonApiClient;
  private initialized = false;

  constructor(bonApi?: BonApiClient) {
    this.bonApi = bonApi ?? getBonApi();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (DEV_MODE) {
      console.warn('[WalletPool] DEV MODE: No real wallets loaded. Tap endpoint will return mock tx hashes.');
      this.initialized = true;
      return;
    }

    // Load wallets from environment variables first
    for (let i = 0; i < 20; i++) {
      const envKey = `WALLET_PEM_${i}`;
      const pemBase64 = process.env[envKey];
      if (!pemBase64) continue;

      try {
        const pemContent = Buffer.from(pemBase64, 'base64').toString('utf-8');
        const secretKey = UserSecretKey.fromPem(pemContent);
        const account = new Account(secretKey);
        this.wallets.push({
          account,
          address: account.address.toBech32(),
          nonce: 0n,
          lockedBy: null,
        });
      } catch (err) {
        console.error(`[WalletPool] Failed to load wallet from ${envKey}:`, err instanceof Error ? err.message : err);
      }
    }

    // Fallback: load from ./wallets/ directory for local dev
    if (this.wallets.length === 0) {
      const walletsDir = path.resolve(process.cwd(), 'wallets');
      if (fs.existsSync(walletsDir)) {
        const pemFiles = fs.readdirSync(walletsDir).filter((f) => f.endsWith('.pem')).sort();
        for (const pemFile of pemFiles) {
          try {
            const pemContent = fs.readFileSync(path.join(walletsDir, pemFile), 'utf-8');
            const secretKey = UserSecretKey.fromPem(pemContent);
            const account = new Account(secretKey);
            this.wallets.push({
              account,
              address: account.address.toBech32(),
              nonce: 0n,
              lockedBy: null,
            });
          } catch (err) {
            console.error(`[WalletPool] Failed to load ${pemFile}:`, err instanceof Error ? err.message : err);
          }
        }
      }
    }

    if (this.wallets.length === 0) {
      console.warn('[WalletPool] No wallets loaded. Tap endpoint will be unavailable.');
      this.initialized = true;
      return;
    }

    console.log(`[WalletPool] Loaded ${this.wallets.length} wallets. Fetching nonces...`);

    // Fetch current nonces from the chain
    await Promise.all(
      this.wallets.map(async (w) => {
        try {
          const accountInfo = await this.bonApi.getAccount(w.address);
          w.nonce = BigInt(accountInfo.nonce);
          w.account.nonce = BigInt(accountInfo.nonce);
        } catch (err) {
          console.error(`[WalletPool] Failed to fetch nonce for ${w.address}:`, err instanceof Error ? err.message : err);
        }
      }),
    );

    console.log(`[WalletPool] Nonces fetched. Pool ready.`);
    this.initialized = true;
  }

  acquireWallet(sessionId: string): { address: string; index: number } | null {
    // Check if session already has a wallet
    const existing = this.sessionMap.get(sessionId);
    if (existing !== undefined && this.wallets[existing]) {
      return { address: this.wallets[existing].address, index: existing };
    }

    if (DEV_MODE) {
      // In dev mode, return a fake wallet address
      this.sessionMap.set(sessionId, 0);
      return { address: 'erd1devmockwallet000000000000000000000000000000000000000s2cg80d', index: 0 };
    }

    if (this.wallets.length === 0) return null;

    // Round-robin through wallets to find an unlocked one
    const startIdx = this.roundRobinIndex;
    for (let i = 0; i < this.wallets.length; i++) {
      const idx = (startIdx + i) % this.wallets.length;
      if (this.wallets[idx].lockedBy === null) {
        this.wallets[idx].lockedBy = sessionId;
        this.sessionMap.set(sessionId, idx);
        this.roundRobinIndex = (idx + 1) % this.wallets.length;
        return { address: this.wallets[idx].address, index: idx };
      }
    }

    // All wallets locked - try to share a wallet (allow multiple sessions per wallet)
    // This is acceptable since we use nonce management to prevent conflicts
    const idx = this.roundRobinIndex;
    this.sessionMap.set(sessionId, idx);
    this.roundRobinIndex = (idx + 1) % this.wallets.length;
    return { address: this.wallets[idx].address, index: idx };
  }

  releaseWallet(sessionId: string): void {
    const idx = this.sessionMap.get(sessionId);
    if (idx !== undefined && this.wallets[idx] && this.wallets[idx].lockedBy === sessionId) {
      this.wallets[idx].lockedBy = null;
    }
    this.sessionMap.delete(sessionId);
  }

  async sendTap(sessionId: string): Promise<{ txHash: string; sentAt: number } | null> {
    if (DEV_MODE) {
      // Return a mock tx hash for local development
      const mockHash = crypto.randomBytes(32).toString('hex');
      return { txHash: mockHash, sentAt: Date.now() };
    }

    const walletIdx = this.sessionMap.get(sessionId);
    if (walletIdx === undefined || !this.wallets[walletIdx]) {
      console.error(`[WalletPool] No wallet assigned for session ${sessionId}`);
      return null;
    }

    const wallet = this.wallets[walletIdx];

    // Attempt to send, with one retry on failure
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const nonce = wallet.account.getNonceThenIncrement();

        const tx = new Transaction({
          sender: wallet.account.address,
          receiver: wallet.account.address, // self-transfer
          value: BON_CONFIG.txValue,
          gasLimit: BON_CONFIG.txGasLimit,
          chainID: BON_CONFIG.chainId,
          nonce,
          data: new Uint8Array(0),
        });

        await wallet.account.signTransaction(tx);
        const txPlain = tx.toSendable();

        const txHash = await this.bonApi.sendTransaction(txPlain);
        const sentAt = Date.now();

        return { txHash, sentAt };
      } catch (err) {
        console.error(
          `[WalletPool] sendTap attempt ${attempt + 1} failed for session ${sessionId}:`,
          err instanceof Error ? err.message : err,
        );

        if (attempt === 0) {
          // On first failure, try to re-sync nonce from network
          try {
            const accountInfo = await this.bonApi.getAccount(wallet.address);
            wallet.account.nonce = BigInt(accountInfo.nonce);
          } catch {
            // If nonce re-sync fails too, just continue to retry
          }
        }
      }
    }

    return null;
  }

  getSessionWallet(sessionId: string): string | undefined {
    if (DEV_MODE) {
      return this.sessionMap.has(sessionId)
        ? 'erd1devmockwallet000000000000000000000000000000000000000s2cg80d'
        : undefined;
    }

    const idx = this.sessionMap.get(sessionId);
    if (idx === undefined) return undefined;
    return this.wallets[idx]?.address;
  }
}

// Singleton instance
let _walletPool: WalletPool | null = null;
let _initPromise: Promise<void> | null = null;

export function getWalletPool(): WalletPool {
  if (!_walletPool) {
    _walletPool = new WalletPool();
    _initPromise = _walletPool.initialize();
  }
  return _walletPool;
}

export async function ensureWalletPoolReady(): Promise<WalletPool> {
  const pool = getWalletPool();
  if (_initPromise) {
    await _initPromise;
  }
  return pool;
}
