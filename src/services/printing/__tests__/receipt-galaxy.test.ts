import { describe, expect, it } from 'vitest';
import { ASCII_GALAXY_FRAME } from '../../../components/settings/ascii-galaxy-frame';
import { receiptGalaxyHeight } from '../receipt-galaxy';

describe('receipt galaxy', () => {
  it('crops the captured pane frame to its middle 70%, in proportion', () => {
    const ratio = (ASCII_GALAXY_FRAME.rows * ASCII_GALAXY_FRAME.cellHeight) / (ASCII_GALAXY_FRAME.columns * ASCII_GALAXY_FRAME.cellWidth);
    expect(receiptGalaxyHeight(356)).toBe(Math.round(356 * ratio * 0.7));
  });
});
