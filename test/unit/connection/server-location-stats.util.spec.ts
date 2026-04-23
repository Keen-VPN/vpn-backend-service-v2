import { normalizeServerLocationForStats } from '../../../src/connection/server-location-stats.util';

describe('normalizeServerLocationForStats', () => {
  it('merges UK home nations and aliases to United Kingdom', () => {
    expect(normalizeServerLocationForStats('England')).toBe('United Kingdom');
    expect(normalizeServerLocationForStats('United Kingdom')).toBe(
      'United Kingdom',
    );
    expect(normalizeServerLocationForStats('scotland')).toBe('United Kingdom');
    expect(normalizeServerLocationForStats('UK')).toBe('United Kingdom');
    expect(normalizeServerLocationForStats('London, England')).toBe(
      'United Kingdom',
    );
  });

  it('does not treat New England (US) as the UK', () => {
    expect(normalizeServerLocationForStats('New England')).toBe('New England');
  });

  it('leaves Ireland as-is', () => {
    expect(normalizeServerLocationForStats('Ireland')).toBe('Ireland');
  });
});
