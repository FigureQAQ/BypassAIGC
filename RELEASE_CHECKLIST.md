# Release Checklist

Use this checklist before pushing BypassAIGC to GitHub.

## Local Checks

- Run backend syntax checks:

```powershell
python -m py_compile package\main.py package\backend\app\main.py package\backend\app\config.py package\backend\app\services\document_ingestion_service.py package\backend\app\services\document_export_service.py package\backend\app\routes\optimization.py
```

- Run backend regression tests:

```powershell
$env:PYTHONPATH = (Resolve-Path 'package\backend').Path
python -m unittest discover -s package\backend\tests -v
```

- Run frontend build:

```powershell
cd package\frontend
npm run build
```

- Check that PowerShell scripts parse:

```powershell
$errors = $null; $tokens = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'package\start-app.ps1'), [ref]$tokens, [ref]$errors) | Out-Null
$errors
```

## Do Not Commit

- `.env`
- `package/.env`
- `package/backend/.env`
- `package/frontend/.env`
- `*.db`, `*.sqlite`, `*.sqlite3`
- `node_modules/`
- `package/static/`
- `package/dist/`
- `package/build/`

## GitHub Release

The GitHub Actions workflow builds ASCII-named artifacts:

- `BypassAIGC-Windows-<version>.zip`
- `BypassAIGC-Linux-<version>.tar.gz`
- `BypassAIGC-macOS-<version>.tar.gz`

Create a release by pushing a tag:

```bash
git tag v2.7.0
git push origin v2.7.0
```
