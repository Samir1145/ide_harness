# Hayagriva API Server — api.hayagriva.app

Activation server for Hayagriva vault license keys. Validates `HAYG-XXXX-XXXX-XXXX` license keys and returns the vault decryption key, which is stored in the user's OS Keychain.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/activate` | Validate license key → return vault key |
| `GET` | `/vaults/latest.json` | Vault version manifest |
| `GET` | `/health` | Liveness probe |

### POST /activate

```json
// Request
{ "licenseKey": "HAYG-XXXX-XXXX-XXXX" }

// Response (200)
{
  "ok": true,
  "vaultType": "cases",
  "vaultKey": "64hexchars...",
  "latestUrl": "https://api.hayagriva.app/vaults/latest.json"
}

// Error (404)
{ "ok": false, "error": "License key not found." }
```

## Local Setup

```bash
cd api-server
npm install
cp .env.example .env
# Fill in VAULT_KEY_LAWS, VAULT_KEY_CASES, etc. in .env
# Generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm run seed    # Populates licenses.db with test keys
npm run dev     # Start with --watch
```

## Adding a New License Key

1. Edit `scripts/seed-license.js` — add entry to `LICENSES` array
2. Run `npm run seed`
3. Email the key to the subscriber

## Monthly Vault Update Workflow

When you publish new vault zips:

1. Update `data/latest.json` with the new version + GitHub download URLs
2. The `/vaults/latest.json` endpoint serves this file automatically

## Deploying to Railway

1. Push `api-server/` to a GitHub repo
2. Create a new Railway project → "Deploy from GitHub Repo"
3. Set environment variables in Railway dashboard:
   - `VAULT_KEY_LAWS`, `VAULT_KEY_CASES`, `VAULT_KEY_DOCUMENTS`, `VAULT_KEY_FORMS`
   - `NODE_ENV=production`
4. Railway will auto-detect `railway.toml` and deploy
5. In Namecheap DNS: add a `CNAME` record for `api` pointing to your Railway domain
   - e.g. `api.hayagriva.app CNAME hayagriva-api.up.railway.app`

## DNS Setup (Namecheap)

In Namecheap Advanced DNS for `hayagriva.app`:

| Type | Host | Value |
|---|---|---|
| `CNAME` | `api` | `[your-railway-domain].up.railway.app` |
| `CNAME` | `www` | `[your-website-host]` |
