import { describe, expect, it } from 'vitest';

import { retryDelaySeconds } from './retry';

describe('retryDelaySeconds', () => {
  it('backs off exponentially and caps at one hour', () => {
    expect(retryDelaySeconds(1)).toBe(15);
    expect(retryDelaySeconds(2)).toBe(30);
    expect(retryDelaySeconds(4)).toBe(120);
    expect(retryDelaySeconds(20)).toBe(3600);
  });
});
