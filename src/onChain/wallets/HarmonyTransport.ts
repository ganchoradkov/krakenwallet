import { DefaultApi, getHarmony } from '@/api/base/apiFactory';
import { InternalBalance, TokenMetadata, Transaction } from '@/api/types';
import { AssetMetadata } from '@/realm/assetMetadata';
import { adaptTokenReputationToRealmAssetReputation } from '@/utils/adaptTokenReputationToRealmAssetReputation';

import {
  AnyWalletKind,
  BalanceResponse,
  FeeOptions,
  NotSupportedError,
  PreparedTransaction,
  SingleAddressNetwork,
  TotalFee,
  Transport,
  WalletData,
} from './base';
import { IWalletStorage } from './walletState';

import { WrappedError } from '/helpers/errorHandler';

const getTokenMetadataDefaultFetch = async (token: InternalBalance, harmony: DefaultApi) => {
  const isMetadataComplete = (metadata?: TokenMetadata): metadata is TokenMetadata => !!metadata?.symbol && !!metadata?.label;

  let metadata = token.metadata;
  if (!isMetadataComplete(metadata)) {
    try {
      const response = await harmony.GET('/v1/tokenMetadata', {
        params: { query: { token: token.token } },
      });
      if (response.content && !('isNFT' in response.content)) {
        metadata = response.content ?? undefined;
      }
    } catch (e) {
      console.log(`error fetching token metadata: ${token.token}`, e);
    }
  }

  if (!isMetadataComplete(metadata)) {
    console.log(`skipping token because metadata incomplete: ${metadata}`);
    return undefined;
  }
  return {
    ...metadata,
    reputation: adaptTokenReputationToRealmAssetReputation(metadata.reputation),
  };
};

export class HarmonyTransport<TTransaction, TTransactionRequest, TWalletState, TNetwork extends SingleAddressNetwork = SingleAddressNetwork>
  implements Transport<TTransaction, TTransactionRequest, TWalletState, TNetwork>
{
  harmony: DefaultApi | undefined;

  async getHarmony() {
    if (!this.harmony) {
      this.harmony = await getHarmony();
    }
    return this.harmony;
  }

  estimateTransactionCost(_network: TNetwork, _wallet: WalletData, _tx: PreparedTransaction<TTransaction>, _fee: unknown): Promise<TotalFee> {
    throw new NotSupportedError();
  }

  estimateDefaultTransactionCost(_network: TNetwork, _wallet: WalletData, _store: IWalletStorage<TWalletState>, _fee: unknown): Promise<TotalFee> {
    throw new NotSupportedError();
  }

  prepareTransaction(
    _network: TNetwork,
    _walletData: WalletData,
    _data: IWalletStorage<TWalletState>,
    _transaction: TTransactionRequest,
    _fee: unknown,
  ): Promise<PreparedTransaction<TTransaction>> {
    throw new NotSupportedError();
  }

  async broadcastTransaction(network: TNetwork, signedTx: string): Promise<string> {
    const harmony = await this.getHarmony();
    const result = await harmony.POST('/v1/broadcast', {
      params: {
        query: {
          data: signedTx,
          network: network.caipId,
        },
      },
    });
    return result.content.transactionId;
  }

  async getTransactionStatus(network: TNetwork, txid: string): Promise<boolean> {
    const harmony = await this.getHarmony();
    const result = await harmony.GET('/v1/transaction', {
      params: {
        query: { network: network.caipId, transactionId: txid },
      },
    });
    return !['unknown'].includes(result.content.status);
  }

  async getFeesEstimate(network: TNetwork): Promise<FeeOptions> {
    const harmony = await this.getHarmony();
    const response = await harmony.GET('/v1/fee', { params: { query: { network: network.caipId } } });
    return { options: response.content };
  }

  async fetchBalance(
    network: TNetwork,
    wallet: AnyWalletKind,
    _data?: IWalletStorage<TWalletState>,
    getTokenMetadata?: (assetId: string) => Promise<AssetMetadata>,
  ): Promise<BalanceResponse[]> {
    let address;
    if ('address' in wallet) {
      address = wallet.address;
    } else {
      address = await network.deriveAddress(wallet);
    }

    const harmony = await getHarmony();

    let result: InternalBalance[];
    try {
      console.log(`fetching balance for "${address}" on "${network.caipId}`);
      result = (
        await harmony.GET('/v1/balances', {
          params: {
            query: {
              address: address,
              network: network.caipId,
            },
          },
        })
      ).content;
    } catch (e) {
      throw WrappedError.from(e, `Failed to fetch balance for "${address}" on "${network.caipId}": ${e}`);
    }

    const ret: BalanceResponse[] = [];

    const isMetadataComplete = (metadata?: TokenMetadata): metadata is TokenMetadata => !!metadata?.symbol && !!metadata?.label;

    const getMetadataFunc = getTokenMetadata ? (token: InternalBalance) => getTokenMetadata(token.token) : getTokenMetadataDefaultFetch;

    for (const token of result ?? []) {
      let metadata = token.metadata;
      if (!isMetadataComplete(metadata)) {
        // @ts-ignore
        metadata = await getMetadataFunc(token, harmony);
        if (!metadata) {
          continue;
        }
      }

      if (!isMetadataComplete(metadata)) {
        console.log(`skipping token because metadata incomplete: ${metadata}`);
        continue;
      }

      ret.push({
        balance: token,
        metadata,
      });
    }

    return ret;
  }

  async fetchTransactions(network: TNetwork, wallet: AnyWalletKind, store: IWalletStorage<TWalletState>, handle: (txs: Transaction[]) => Promise<boolean>) {
    const harmony = await this.getHarmony();

    let cursor: string | undefined;

    let address;
    if ('address' in wallet) {
      address = wallet.address;
    } else {
      address = await network.deriveAddress(wallet);
    }

    console.log(`[fetchTransactions] ${network.caipId}`);

    while (true) {
      console.log(`[fetchTransactions]  ${network.caipId} fetching from server, with cursor`, cursor);
      const result = await harmony.GET('/v1/transactions', {
        params: { query: { address, network: network.caipId, cursor } },
      });
      console.log(`[fetchTransactions] ${network.caipId} got results count`, result?.content.length);

      if (await handle(result?.content)) {
        console.log(`[fetchTransactions] ${network.caipId} stopping at known tx`);
        break;
      }

      if ((result?.content ?? []).length === 0) {
        console.log(`[fetchTransactions] ${network.caipId} stopping at empty`);

        break;
      }

      if (!result?.cursor) {
        console.log(`[fetchTransactions] ${network.caipId} stopping at no cursor`);
        break;
      }

      cursor = result.cursor;
    }
  }
}
