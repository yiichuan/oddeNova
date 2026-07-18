# Daily Entry Suggestions Design

## Goal

Replace the fixed entry suggestion pool with one AI-generated bilingual batch per day while keeping the page fast, the feature safe on Vercel Hobby limits, and the existing agent-generated next-step suggestions unchanged.

## Product behavior

- One batch is shared by all users worldwide.
- Each batch contains exactly 10 Chinese/English suggestion pairs.
- The client selects 5 suggestions from the active language for display.
- A day is defined by `Asia/Shanghai` time.
- A page fetches the daily batch when it loads. A page that remains open across midnight does not refresh automatically; it updates on the next reload or visit.
- Daily suggestions only replace the static defaults shown before a user has started creating. Persisted suggestions and next-step suggestions emitted by the agent keep their existing precedence.

## Architecture

### Daily generation

A new Vercel Cron endpoint generates the next day's batch. Because Vercel Hobby schedules daily jobs with hourly rather than minute-level precision, the job runs during 23:00-23:59 Beijing time and writes a batch dated for the following day. This makes the next batch available before the client switches dates at midnight.

The endpoint:

1. Requires the existing `CRON_SECRET` bearer token.
2. Computes tomorrow's date in `Asia/Shanghai`.
3. Returns successfully without another model call if that date already exists, making retries idempotent.
4. Calls the existing official server-side model provider using the server-held API key.
5. Parses and validates strict JSON.
6. Retries generation once when the response is malformed or invalid.
7. Writes the validated result to an immutable dated Blob.

The job never overwrites a previously valid dated batch.

### Blob format

The pathname is deterministic:

```text
daily-suggestions/YYYY-MM-DD.json
```

The stored payload is:

```json
{
  "date": "2026-07-18",
  "generatedAt": "2026-07-17T15:23:00.000Z",
  "items": [
    {
      "zh": "想做一段雨停以后慢慢放晴的电子乐",
      "en": "I want an electronic track that slowly clears up after the rain"
    }
  ]
}
```

`items` contains exactly 10 entries. Dated immutable objects avoid stale browser/CDN content and remove the need for a mutable `latest.json` pointer.

### Public read endpoint

A public, read-only endpoint returns the batch for the current Beijing date. It looks up deterministic dated paths rather than calling Blob `list()` on every page visit.

Lookup order:

1. Today's dated Blob.
2. Up to the previous 7 dates, newest first.
3. An unavailable response that tells the client to retain its bundled static defaults.

The response includes both the requested date and the actual source date so stale fallback usage is observable. Its CDN caching expires at the next Beijing midnight. This keeps Blob reads and Function origin executions small even when many users load the page.

## Generation prompt and validation

The model is asked for natural user messages that can be sent directly to the music agent. The 10 entries should be diverse across mood, scene, rhythm, genre, instrumentation, arrangement, and onomatopoeic ideas. Chinese and English values must carry the same intent rather than being unrelated lists.

The server accepts a batch only when:

- it contains exactly 10 objects;
- every object has non-empty `zh` and `en` strings;
- neither language contains duplicate normalized values;
- values do not contain list numbering, Markdown fences, or surrounding commentary;
- the payload date matches the date being generated.

Length is guided by the generation prompt (Chinese 8-24, English 16-70
characters, sized to fit one suggestion chip) but is **not** validated. An
occasional over-length item degrades chip display without discarding an
otherwise valid daily batch; enforcing length in code would throw away the
whole batch and fall back to a stale day instead.

Validation is implemented as pure functions so malformed model output cannot be published. If both generation attempts fail, the endpoint reports failure and leaves all existing batches untouched.

## Client data flow

The bundled static bilingual suggestions remain as the immediate and final fallback. Page load proceeds as follows:

1. Render immediately using the bundled static pool.
2. Fetch the daily suggestion endpoint in the background.
3. Validate the response shape defensively.
4. Select the current interface language from each bilingual pair.
5. Randomly choose up to 5 items and replace only the active default suggestion source.

The suggestion hook must distinguish default suggestions from persisted or newly committed next-step suggestions. Resolving the daily request must not overwrite:

- suggestions restored for the current code;
- suggestions emitted by the latest agent commit;
- suggestions for another session after a session switch.

When the user switches to an empty session after the daily batch has loaded, the hook may draw a fresh set of 5 from the same daily batch.

Network, Blob, parsing, or validation failures are silent from the user's perspective: the input remains usable and continues showing bundled defaults.

## Retention and cleanup

The existing `/api/cleanup` Cron handler is extended instead of adding another cleanup job. Its current share cleanup and the new daily-suggestion cleanup remain isolated so failure in one does not prevent the other from running.

Daily-suggestion cleanup:

- lists only the `daily-suggestions/` prefix;
- parses the date from each expected pathname;
- retains the latest 30 days;
- deletes older objects;
- ignores unexpected pathnames and records them for diagnosis rather than deleting them blindly.

The runtime read path searches only the latest 7 dates. The additional retained history exists for generation-quality review and incident diagnosis. One daily prefix listing adds roughly 30 advanced Blob operations per month; Blob deletion is not billed.

## Security and operations

- Only the generation endpoint can call the model and write data, and it requires `CRON_SECRET`.
- Provider and Blob credentials remain server-side.
- The read endpoint is public and read-only.
- Logs record the target date, generation attempt count, validation outcome, stored pathname, fallback source date, and cleanup counts without logging credentials.
- A failed generation preserves yesterday's content through the 7-day read fallback.

## Testing

### Unit tests

- Beijing current-date and next-date calculations around UTC day boundaries.
- Valid batches and each schema rejection case.
- Normalized duplicate detection in both languages.
- Retention cutoff and safe pathname parsing.
- Random selection returns at most 5 unique suggestions.

### API tests

- Generation rejects missing or invalid Cron authorization.
- An existing target date makes generation idempotent.
- A valid model response is written once.
- Invalid output retries once and never writes invalid data.
- The read endpoint returns today's batch, then recent fallback, then unavailable.
- Read responses expose the source date and correct cache headers.
- Cleanup keeps 30 days, deletes older dated objects, and leaves unexpected objects untouched.

### Hook tests

- Bundled defaults render before the request resolves.
- A valid daily batch replaces only default suggestions.
- Persisted suggestions matching current code take precedence.
- New commit suggestions take precedence and remain persisted.
- A late daily response does not overwrite another session or agent suggestions.
- Fetch and response-validation failures retain bundled defaults.

## Out of scope

- Per-user generation or personalization.
- An editorial review or administration interface.
- Automatic refresh for a page left open across midnight.
- More than one model generation call per day, aside from the single invalid-output retry.
- Backfilling missing historical dates.
