# Bundled fonts

Every file in this directory ships to the browser, so each one's licence
travels with the app. The copyright lines below are read out of the font
files themselves (`name` table, IDs 0/8/9/13), not copied from a website.

The full SIL Open Font License 1.1 text is in [`OFL.txt`](./OFL.txt); it
covers every font marked OFL-1.1 here. Under it these fonts may be bundled,
embedded and served freely, including commercially — what it asks is that the
licence travels with them and that they are never sold on their own.

| File | Family | By | Licence |
|---|---|---|---|
| `DMSerifDisplay-Regular.woff2` | DM Serif Display | Colophon Foundry, Frank Grießhammer | OFL-1.1 |
| `ABeeZee-Regular.ttf` | ABeeZee | Anja Meiners | OFL-1.1 |
| `Baskervville-Italic.ttf` | Baskervville | ANRT | OFL-1.1 |
| `EBGaramond-Regular.ttf` | EB Garamond | Georg Duffner, Octavio Pardo | OFL-1.1 |
| `42dotSans-ExtraBold.ttf` | 42dot Sans | The 42dot Sans Project Authors | OFL-1.1 |
| `jinghua-laosongti-greetings.woff2` | 京華老宋體 / KingHwaOldSong | TerryWang（特里王） | free for commercial use, not open source — see below |

Copyright lines as they appear in the files:

- **DM Serif Display** — Copyright 2014–2017 Adobe Systems Incorporated, with
  Reserved Font Name 'Source'. Copyright 2019 Google LLC.
- **ABeeZee** — Copyright 2011 The ABeeZee Project Authors
  (https://github.com/googlefonts/abeezee), with Reserved Font Name ABeeZee.
- **Baskervville** — Copyright 2018 The Baskervville Project Authors
  (https://github.com/anrt-type/ANRT-Baskervville).
- **EB Garamond** — Copyright 2017 The EB Garamond Project Authors
  (https://github.com/octaviopardo/EBGaramond12).
- **42dot Sans** — Copyright 2024 The 42dot Sans Project Authors
  (https://github.com/42dot/42dot-Sans).

## 京華老宋體 is free to use, but not under an open licence

Neither the shipped subset nor the 33 MB source in `assets/fonts/` carries a
licence record — only `Font © Copyright 2022 TerryWang. All rights reserved.`
and a trademark notice. The terms are the author's own declaration, published
alongside the font rather than inside it:

- 免费商用 — free for commercial use, explicitly including embedding in
  software and electronic products, which is what this app does.
- 可随意复制传播，但不可单独作为字体文件出售 — copy and redistribute freely,
  but never sell the font on its own.
- **请勿随意修改本字体字形，更不许传播修改版文件** — do not alter the glyph
  shapes, and do not distribute altered files.
- 字形不符合现行字形规范，不适合教育或正式排版场合 — decorative use only,
  which is all it does here (one line of Chinese greeting text).

The third point is the one to keep in view: `npm run fonts:greetings` ships a
**subset** of this font. A subset drops glyphs it does not need but leaves every
glyph it keeps byte-identical, and the subset keeps the family name, copyright
and trademark records intact — so it alters no shapes and passes itself off as
nothing else, which is what that clause is protecting. It is still a derived
file, so if the author's intent should turn out to be stricter, the fix is
cheap: this face carries one greeting line, and dropping it costs that line's
typography and nothing else.

It is *not* an open-source font, and nothing here may be relicensed under the
OFL alongside the others.
