# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use [GitHub private vulnerability reporting](https://github.com/Zubair-hussain/Sightline/security/advisories/new) instead. You'll get a response within a few days.

## Scope we care most about

- **Web server SSRF** — the public audit API must never reach private, loopback or cloud-metadata addresses.
- **Audited content** — text from audited websites must never execute in the app or reports.
- **Interaction tests** — the memory test must stay inside the audited site and never submit forms or trigger purchases.
- **Secrets** — the Cloudflare API token must stay encrypted in the OS keychain.

## Supported versions

Only the latest release receives security fixes.
