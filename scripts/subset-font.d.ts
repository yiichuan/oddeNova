// `subset-font` ships no types. Only the call shape this repo uses is declared.
declare module 'subset-font' {
  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: {
      targetFormat?: 'sfnt' | 'woff' | 'woff2';
      preserveNameIds?: number[];
    },
  ): Promise<Buffer>;
}
