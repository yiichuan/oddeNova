export const DIRT_SAMPLE_ALIASES = ['bd', 'cb', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'sax', 'sd']
  .map(key => [key, `dirt_${key}`] as const);

export const FEATURED_SAMPLE_BASE = 'https://raw.githubusercontent.com/kai-xi/360/main/samples/';
export const FEATURED_SAMPLE_FILES = {
  cover360_camera_flash: '360_camera_flash.wav',
  cover360_vocals: '360_vocals.wav',
};
