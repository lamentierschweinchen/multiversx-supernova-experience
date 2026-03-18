import axios, { AxiosInstance } from 'axios';
import { BON_CONFIG, BlockData, MiniBlockData, ValidatorData } from './types';

export class BonApiClient {
  private http: AxiosInstance;
  private validatorCache: { data: ValidatorData[]; fetchedAt: number } | null = null;
  private readonly VALIDATOR_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  constructor(baseUrl: string = BON_CONFIG.apiUrl) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async getLatestBlocks(size: number = 1): Promise<BlockData[]> {
    try {
      const resp = await this.http.get('/blocks', {
        params: {
          size,
          fields: 'nonce,timestamp,round,hash,proposer,numTxs,gasConsumed,miniBlocks',
        },
      });

      const raw: unknown[] = Array.isArray(resp.data) ? resp.data : [];
      return raw.map((b: any) => this.normalizeBlock(b));
    } catch (err) {
      console.error('[BonApi] getLatestBlocks failed:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  async getBlock(nonce: number): Promise<BlockData> {
    try {
      const resp = await this.http.get(`/blocks/${nonce}`);
      const block = this.normalizeBlock(resp.data);

      // If validators not present in block response, try fetching from validators endpoint
      if (block.validators.length === 0) {
        try {
          const validators = await this.getValidators();
          block.validators = validators;
        } catch {
          // Validators are optional for display purposes
          console.warn('[BonApi] Could not enrich block with validator data');
        }
      }

      return block;
    } catch (err) {
      console.error(`[BonApi] getBlock(${nonce}) failed:`, err instanceof Error ? err.message : err);
      throw new Error(`Failed to fetch block ${nonce}`);
    }
  }

  async getTransaction(hash: string): Promise<{ blockNonce: number; blockHash: string; status: string } | null> {
    try {
      const resp = await this.http.get(`/transactions/${hash}`);
      const data = resp.data;

      if (!data) return null;

      const blockNonce = data.blockNonce ?? data.hyperblockNonce ?? 0;
      const blockHash = data.blockHash ?? data.miniBlockHash ?? '';
      const status = data.status ?? 'unknown';

      return { blockNonce, blockHash, status };
    } catch (err: any) {
      // 404 means tx not found yet (still pending)
      if (err?.response?.status === 404) {
        return null;
      }
      console.error(`[BonApi] getTransaction(${hash}) failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async getAccount(address: string): Promise<{ nonce: number; balance: string }> {
    try {
      const resp = await this.http.get(`/accounts/${address}`);
      const data = resp.data;

      return {
        nonce: data.nonce ?? 0,
        balance: data.balance ?? '0',
      };
    } catch (err) {
      console.error(`[BonApi] getAccount(${address}) failed:`, err instanceof Error ? err.message : err);
      throw new Error(`Failed to fetch account ${address}`);
    }
  }

  async sendTransaction(signedTx: object): Promise<string> {
    try {
      const resp = await this.http.post('/transactions', signedTx);
      const txHash = resp.data?.txHash ?? resp.data;

      if (typeof txHash === 'string') return txHash;
      if (typeof txHash === 'object' && txHash !== null && 'txHash' in txHash) {
        return (txHash as { txHash: string }).txHash;
      }

      console.warn('[BonApi] Unexpected sendTransaction response shape:', resp.data);
      return String(txHash);
    } catch (err) {
      console.error('[BonApi] sendTransaction failed:', err instanceof Error ? err.message : err);
      throw new Error('Failed to send transaction');
    }
  }

  async getValidators(): Promise<ValidatorData[]> {
    // Return cached data if fresh enough
    if (this.validatorCache && Date.now() - this.validatorCache.fetchedAt < this.VALIDATOR_CACHE_TTL) {
      return this.validatorCache.data;
    }

    try {
      // Try /validators first
      let resp: any;
      try {
        resp = await this.http.get('/validators');
      } catch {
        // Fallback to /nodes endpoint
        resp = await this.http.get('/nodes', {
          params: { type: 'validator', status: 'eligible', size: 200 },
        });
      }

      const raw: unknown[] = Array.isArray(resp.data) ? resp.data : [];
      const validators: ValidatorData[] = raw.map((v: any) => ({
        blsKey: v.bls ?? v.blsKey ?? v.publicKey ?? '',
        shard: v.shard ?? v.shardId ?? 0,
      })).filter((v) => v.blsKey.length > 0);

      this.validatorCache = { data: validators, fetchedAt: Date.now() };
      return validators;
    } catch (err) {
      console.error('[BonApi] getValidators failed:', err instanceof Error ? err.message : err);
      return this.validatorCache?.data ?? [];
    }
  }

  private normalizeBlock(raw: any): BlockData {
    if (!raw || typeof raw !== 'object') {
      console.warn('[BonApi] Unexpected block shape:', raw);
      return {
        nonce: 0,
        round: 0,
        hash: '',
        proposer: '',
        timestamp: 0,
        txCount: 0,
        gasConsumed: 0,
        miniBlocks: [],
        validators: [],
      };
    }

    const miniBlocks: MiniBlockData[] = Array.isArray(raw.miniBlocks)
      ? raw.miniBlocks.map((mb: any) => ({
          hash: mb.hash ?? '',
          senderShard: mb.senderShard ?? mb.sourceShard ?? 0,
          receiverShard: mb.receiverShard ?? mb.destinationShard ?? 0,
          txCount: mb.txCount ?? mb.numTxs ?? 0,
          type: mb.type ?? 'TxBlock',
        }))
      : [];

    const validators: ValidatorData[] = Array.isArray(raw.validators)
      ? raw.validators.map((v: any) => ({
          blsKey: typeof v === 'string' ? v : (v.bls ?? v.blsKey ?? ''),
          shard: typeof v === 'string' ? -1 : (v.shard ?? 0),
        }))
      : [];

    return {
      nonce: raw.nonce ?? 0,
      round: raw.round ?? 0,
      hash: raw.hash ?? '',
      proposer: raw.proposer ?? '',
      timestamp: raw.timestamp ?? 0,
      txCount: raw.txCount ?? raw.numTxs ?? 0,
      gasConsumed: raw.gasConsumed ?? 0,
      miniBlocks,
      validators,
    };
  }
}

// Singleton instance
let _bonApi: BonApiClient | null = null;

export function getBonApi(): BonApiClient {
  if (!_bonApi) {
    _bonApi = new BonApiClient();
  }
  return _bonApi;
}
