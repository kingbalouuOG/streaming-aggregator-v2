import { describe, it, expect } from 'vitest';
import { LruEmbeddingCache } from '../titleEmbeddingCache';
import type { CachedEmbedding } from '../../recommendations-v2/embeddingCache';

function emb(n: number): CachedEmbedding {
  return { vec: new Float32Array([n]), norm: n };
}

describe('LruEmbeddingCache', () => {
  it('stores and returns entries', () => {
    const c = new LruEmbeddingCache(3);
    c.set('movie-1', emb(1));
    expect(c.get('movie-1')?.norm).toBe(1);
    expect(c.get('movie-2')).toBeUndefined();
    expect(c.size).toBe(1);
  });

  it('evicts the least-recently-used once over capacity', () => {
    const c = new LruEmbeddingCache(2);
    c.set('a', emb(1));
    c.set('b', emb(2));
    c.set('c', emb(3)); // evicts 'a'
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')?.norm).toBe(2);
    expect(c.get('c')?.norm).toBe(3);
    expect(c.size).toBe(2);
  });

  it('get() promotes a key so it survives the next eviction', () => {
    const c = new LruEmbeddingCache(2);
    c.set('a', emb(1));
    c.set('b', emb(2));
    // Touch 'a' → 'b' becomes LRU.
    expect(c.get('a')?.norm).toBe(1);
    c.set('c', emb(3)); // evicts 'b', not 'a'
    expect(c.get('a')?.norm).toBe(1);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('c')?.norm).toBe(3);
  });

  it('re-setting an existing key refreshes recency without growing size', () => {
    const c = new LruEmbeddingCache(2);
    c.set('a', emb(1));
    c.set('b', emb(2));
    c.set('a', emb(9)); // update + promote 'a'; 'b' now LRU
    expect(c.size).toBe(2);
    expect(c.get('a')?.norm).toBe(9);
    c.set('c', emb(3)); // evicts 'b'
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')?.norm).toBe(9);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new LruEmbeddingCache(0)).toThrow();
  });
});
