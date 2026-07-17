---
name: oddenova-strudel
description: Use when a user asks for natural-language music creation or revision, Strudel generation, live coding, or browser playback of a generated piece in oddeNova.
---

# oddeNova Strudel

Create the complete composition in Codex, then send it to oddeNova with the bundled helper.

## Required flow

1. Read the references before composing, choosing the language variant that matches the user: for Chinese use `references/composition-guide.zh.md`, `references/strudel-api.zh.md`, `references/samples.zh.md`; for English use the `.en.md` variants. These files are generated from the oddeNova app prompt — treat them as authoritative and do not edit them.
2. Create one random `projectId` for this Codex task. Keep it unchanged for every follow-up edit in the same task so oddeNova updates the same work.
3. Generate a complete program containing a `// STYLE | BPM: N` comment, `setcps`, one `stack`, and semantic `/* @layer NAME */` markers with a one-line intent comment after each marker.
4. Self-review the music, API names, and samples. State only that the code was reviewed; never claim Strudel browser or runtime validation.
5. Build the protocol payload below. Keep `messages` to music requests and compact assistant change summaries; omit reasoning, tool traces, and unrelated conversation. Match `locale`, summaries, and code comments to the user's language.
6. Resolve `scripts/open-in-oddenova.mjs` relative to this file and send the JSON over stdin. Invoke it without flags for production. Add `--base-url` only when the user names a non-production target. The helper prints the URL before attempting to open it.
7. Return the printed URL when automatic browser opening is unavailable. Tell the user to press oddeNova's play control; never autoplay.

Do not create project files unless the user explicitly asks for an output file. Do not call `/api/share`. Do not copy or run oddeNova's internal agent loop.

## Creation and import example

Generate the `projectId` once, for example `rain-night-lofi-7f3c9a`, and retain it for later edits in this task. Pipe a payload like this directly to the installed helper:

```sh
node "/path/to/installed/oddenova-strudel/scripts/open-in-oddenova.mjs" --print-only --base-url http://127.0.0.1:5173 <<'JSON'
{
  "protocolVersion": 1,
  "source": "oddenova-strudel-skill",
  "projectId": "rain-night-lofi-7f3c9a",
  "title": "雨夜 Lo-fi",
  "code": "// LO-FI | BPM: 78\nsetcps(78 / 240)\n\nstack(\n  /* @layer DRUMS */\n  // 松弛鼓组，32 cycle 中段减弱形成呼吸\n  s(\"bd ~ ~ ~, ~ sd ~ sd, hh*8\")\n    .bank(\"RolandTR808\")\n    .gain(\"<0.72 0.58 0.68 0.5>/8\"),\n\n  /* @layer CHORDS */\n  // 温暖电钢和弦以短触发脉动，不用长铺底\n  note(\"<[d3,f3,a3,c4] [bb2,d3,f3,a3] [f3,a3,c4,e4] [c3,e3,g3,bb3]>*2\")\n    .s(\"gm_epiano1\")\n    .struct(\"x ~ x ~\")\n    .lpf(sine.range(900, 1800).slow(8))\n    .room(0.35)\n    .gain(0.42),\n\n  /* @layer BASS */\n  // D 小调根音与五度低频支撑，小音箱上可能偏弱\n  note(\"<d2 d2 a2 c3 bb1 bb1 f2 a2>*2\")\n    .s(\"sine\")\n    .struct(\"x ~ x x\")\n    .lpf(260)\n    .gain(0.58),\n\n  /* @layer RAIN_TEXTURE */\n  // 雨夜空气质感，保持背景并缓慢游移\n  s(\"wind*4\")\n    .hpf(1200)\n    .lpf(5200)\n    .pan(sine.slow(6))\n    .gain(0.14)\n)",
  "messages": [
    {"role": "user", "content": "做一段雨夜 lo-fi"},
    {"role": "assistant", "content": "加入松弛鼓组、短触发电钢和弦、温暖贝斯与雨声质感。"}
  ],
  "locale": "zh-CN"
}
JSON
```

For “鼓轻一点”, reuse `rain-night-lofi-7f3c9a`, send the full revised code, and append only that request plus a short summary to the compact creative history.
