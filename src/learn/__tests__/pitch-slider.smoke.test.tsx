import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// @strudel/core pulls in @kabelsalat/web, which only resolves under Vite in the
// browser — stub the one pure helper this chapter needs so the tree can render
// in the node test environment.
vi.mock('@strudel/core', () => {
  const pcs = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return {
    midi2note: (n: number) => pcs[n % 12] + (Math.floor(n / 12) - 1),
    noteToMidi: () => 0,
    freqToMidi: () => 0,
    getSoundIndex: () => 0,
    Pattern: class {},
    valueToMidi: () => 0,
    evalScope: () => Promise.resolve(),
  };
});

const { default: PitchSlider } = await import('../PitchSlider');

describe('PitchSlider', () => {
  it('renders only the frequency slider when asked', () => {
    const html = renderToStaticMarkup(<PitchSlider showFrequencySlider min={20} max={20000} />);
    expect(html.match(/type="range"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="frequency"');
    expect(html).toContain('220Hz');
  });

  it('renders both sliders, the plot canvas and the sweep buttons', () => {
    const html = renderToStaticMarkup(<PitchSlider animatable plot showFrequencySlider showPitchSlider />);
    expect(html.match(/type="range"/g)).toHaveLength(2);
    expect(html).toContain('<canvas');
    expect(html).toContain('频率扫描');
    expect(html).toContain('音高扫描');
    // default min=55, initial=220 -> 220 = 55 * 2^2
    expect(html).toContain('55Hz * 2<sup>');
    expect(html).toContain('>2</span>');
  });

  it('shows the MIDI number formula when zeroOffset is set', () => {
    const html = renderToStaticMarkup(
      <PitchSlider showPitchSlider showFrequencySlider baseFrequency={440} zeroOffset={69} min={55} max={7040} initial={440} />,
    );
    // 440Hz is the base, so the exponent is 0 -> displayed as (69 - 69)/12
    expect(html).toContain('440Hz * 2<sup>');
    expect(html).toContain('>69</span> - 69)/12');
  });

  it('renders the claviature keyboard and labels the active note', () => {
    const html = renderToStaticMarkup(
      <PitchSlider showPitchSlider showFrequencySlider baseFrequency={440} zeroOffset={69} min={55} max={880} initial={440} claviature />,
    );
    expect(html).toContain('<svg');
    expect(html).toContain('A4');
  });
});
