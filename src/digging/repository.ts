import type { DigData, DigTable } from './types';

/** Minimal asynchronous port, independent of IndexedDB, Spotify, React and any future hub transport. */
export interface DigCollection<Row extends { id: string }> {
  get(id: string): Promise<Row | undefined>;
  add(row: Row): Promise<string>;
  put(row: Row): Promise<string>;
  bulkPut(rows: Row[]): Promise<unknown>;
}

export interface DigRepository {
  read(): Promise<DigData>;
  write<T>(action: () => Promise<T>): Promise<T>;
  rows<K extends DigTable>(name: K): DigCollection<DigData[K][number]>;
}
