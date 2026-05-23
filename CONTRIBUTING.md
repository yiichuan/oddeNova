# Contributing to oddeNova

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

### Prerequisites

- Node.js >= 18
- An API key from [Anthropic](https://console.anthropic.com/) or [DeepSeek](https://platform.deepseek.com/)

### Getting Started

```bash
git clone https://github.com/yiichuan/oddeNova.git
cd oddeNova
npm install
npm run dev
```

Open `http://localhost:5173`. On first launch, select a provider and enter your API key in the modal.

## Code Standards

### TypeScript

- Strict mode is enforced (`strict: true`, `noUnusedLocals`, `noUnusedParameters`).
- All public interfaces must be typed; avoid `any`.

### Imports

- **Only import from package roots** — never use deep paths like `superdough/nodePools.mjs`. The ESLint rule `no-restricted-imports` will block these.
- `@strudel/*` packages follow the same rule.

### AudioContext

- Never call `new AudioContext()` directly in components or services.
- Always use `getAudioContext()` / `setAudioContext()` from `superdough`.

Full coding conventions: [`.github/copilot-instructions.md`](.github/copilot-instructions.md)

## Running Checks

Run all checks before submitting a PR:

```bash
npm run lint                              # ESLint
npx tsc --noEmit -p tsconfig.app.json    # TypeScript type check
npm test                                 # Vitest unit tests
npm run build                            # Production build
```

These same checks run automatically in CI on every PR and push to `main`.

Pre-commit hooks (via Husky + lint-staged) also run ESLint automatically on changed files.

## Testing

- Tests live in `__tests__/` subdirectories next to the source they test.
- Use `getHandler` + `makeCtx` pattern for Agent tool tests (see `src/agent/__tests__/tools.test.ts`).
- `validate` and `improvise` tools depend on browser APIs — do not write unit tests for them.
- Coverage: `npm test -- --coverage`

## Submitting a PR

1. Branch from `main`: `git checkout -b feature/your-feature`
2. Keep commits focused (one logical change per commit)
3. Use conventional commit messages: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`
4. Ensure all CI checks pass before requesting review
5. Add or update tests for any logic changes in `src/agent/` or `src/lib/`

## Prompt Changes

**Do not edit `src/prompts/system-prompt.ts` directly.** See `.github/prompts/edit-system-prompt.prompt.md` for the full procedure for versioning prompt changes.

## License

By contributing, you agree that your contributions will be licensed under [AGPL-3.0](LICENSE).
