/**
 * Offline Database — WebWaka Real Estate Suite
 *
 * Invariant 4: Offline First
 * Invariant 2: Mobile First
 *
 * Uses Dexie (IndexedDB wrapper) for client-side offline storage.
 * All mutations are queued when offline and synced to D1 when connectivity is restored.
 * This pattern ensures agents and tenants can work in low-connectivity Nigerian environments.
 */

import Dexie, { type Table } from 'dexie';

// ─── Offline Data Models ──────────────────────────────────────────────────────

export interface OfflineProperty {
  id?: number;
  serverId?: string;
  tenantId: string;
  title: string;
  type: 'residential' | 'commercial' | 'land' | 'industrial';
  listingType: 'sale' | 'rent' | 'shortlet';
  priceKobo: number; // Invariant 5: Nigeria First — always kobo integers
  currency: 'NGN' | 'USD' | 'GBP' | 'EUR';
  location: string;
  state: string; // Nigerian state
  lga: string;
  bedrooms?: number;
  bathrooms?: number;
  sizeM2?: number;
  description: string;
  syncStatus: 'pending' | 'synced' | 'failed';
  updatedAt: string;
}

export interface OfflineTenancy {
  id?: number;
  serverId?: string;
  tenantId: string;
  propertyId: string;
  tenantName: string;
  tenantPhone: string;
  startDate: string;
  endDate: string;
  rentKobo: number; // Invariant 5: Nigeria First — always kobo integers
  depositKobo: number;
  status: 'active' | 'expired' | 'terminated';
  syncStatus: 'pending' | 'synced' | 'failed';
  updatedAt: string;
}

export interface MutationQueueItem {
  id?: number;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  payload: string; // JSON string
  tenantId: string;
  createdAt: string;
  retryCount: number;
}

// ─── Dexie Database ───────────────────────────────────────────────────────────

export class WebWakaRealEstateDB extends Dexie {
  properties!: Table<OfflineProperty>;
  tenancies!: Table<OfflineTenancy>;
  mutationQueue!: Table<MutationQueueItem>;

  constructor() {
    super('webwaka-real-estate');
    this.version(1).stores({
      properties: '++id, serverId, tenantId, syncStatus, state, listingType, type',
      tenancies: '++id, serverId, tenantId, propertyId, syncStatus, status',
      mutationQueue: '++id, tenantId, endpoint, createdAt',
    });
  }
}

export const db = new WebWakaRealEstateDB();

// ─── Sync Utilities ───────────────────────────────────────────────────────────

/**
 * Queue a mutation for background sync when offline.
 * Called by UI components when navigator.onLine === false.
 */
export async function queueMutation(
  endpoint: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  payload: unknown,
  tenantId: string
): Promise<void> {
  await db.mutationQueue.add({
    endpoint,
    method,
    payload: JSON.stringify(payload),
    tenantId,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
}

/**
 * Process the mutation queue when connectivity is restored.
 * Should be called from a service worker 'sync' event or online event listener.
 */
export async function processMutationQueue(
  apiBaseUrl: string,
  authToken: string
): Promise<{ processed: number; failed: number }> {
  const pending = await db.mutationQueue.toArray();
  let processed = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const response = await fetch(`${apiBaseUrl}${item.endpoint}`, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: item.payload,
      });

      if (response.ok) {
        await db.mutationQueue.delete(item.id!);
        processed++;
      } else {
        await db.mutationQueue.update(item.id!, { retryCount: item.retryCount + 1 });
        failed++;
      }
    } catch {
      await db.mutationQueue.update(item.id!, { retryCount: item.retryCount + 1 });
      failed++;
    }
  }

  return { processed, failed };
}
