# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in oddeNova, please report it by opening a [GitHub Issue](https://github.com/yiichuan/oddeNova/issues) with the label `security`. For sensitive disclosures, contact the maintainer directly via GitHub.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days for critical issues.

## API Key Security

- **Never commit API keys to the repository.** All API keys are entered through the in-app UI and stored in `localStorage` — they are never sent to our servers.
- The `.gitignore` excludes `.env` and `.env.local` files.
- ESLint rules prevent importing from internal `superdough/*` subpaths that could inadvertently expose audio context state.

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest (main branch) | ✅ |
| older commits | ❌ |
