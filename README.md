# Unity Dashboard

Unity Dashboard is a React + Vite operations dashboard for working with Unity Edge / Unity Nodes account data. It combines official license metadata from the Unity backend with reward data, then layers local productivity features on top for naming, tagging, filtering, analytics, and day-to-day tracking.

## What This App Does

- Authenticates against the Unity Edge API from the browser.
- Pulls reward balance, allocations, summaries, and official license metadata.
- Merges official license records with reward history so licenses still appear even when they have zero rewards.
- Supports custom labels, operator assignments, preset tags, clone numbering, and filter persistence.
- Shows ULO and UNO distribution, lease time left, uptime, and online state for licenses.
- Includes a dedicated analytics area with charts for earnings, fleet health, tags, uptime, and distribution bands.

## Main Features

- Dashboard overview with reward charts and date-range filtering.
- License list with cards and table layouts.
- Search and filters for operator, preset tag, device name, tagged device, status, and exact ULO cut.
- License detail view with official backend metadata, reward history, and lease information.
- Analytics tab with daily earnings, device leaders, tag coverage, uptime vs rewards, and distribution charts.
- Manual-refresh payout wallet view.
- Settings page to reset locally customized naming, tags, and operator data.

## Data Sources

This app is a static frontend. It does not ship with its own backend.

It talks directly to `https://api.unityedge.io` from the browser and uses:

- Reward endpoints for balances, allocations, and summaries.
- Official license metadata from `functions/v1/licenses_get_licenses`.

The displayed license model is a merged view of:

- official Unity license/device metadata
- reward allocation history
- local browser customizations stored in localStorage and sessionStorage

## Tech Stack

- React 19
- Vite 8
- React Router
- Recharts
- Tailwind CSS via `@tailwindcss/vite`
- Lucide React
- react-hot-toast

## Local Setup

### Prerequisites

- Node.js 20+ recommended
- npm

### Install

```bash
npm install
```

### Environment Variables

Create a local `.env` file from `.env.example` and provide the Unity Edge anon key:

```env
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

You can inspect the key from browser DevTools on a request to `api.unityedge.io` and copy the `apikey` header value.

### Run Locally

```bash
npm run dev
```

Open the local Vite URL shown in the terminal.

## Available Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## Host on GitHub Pages

The repository includes a GitHub Actions workflow in `.github/workflows/deploy.yml`. To publish it:

1. Push the repository to GitHub.
2. In the repository, open **Settings > Secrets and variables > Actions > Variables** and add `VITE_SUPABASE_ANON_KEY` with the Unity Edge anon key.
3. Open **Settings > Pages** and set **Source** to **GitHub Actions**.
4. Push to `main`, or run the **Deploy to GitHub Pages** workflow from the **Actions** tab.

The deployed site will be available at `https://<github-user>.github.io/Unity-Dashboard/`. The workflow builds the app with the repository base path and creates an SPA fallback for the app's client-side routes.

For local development, use `npm run dev`. To test the production build locally, use `npm run build` and `npm run preview`.

## Local Persistence

The app stores some productivity data in the browser:

- custom device labels
- operator assignments
- preset tags
- session-level page and filter state

That means names, tags, and certain filters are browser-specific unless you build your own sync layer later.

## Project Structure

```text
src/
	components/
	data/
	hooks/
	pages/
	utils/
public/
```

- `src/data` contains the API adapter.
- `src/hooks` contains app data hooks and local persistence helpers.
- `src/pages` contains the route-level screens.
- `src/components` contains shared UI, dashboard widgets, layout, and license components.
- `src/utils` contains shared formatters and license display logic.

## Notes

- This repo intentionally ignores `.env`, `node_modules`, and `dist`.
- The anon key is a client-side build variable, so do not treat it like a private server secret.
- Browser-stored customization data can be reset from the Settings page.
