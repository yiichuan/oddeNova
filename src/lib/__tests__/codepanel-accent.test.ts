import { describe, expect, it, vi } from 'vitest';
import { createCodePanelAccent, isHuedColor } from '../codepanel-accent';

describe('isHuedColor', () => {
  it('accepts the 360 piece\'s own accent', () => {
    expect(isHuedColor('#99CC3E')).toBe(true);
  });

  it('rejects black, white, and grey', () => {
    expect(isHuedColor('#FFFFFF')).toBe(false);
    expect(isHuedColor('#000000')).toBe(false);
    expect(isHuedColor('#888888')).toBe(false);
  });

  it('rejects near-grey — channels within the rounding threshold of each other', () => {
    expect(isHuedColor('#101010')).toBe(false);
  });

  it('accepts a 3-digit hex', () => {
    expect(isHuedColor('#9c3')).toBe(true);
    expect(isHuedColor('#fff')).toBe(false);
  });

  it('rejects anything that is not a hex colour', () => {
    expect(isHuedColor('red')).toBe(false);
    expect(isHuedColor('rgb(153, 204, 62)')).toBe(false);
    expect(isHuedColor(undefined)).toBe(false);
    expect(isHuedColor(42)).toBe(false);
  });
});

describe('createCodePanelAccent', () => {
  const hap = (color: unknown, active = true) => ({
    isActive: () => active,
    value: { color },
  });

  it('latches the first hued colour among the active haps', () => {
    const onChange = vi.fn();
    const accent = createCodePanelAccent(onChange);

    accent.sample([hap('#FFFFFF'), hap('#99CC3E'), hap('#000000')], 0);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('#99CC3E');
  });

  it('ignores a colour on a hap that is not currently sounding', () => {
    const onChange = vi.fn();
    const accent = createCodePanelAccent(onChange);

    accent.sample([hap('#99CC3E', false)], 0);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the first latch through later frames, even across grey and other hues', () => {
    const onChange = vi.fn();
    const accent = createCodePanelAccent(onChange);

    accent.sample([hap('#99CC3E')], 0);
    accent.sample([hap('#FFFFFF')], 0.5);
    accent.sample([hap('#3E99CC')], 1);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('#99CC3E');
  });

  it('does nothing across frames with no hued colour to offer', () => {
    const onChange = vi.fn();
    const accent = createCodePanelAccent(onChange);

    accent.sample([hap('#FFFFFF'), hap('#000000')], 0);
    accent.sample([hap(undefined)], 0.5);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('lets a new colour latch again after reset', () => {
    const onChange = vi.fn();
    const accent = createCodePanelAccent(onChange);

    accent.sample([hap('#99CC3E')], 0);
    accent.reset();
    accent.sample([hap('#3E99CC')], 0);

    expect(onChange).toHaveBeenNthCalledWith(1, '#99CC3E');
    expect(onChange).toHaveBeenNthCalledWith(2, null);
    expect(onChange).toHaveBeenNthCalledWith(3, '#3E99CC');
  });

  it('does not fire reset again once already cleared', () => {
    const onChange = vi.fn();
    const accent = createCodePanelAccent(onChange);

    accent.reset();

    expect(onChange).not.toHaveBeenCalled();
  });
});
