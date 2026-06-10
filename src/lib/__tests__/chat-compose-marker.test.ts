import { describe, expect, it } from 'vitest';
import { extractChatComposeMarker } from '../chat-compose-marker';

describe('extractChatComposeMarker', () => {
  it('strips a Chinese compose marker at the end of a reply', () => {
    expect(extractChatComposeMarker('今晚像蓝色湖面。\n[[谱曲: 蓝色湖面的慢速钢琴]]')).toEqual({
      displayText: '今晚像蓝色湖面。',
      composeSeed: '蓝色湖面的慢速钢琴',
    });
  });

  it('strips an English compose marker at the end of a reply', () => {
    expect(extractChatComposeMarker('That memory has a soft glow.\n[[compose: soft piano for a glowing memory]]')).toEqual({
      displayText: 'That memory has a soft glow.',
      composeSeed: 'soft piano for a glowing memory',
    });
  });

  it('returns the original trimmed text when there is no marker', () => {
    expect(extractChatComposeMarker('只是聊天。  ')).toEqual({
      displayText: '只是聊天。',
      composeSeed: null,
    });
  });

  it('ignores a marker that is not at the end', () => {
    expect(extractChatComposeMarker('[[谱曲: 星星]] 但我还想聊。')).toEqual({
      displayText: '[[谱曲: 星星]] 但我还想聊。',
      composeSeed: null,
    });
  });
});
