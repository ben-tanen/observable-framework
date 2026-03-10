# Observable Framework Sandbox

A personal [Observable Framework](https://observablehq.com/framework) site for experimenting with dashboards, data loaders, and components. Deployed to GitHub Pages via CI on every push to `master`.

## Pages

- **Home** — auto-generated index of all pages
- **Media Counts** — dashboard pulling data from a separate GitHub repo
- **Experiments** — pages testing various data sources (Google Sheets, Notion, Letterboxd, SQL, R)
- **Observable Examples** — default example dashboard and report from the Framework starter

## Data loaders

Python (`.py`), JavaScript (`.js`), and R (`.R`) data loaders live in `docs/data/`. Python loaders require dependencies listed in `env/python-reqs.txt`.

## Local development

### Prerequisites

- Node.js >= 20.6
- Python 3.x with a virtual environment at `.venv/`
- [1Password CLI](https://developer.1password.com/docs/cli/) (`op`) for secret injection

### Setup

```bash
npm install
python -m venv .venv
source .venv/bin/activate
pip install -r env/python-reqs.txt
```

### Running locally

```bash
npm run dev:local
```

This uses `op run` to inject secrets from 1Password and activates the Python venv, then starts the Observable preview server at <http://localhost:3000>.

Secrets are referenced (not stored) in `env/.env` using `op://` URIs.

### CI / GitHub Actions

The `publish.yml` workflow builds and deploys to GitHub Pages on push to `master` and on a 12-hour cron schedule. It installs Python dependencies globally (no venv) and injects secrets via GitHub Actions secrets — no 1Password required.

## Command reference

| Command              | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `npm install`        | Install or reinstall dependencies                              |
| `npm run dev:local`  | Start local preview server (venv + 1Password)                  |
| `npm run dev`        | Start preview server (CI — no venv or secrets injection)       |
| `npm run build:local`| Build static site locally (venv + 1Password)                   |
| `npm run build`      | Build static site (CI)                                         |
| `npm run deploy`     | Deploy project to Observable                                   |
| `npm run clean`      | Clear the local data loader cache                              |
| `npm run observable` | Run commands like `observable help`                            |
