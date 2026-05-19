# Security Policy

## Secrets

Never commit real `.env` files, API keys, passwords, JWT secrets, or local database files.

Use `.env.example` or `package/.env.example` as the public template, then copy it to `.env` locally:

```powershell
Copy-Item package\.env.example package\.env
Copy-Item package\.env.example package\backend\.env
```

Before publishing, verify that these files are not tracked or uploaded:

- `.env`
- `package/.env`
- `package/backend/.env`
- `package/frontend/.env`
- `*.db`, `*.sqlite`, `*.sqlite3`
- `package/static/`, `package/dist/`, `package/build/`

## Production Defaults

Change these values before public or shared deployment:

- `SECRET_KEY`
- `ADMIN_PASSWORD`
- all API keys and base URLs

Generate a strong `SECRET_KEY` with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```
