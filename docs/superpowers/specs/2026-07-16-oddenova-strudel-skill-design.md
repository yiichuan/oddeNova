# oddeNova Strudel Skill Design

Date: 2026-07-16

## Goal

Package oddeNova's natural-language Strudel creation knowledge as a standalone
Codex skill named `oddenova-strudel`. The skill generates a piece in Codex and
opens a lightweight import link that creates or updates a persistent oddeNova
browser session. The user listens by clicking oddeNova's existing play control.

The installed skill must work from any local Codex workspace without requiring
an oddeNova source checkout.

## Principles

- Codex is the creation source; the oddeNova website is the playback and
  listening destination.
- Keep the first integration one-way: Codex sends work to oddeNova, but does
  not read website edits back.
- Use a URL fragment so the imported composition is not sent to an oddeNova
  server endpoint.
- Do not silently overwrite work changed on the website.
- Do not start audio without the user's explicit play click.
- Keep the normal path fileless and avoid modifying the user's workspace.
- Preserve existing sessions and `/s/:id` sharing behavior.

## Scope

### Included

- A repository-owned, independently installable `oddenova-strudel` skill.
- Strudel composition guidance, supported API knowledge, and sample guidance.
- A local Node.js helper that builds and opens an oddeNova import URL.
- A versioned, Base64URL-encoded import payload carried in the URL fragment.
- Persistent session creation, repeated updates, and conflict branching.
- Production-site defaults plus a configurable development base URL.
- Chinese and English UI messages through the existing localization system.

### Excluded

- WAV export.
- Automatic playback.
- Full duplication of oddeNova's 30-turn agent loop.
- Strudel syntax, API, runtime, or music-quality validation during import.
- A new authenticated server API, MCP server, or bidirectional bridge.
- Reading website changes back into Codex.
- Codex Cloud support for opening and playing audio in a user's local browser.
- Default creation of project files in the user's workspace.

## Skill Package

The authoritative skill source lives in the oddeNova repository:

```text
skills/oddenova-strudel/
├── SKILL.md
├── references/
│   ├── composition-guide.md
│   ├── strudel-api.md
│   └── samples.md
└── scripts/
    └── open-in-oddenova.mjs
```

`SKILL.md` describes the creation workflow and completion criteria. The
references contain the minimum reusable knowledge extracted from oddeNova;
they do not copy the full application agent loop. The description must include
both general discovery terms (`music`, `natural-language music creation`) and
technical terms (`Strudel`, `live coding`, `browser playback`).

The helper requires Node.js 18 or later. It receives the import data over
standard input so multiline Strudel code is not embedded in shell arguments.
It defaults to `https://www.oddenova.com` and accepts `--base-url` for local or
preview deployments. If it cannot open a browser, it prints the complete URL.

The preferred experience is the Codex app's in-app browser. Codex CLI and IDE
surfaces may open the system browser. If automatic browser opening is
unavailable, the generated URL is the fallback. Normal execution creates no
workspace files. A new Codex task therefore starts a new project unless the
user manually supplies prior project context.

## Import Protocol

The URL has this shape:

```text
https://www.oddenova.com/#oddenova=<base64url-json>
```

The fragment is never part of the HTTP request. The protocol payload is:

```json
{
  "protocolVersion": 1,
  "source": "oddenova-strudel-skill",
  "projectId": "stable-random-id-for-this-codex-task",
  "title": "雨夜 Lo-fi",
  "code": "setcps(...)...",
  "messages": [
    {"role": "user", "content": "做一段雨夜 lo-fi"},
    {"role": "assistant", "content": "加入轻鼓、温暖贝斯和 Rhodes 和弦"}
  ],
  "locale": "zh-CN"
}
```

`protocolVersion` versions the payload schema and encoding contract. It is not
the oddeNova application version or the skill package version. Incompatible
future protocol changes increment this value.

The skill keeps a stable `projectId` in the current Codex task. It imports only
the music-specific creative trail: user requests and short assistant change
summaries. Tool traces, code analysis, and unrelated conversation are excluded.
The website generates its own message IDs and timestamps.

The helper limits the final URL to 32 KB. If necessary it removes the oldest
creative summaries while retaining the latest user/assistant pair. It never
truncates Strudel code. If the URL remains too large, it stops without opening
the website and reports that the composition cannot use the lightweight
transport.

## Website Components

Add two focused modules:

```text
src/lib/oddenova-import.ts
src/hooks/useOddeNovaImport.ts
```

`oddenova-import.ts` owns fragment extraction, Base64URL decoding, minimal
payload parsing, protocol/source checks, canonical content hashing, and address
bar cleanup.

`useOddeNovaImport.ts` waits for IndexedDB session initialization, applies the
import policy, and exposes an import outcome for the UI. It must not affect the
existing share import hook.

An imported session records optional source metadata:

```ts
externalSource?: {
  type: 'oddenova-strudel-skill';
  projectId: string;
  importedContentHash: string;
}
```

Legacy sessions without this field remain valid.

## Import and Conflict Behavior

1. Read and immediately remove the fragment from the visible URL.
2. Perform only minimal payload parsing: decodable JSON, supported protocol,
   expected source, and required field types.
3. Find the current sync target by source type and `projectId`.
4. If no target exists, create and persist a new session.
5. If a target exists, hash its current import-owned content and compare it to
   `importedContentHash`.
6. If the hashes match, update that session in place and store the new hash.
7. If the hashes differ, preserve the current session, detach it as the sync
   target, create a new branch from the incoming content, and make the new
   branch the future sync target for that `projectId`.
8. Display the outcome. Do not call `play()`.

The import-owned hash covers the title, Strudel code, and imported creative
messages. It excludes ordinary persistence timestamps and unrelated UI state.

## Error Handling and User Copy

The import path does not validate Strudel syntax, supported methods, sample
names, runtime behavior, or music quality. Those remain the responsibility of
the skill's generation guidance and the existing playback engine.

Minimal protocol failures create no session and do not block normal app
startup. Unsupported or malformed imports cannot affect existing sessions.
The existing in-memory fallback remains available when IndexedDB is
unavailable, with a warning that refresh may lose the imported session.

Use these exact Chinese outcomes, with localized English equivalents:

- First import: `导入成功`
- Conflict-free update: `已更新`
- Conflict branch: `当前版本已保留，新导入的更新已创建为新分支`
- Unsupported protocol: `导入链接版本不受支持，请更新 oddeNova 或 oddenova-strudel skill`

Malformed Base64URL or JSON shows a concise invalid-link error. Browser launch
failure is handled by printing a clickable URL. No import outcome starts audio.

## Security and Privacy

- The payload stays in the fragment and is not posted to `/api/share`.
- The website removes the fragment immediately after reading it to reduce
  accidental exposure through screenshots or copied addresses.
- Imported code is inert until the user presses play.
- Only the dedicated source marker enters this import flow.
- The feature introduces no credentials, server storage, or anonymous write
  endpoint.

## Tests

### Automated

- Payload encode/decode round trip preserves all protocol fields.
- Malformed Base64URL, malformed JSON, unsupported `protocolVersion`, and an
  unexpected `source` are rejected without creating a session.
- First import creates a persistent session.
- Reimport of unchanged website content updates the same session.
- Website edits trigger preservation plus a new sync-target branch.
- Later imports update the new branch rather than the detached old session.
- Refresh does not repeat a completed import.
- Import never invokes playback.
- Legacy sessions and `/s/:id` share imports continue to work.
- The helper handles the production default, `--base-url`, URL-size trimming,
  oversized code, browser-launch failure, and fileless normal execution.
- The installed skill works without an oddeNova source checkout.

### Manual Acceptance

1. Invoke `oddenova-strudel` from an unrelated workspace with “做一段雨夜
   lo-fi”.
2. Confirm Codex opens an oddeNova import URL without creating workspace files.
3. Confirm the website shows `导入成功`, persists the session across refresh,
   and does not play automatically.
4. Click play and confirm the generated piece is audible.
5. In the same Codex task, request “鼓轻一点” and import again.
6. Confirm the same session updates and shows `已更新`.
7. Modify the website version, import another Codex update, and confirm the
   website preserves the current session, creates a new branch, and shows
   `当前版本已保留，新导入的更新已创建为新分支`.

Before completion, run the skill script tests, relevant Vitest suites,
`npm run lint`, and `npm run build`.

## Compatibility and Rollout

The new Session metadata is optional, so no migration is required. The import
hook is independent of the existing `/s/:id` hook. Protocol version 1 is the
only supported version in the first release. Deployment must publish the
website support before users install a skill that emits protocol version 1.
