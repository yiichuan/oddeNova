# Export Song Title Generation Design

## Goal

Add a compact button to the WAV export popover so users can ask AI to generate a song title and use it as the export filename.

## User Experience

- In the export popover, the filename field gains a square icon button on the right side, matching the red-box position from the request.
- The button uses a small sparkle-style icon and has localized accessible text:
  - Chinese UI: `自动生成曲名`
  - English UI: `Generate song title`
- Clicking the button asks AI to generate a short song title based on the current music code, current session title, the latest 6 chat messages, and current UI language.
- While generation is running, the button is disabled and shows a loading state.
- On success, the generated title replaces the filename input value. The user can still edit it before exporting.
- On failure, export remains available. The filename input keeps its current value, and a short localized error appears below the filename row.

## Architecture

Create a focused service module:

`src/services/song-title.ts`

Responsibilities:

- Expose `generateSongTitle(params)` as the UI-facing API.
- Reuse the existing `chatOnce` helper from `src/services/llm.ts`.
- Build a small title-only prompt that asks for exactly one title and no explanation.
- Follow the active UI language:
  - `zh-CN` produces a Chinese title.
  - `en` produces an English title.
- Sanitize model output for filename use.
- Return a non-empty safe title, or throw an error if no usable title can be produced.

The export UI remains responsible only for button state and writing the returned title into the input.

## Data Flow

1. `App` already owns the current session, messages, and Strudel state.
2. `CodePanel` passes export-related context through to `TopActionBar`.
3. `TopActionBar` passes the context into `ExportPopover`.
4. `ExportPopover` calls `generateSongTitle` when the user clicks the icon button.
5. The service calls `chatOnce` with the current code, session title, latest 6 messages, and locale.
6. The service sanitizes the model output and returns it.
7. `ExportPopover` updates its local `filename` state with the returned title.
8. Existing export behavior stays unchanged: export uses the current filename input value or the default timestamp placeholder.

## Filename Sanitization

The sanitizer should:

- Trim whitespace and remove surrounding quotes.
- Collapse newlines and repeated spaces.
- Remove path separators and common filesystem-problem characters such as `< > : " / \ | ? *`.
- Limit length to 60 visible characters before export appends `.wav`.
- Preserve Chinese characters for Chinese titles.
- Fall back to an error if the sanitized result is empty.

The export service already appends `.wav` when needed, so generated titles should not include a file extension.

## Error Handling

- If the model call fails, returns empty output, or sanitization removes all content, show a localized inline error near the filename field.
- Do not close the export popover.
- Do not block manual filename editing.
- Do not block WAV export as long as the existing cycle validation passes.
- Clicking the generate button again clears the previous generation error and retries.

## Testing

Add or update tests to cover:

- The export popover renders the square generate-title button next to the filename input.
- Clicking the button calls the title generation path with current code/session/message context.
- A successful generated title populates the filename input.
- A failed generation displays a localized inline error and leaves export usable.
- The button is disabled while generation is in progress.
- The song title service sanitizes typical model outputs, including quoted titles, multiline responses, unsafe filename characters, and Chinese titles.

## Out of Scope

- Changing the WAV rendering/export pipeline.
- Renaming sessions with the generated song title.
- Persisting generated titles outside the filename input.
- Adding multiple title suggestions or title history.
