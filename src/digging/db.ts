import Dexie, { type Table, liveQuery } from 'dexie';
import { TABLES, type DigData, type DigTable } from './types';

/** Separate from spottied and separated by verified Spotify account, including preview. */
export class DigDatabase extends Dexie {
  constructor(accountId: string) {
    super(`potcast.digging.v1:${encodeURIComponent(accountId)}`);
    this.version(1).stores({
      projects: 'id, updatedAt',
      memberships: 'id, artistId, albumId',
      releases: 'id',
      tracks: 'id',
      states: 'id',
      events: 'id, trackId, albumId, artistId, listenedAt',
      reviews: 'id, kind, subjectId',
      completions: 'id, artistId, completedAt',
    });
  }

  rows<K extends DigTable>(name: K): Table<DigData[K][number], string> {
    return this.table(name);
  }

  async read(): Promise<DigData> {
    const arrays = await Promise.all(TABLES.map((name) => this.table(name).toArray()));
    return Object.fromEntries(TABLES.map((name, index) => [name, arrays[index]])) as unknown as DigData;
  }

  /** Every mutation and verification runs in the same IndexedDB transaction. */
  write<T>(action: () => Promise<T>): Promise<T> {
    return this.transaction('rw', TABLES.map((name) => this.table(name)), action);
  }

  observe(next: (data: DigData) => void, error: (error: unknown) => void) {
    return liveQuery(() => this.read()).subscribe({ next, error });
  }
}

export interface DigRepository {
  read(): Promise<DigData>;
  write<T>(action: () => Promise<T>): Promise<T>;
  rows<K extends DigTable>(name: K): Table<DigData[K][number], string>;
}
