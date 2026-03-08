# Contributing to Lakekeeper Console Components

Thanks for your interest in contributing! This guide will get you up and running in a few minutes.

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- [just](https://github.com/casey/just) command runner (optional but recommended)

## Quick Start

```bash
# 1. Fork and clone the repo
git clone https://github.com/<your-username>/console-components.git
cd console-components

# 2. Install dependencies
npm install

# 3. Build the library
npm run build

# 4. Start the dev server (if testing with the playground)
npm run dev
```

Or with `just`:

```bash
just install
just build
just dev
```

## Project Structure

```
console-components/
├── src/
│   ├── components/    # Vue 3 + Vuetify 3 UI components
│   ├── composables/   # Reusable composition functions
│   ├── stores/        # Pinia stores
│   ├── plugins/       # Auth plugin, functions plugin
│   ├── gen/           # Auto-generated API clients (do not edit manually)
│   ├── common/        # Shared interfaces, enums, utilities
│   └── index.ts       # Library entry point
├── openapi/           # OpenAPI specs for code generation
├── proposals/         # Community feature proposals
├── ROADMAP.md         # Planned and completed features
└── FEATURE_PROPOSAL.md # Template for proposing new features
```

## Running with the Console App

`console-components` is a library — you need the [Lakekeeper Console](https://github.com/lakekeeper/console) app to see your changes in a browser. Here's how to set up both repos together:

### 1. Clone both repos side by side

```bash
git clone https://github.com/<your-username>/console-components.git
git clone https://github.com/<your-username>/console.git
```

Your folder structure should look like:

```
your-workspace/
├── console-components/   # the component library
└── console/              # the app that consumes it
```

### 2. Build the component library

```bash
cd console-components
npm install
npm run build
```

### 3. Link the library into the console app

```bash
cd ../console
npm run link
```

This runs `npm link ../console-components` and wires up the local build. Now the console app uses your local copy instead of the published package.

### 4. Start the Lakekeeper backend

The console needs a running Lakekeeper server. Clone the repo and start the required services:

```bash
# Clone Lakekeeper
git clone https://github.com/lakekeeper/lakekeeper.git
cd lakekeeper
```

**Step 1 — Start dependencies (PostgreSQL, OpenFGA, Keycloak):**

```bash
# PostgreSQL
docker rm --force postgres-16 && docker run -d --name postgres-16 \
  -p 5432:5432 -e POSTGRES_PASSWORD=postgres \
  postgres:16.4 -c "max_connections=10000"

# OpenFGA (authorization)
docker rm --force openfga && docker run -d --name openfga \
  -p 35080:8080 -p 35081:8081 -p 35300:3000 \
  openfga/openfga run

# Keycloak (identity provider)
docker rm --force keycloak && docker run -d --name keycloak \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -v $(pwd)/examples/access-control-simple/keycloak/realm.json:/opt/keycloak/data/import/realm.json \
  -p 30080:8080 \
  quay.io/keycloak/keycloak:26.0.7 \
  start-dev --metrics-enabled=true --health-enabled=true --import-realm --verbose --log-level=INFO --features=token-exchange
```

**Step 2 — Set environment variables:**

```bash
export LAKEKEEPER__AUTHZ_BACKEND=openfga
export LAKEKEEPER__OPENFGA__ENDPOINT=http://localhost:35081
export LAKEKEEPER__PG_ENCRYPTION_KEY=abc
export LAKEKEEPER__PG_DATABASE_URL_READ=postgresql://postgres:postgres@localhost/postgres
export LAKEKEEPER__PG_DATABASE_URL_WRITE=postgresql://postgres:postgres@localhost/postgres
export LAKEKEEPER__BASE_URI=http://localhost:8181
export LAKEKEEPER__OPENID_PROVIDER_URI=http://localhost:30080/realms/iceberg
export LAKEKEEPER__OPENID_AUDIENCE=lakekeeper
export LAKEKEEPER__LISTEN_PORT=8181
export LAKEKEEPER__UI__OPENID_CLIENT_ID="lakekeeper"
export LAKEKEEPER__ALLOW_ORIGIN=*
```

**Step 3 — Run migrations and start the server:**

```bash
cd crates/iceberg-catalog-bin
cargo run --all-features migrate
cargo run --all-features --release serve
```

The Lakekeeper server will be available at `http://localhost:8181`.

> **Note:** You need [Rust](https://rustup.rs/) installed to build Lakekeeper from source.

```bash
cd console
npm install   # if not done already
npm run dev
```

The app runs at `http://localhost:5173` by default.

### 5. Rebuild on changes

When you edit files in `console-components`, rebuild the library and the console will pick up the changes:

```bash
cd console-components
npm run build
```

> **Tip:** The link stays active until you run `npm run unlink` in the console directory.

### Unlinking

To go back to the published package version:

```bash
cd console
npm run unlink
```

This removes the link and does a clean `npm install`.

---

## Development Workflow

### Making Changes

1. Create a branch from `main`:

   ```bash
   git checkout -b feat/my-feature
   ```

2. Make your changes in `src/`

3. Rebuild and verify in the console app:

   ```bash
   npm run build
   # Switch to console app and check in browser
   ```

4. Ensure everything passes:

   ```bash
   just reviewable
   ```

   This runs `npm install`, formatting, linting, and a full build.

5. Commit and push your branch, then open a PR.

### Key Commands

| Command                | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `npm install`          | Install dependencies                                |
| `npm run build`        | Build the library                                   |
| `npm run dev`          | Start dev server                                    |
| `npm run lint`         | Lint and auto-fix                                   |
| `npm run lint:check`   | Lint without fixing                                 |
| `npm run format`       | Format with Prettier                                |
| `npm run format:check` | Check formatting                                    |
| `just reviewable`      | Full pre-PR check (install + format + lint + build) |

### Regenerating API Clients

If the Lakekeeper OpenAPI specs change:

```bash
just generate-clients
```

This downloads the latest specs and regenerates the TypeScript clients. Do not manually edit files under `src/gen/`.

## Tech Stack

- **Vue 3** — Composition API with `<script setup>`
- **Vuetify 3** — Material Design component framework
- **TypeScript** — Strict typing throughout
- **Pinia** — State management
- **D3.js** — Data visualizations (versioning chart)
- **Chart.js + vue-chartjs** — Charts (warehouse stats)
- **CodeMirror 6** — SQL editor
- **DuckDB-WASM** — In-browser SQL execution
- **Vite** — Build tooling

## Coding Conventions

- Use `<script setup lang="ts">` for all components
- Use Vuetify components for UI — don't add new CSS frameworks
- Keep components in a single `.vue` file unless they exceed ~500 lines
- Use the `functions` plugin for API calls (see `src/plugins/functions.ts`)
- Prefer composition functions (`composables/`) over mixins
- No `any` types — use proper TypeScript interfaces

## Finding Issues to Work On

- Look for issues labeled [`good first issue`](https://github.com/lakekeeper/console-components/issues?q=label%3A%22good+first+issue%22) for beginner-friendly tasks
- Issues labeled [`help wanted`](https://github.com/lakekeeper/console-components/issues?q=label%3A%22help+wanted%22) are ready to be picked up
- Check the [ROADMAP.md](ROADMAP.md) for planned features

## Proposing a Feature

1. Copy the [FEATURE_PROPOSAL.md](FEATURE_PROPOSAL.md) template
2. Save it as `proposals/your-feature-name.md`
3. Open a PR

Or use the [feature request issue template](https://github.com/lakekeeper/console-components/issues/new?template=feature_request.yml).

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
