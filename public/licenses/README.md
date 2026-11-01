MP3 export uses @breezystack/lamejs 1.2.7 (Alex Zhukov and contributors), licensed under LGPL-3.0.

Source and replacement builds: https://github.com/shijinyu/lamejs
Package: https://www.npmjs.com/package/@breezystack/lamejs/v/1.2.7
License: [lamejs-LICENSE.txt](./lamejs-LICENSE.txt)

The encoder runs in a separate worker bundle generated from src/lib/mp3-export.worker.ts.
To replace it, install a compatible encoder package and rebuild with npm run build.

M4A export uses Mediabunny 1.65.0 and @mediabunny/aac-encoder 1.65.0 (Vanilagy and contributors), licensed under MPL-2.0. The AAC encoder contains a WASM build of FFmpeg under LGPL-2.1-or-later.

Sources, build instructions and replacement builds: https://github.com/Vanilagy/mediabunny/tree/v1.65.0/packages/aac-encoder
Mediabunny source: https://github.com/Vanilagy/mediabunny/tree/v1.65.0
Licenses: mediabunny-MPL-2.0.txt, aac-encoder-MPL-2.0.txt, aac-ffmpeg-LGPL-2.1.txt, aac-ffmpeg-LICENSE.md.

The AAC encoder is unmodified and loaded only for M4A exports, via src/lib/m4a-export.worker.ts. Replace its dependency and rebuild with npm run build to use a compatible replacement encoder.
