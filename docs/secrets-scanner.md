# Sightline Secrets — the exposed-secrets scanner

Sightline Secrets finds API keys, tokens, passwords and private keys that have leaked where other people can read them: on a website, in a project folder, or anywhere in a Git repository's history.

It was written for Sightline under the **MIT licence**. It follows the same general approach as dedicated secret scanners: a fast keyword filter, a pattern per credential type, decoding of hidden values and optional live verification. The detection patterns come from each provider's published key format (prefixes, lengths and alphabets). **No code or detector definitions were copied from other scanners**, including TruffleHog (AGPL-3.0), so Sightline stays MIT.

Source: [`src/engine/secrets/`](../src/engine/secrets)

| File | What it does |
| --- | --- |
| `detectors.ts` | The 51 detectors and the placeholder filter |
| `scan.ts` | Runs detectors over text and its decoded variants, masks, fingerprints and de-duplicates findings |
| `verify.ts` | Optional, read-only "is this key live?" checks for 23 providers |
| `website.ts` | The "Exposed secrets" audit category for a website |
| `local.ts` | Folder and Git-history scanning (desktop app, CLI and MCP only) |

## Where it looks

| Target | What is scanned | Available in |
| --- | --- | --- |
| **Website** | The page HTML and inline scripts, every same-site `<script>` and preloaded script, **public source maps including the original source they embed**, and 10 paths that are often published by mistake: `/.env`, `/.env.local`, `/.env.production`, `/.git/config`, `/.git/HEAD`, `/.npmrc`, `/.aws/credentials`, `/docker-compose.yml`, `/wp-config.php.bak`, `/.vscode/sftp.json` | Desktop · Web · CLI · MCP |
| **Folder** | Every text file, skipping dependencies and build output (`node_modules`, `dist`, `build`, `.next` …), binaries and files over 2 MB | Desktop · CLI · MCP |
| **Git repository** | The added lines of every commit on every branch, so a secret that was committed and later deleted is still found, with its commit, author, date, file and line | Desktop · CLI · MCP |
| **Git URL** | Cloned into a temporary folder (deleted afterwards), then scanned like a repository | Desktop · CLI · MCP |

A leaked-file path only counts when the response really is that file. Many sites answer every unknown path with their HTML page and status 200, and that is ignored.

## What it detects

**Cloud:** AWS access key ID · AWS secret access key · Google Cloud service account key · Google API key · Azure storage account key · DigitalOcean token · Cloudflare API token · Heroku API key

**Code and packages:** GitHub token · GitHub fine-grained token · GitLab token · npm access token · PyPI API token · Docker Hub access token

**Payments and commerce:** Stripe live secret key · Stripe test secret key · Stripe webhook secret · Square access token · Braintree / PayPal access token · Shopify access token

**AI providers:** OpenAI · Anthropic · Hugging Face · Groq · Replicate · Perplexity · xAI

**Messaging and email:** Slack token · Slack incoming webhook · Discord webhook · Discord bot token · Telegram bot token · Twilio API key · SendGrid · Mailgun · Mailchimp · Postmark

**Databases and back-ends:** Supabase `service_role` key (the public `anon` key is ignored) · database URLs with a password (Postgres, MySQL, MariaDB, MongoDB, Redis, AMQP, SQL Server) · Firebase / Google private key

**Developer tools:** Sentry · Linear · Notion · Airtable · Atlassian · Figma · Mapbox secret token · New Relic

**Generic:** private keys (RSA, EC, DSA, OpenSSH, PGP, encrypted PEM, also inside JSON) · passwords in URLs · high-entropy values assigned to names such as `client_secret`, `api_key` or `password`

Public keys that are meant to be in a browser (Stripe `pk_live_`, Mapbox `pk.`, the Supabase `anon` key) are not reported. Google API keys are reported at low severity, with advice to restrict them to your domains.

### Fewer false alarms

- **Keyword filter:** a pattern only runs on text that contains one of its keywords.
- **Placeholders are skipped:** repeated characters (`ghp_xxxx…`), `example`, `your_…`, `<…>`, `${…}`, `changeme` and similar documentation values.
- **Entropy floors** for context-based detectors, so ordinary words are not reported.
- **Specific wins over generic:** a Stripe key is reported once as a Stripe key, not again as a "possible secret".
- **Private keys** must contain key material between the BEGIN and END markers, so code or docs that mention the markers are not flagged.

### Hidden values

Every piece of text is also scanned after decoding **base64**, **URL encoding**, **`\uXXXX` escapes** and **HTML entities**. Findings say which encoding hid them.

## Results are masked

A finding shows `sk_l…9fQ2` (private keys: only their header line), where it was found, every other place the same secret appears, and its severity. The full value never leaves the scanner: reports, JSON output and MCP answers only carry the masked value and a 16-character SHA-256 fingerprint used to de-duplicate.

## Verification (optional)

With verification on, Sightline asks the provider whether each key still works, using **one read-only "who am I" request per key** (for example `GET https://api.github.com/user`). Nothing is created, changed, sent or charged. Results are **Confirmed live**, **No longer works** or **Could not confirm**.

Using someone else's leaked key is unauthorised access, so verification:

- is **off by default**;
- requires an explicit "I own this site or code" confirmation (`--i-own-this` in the CLI, `i_have_permission: true` in MCP);
- is **never** available in the public web version.

Providers that can be verified: GitHub (both token types), GitLab, npm, Stripe (live and test), OpenAI, Anthropic, Hugging Face, Groq, Replicate, SendGrid, Mailchimp, Mailgun, DigitalOcean, Cloudflare, Telegram, Slack, Discord, Linear, Figma, Sentry and New Relic.

## Command line

```text
sightline secrets https://your-site.com          # website
sightline secrets ./my-project                   # Git history if it is a repository, else the files
sightline secrets ./my-project --no-history      # current files only
sightline secrets https://github.com/you/repo    # clone and scan the history

--json <file>      findings as JSON (masked)
--fail-on-found    exit code 1 when anything is found (for CI)
--verify --i-own-this   check with each provider whether keys are live
--only-verified    with --verify, report only keys confirmed live
```

**In CI** (GitHub Actions), fail the build when a secret is committed:

```yaml
- run: node sightline/out/cli/sightline.js secrets . --fail-on-found
```

## MCP

The `check_secrets` tool takes `target` (a website, folder, repository path or Git URL), plus `verify` and `i_have_permission` for live verification.

## If something is found

1. **Rotate the key first**, at the provider. Deleting it from the code does not help: it has already been copied.
2. Remove it from the code and load it from an environment variable or a secrets manager.
3. For Git history, assume anything ever committed is public, even after rewriting history.
4. For a leaked `.env` or `.git` folder, rotate everything it contained and block the path on the server or CDN.

## Tests

[`test/secrets.test.ts`](../test/secrets.test.ts) checks:
- every detector against a fake credential;
- placeholders, public keys and look-alikes;
- encoded values;
- line numbers, masking and de-duplication;
- that no raw key survives in a public finding;
- folder scanning;
- a real Git history where a token was committed and then deleted;
- a local web server with a key in a source map and a leaked `.env`;
- that the scanner does not flag its own source.

The fake credentials in [`test/secrets-fakes.ts`](../test/secrets-fakes.ts) are assembled at run time, so no credential-shaped string exists in the repository.
