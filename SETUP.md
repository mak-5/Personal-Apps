# Akshay Apps — Setup Guide
**Monorepo → GitHub Pages → PWA on iPad/iPhone/Mac**

---

## One-time setup (~15 minutes)

### Step 1 — Prerequisites
Make sure you have these installed on your laptop:
```bash
node --version   # needs v18+
git --version
```
If not: download from nodejs.org and git-scm.com.

---

### Step 2 — Create the GitHub repo

1. Go to **github.com → New repository**
2. Name it exactly: `apps`  ← this matters for the URL
3. Set to **Public** (required for free GitHub Pages)
4. **Don't** initialize with README
5. Click **Create repository**

---

### Step 3 — Push the code

In your terminal, navigate to where you downloaded this folder, then:

```bash
cd akshay-apps

# Install dependencies
npm install

# Initialize git and push
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/apps.git
git push -u origin main
```
Replace `YOUR_USERNAME` with your actual GitHub username.

---

### Step 4 — Enable GitHub Pages

1. Go to your repo on GitHub → **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. That's it — the workflow file handles the rest

After ~2 minutes your first deploy will complete. Your app will be live at:
```
https://YOUR_USERNAME.github.io/apps/
```

---

### Step 5 — Verify the vite.config.js base path

Open `vite.config.js` and confirm this line matches your repo name:
```js
base: '/apps/',   // ← must match your GitHub repo name exactly
```
If you named your repo something different, update this.

---

## Installing on iPad / iPhone (PWA)

1. Open **Safari** on your iPad/iPhone
2. Navigate to `https://YOUR_USERNAME.github.io/apps/`
3. Tap the **Share** button (box with arrow)
4. Tap **"Add to Home Screen"**
5. Name it "Apps" → tap **Add**

It now appears on your homescreen like a native app, runs fullscreen, and works offline.

> **Note:** PWA install only works in Safari on iOS/iPadOS. Chrome on iOS won't show the install option.

---

## Installing on Mac

1. Open **Chrome** or **Edge**
2. Navigate to your URL
3. Click the install icon in the address bar (looks like a monitor with a down arrow)
4. Click **Install**

It appears in your Applications folder and Dock.

---

## Deploying updates (ongoing)

Every time you push to `main`, GitHub Actions auto-deploys in ~2 minutes:

```bash
git add .
git commit -m "Update flight dashboard"
git push
```

That's it. No manual deploy steps ever.

---

## Returns Tracker — Investment Dashboard

A full-stack investment returns tracker built into the launcher. Tracks portfolio value, cost basis, and computes time-weighted returns using the Modified Dietz method.

### What it does

- **Overview tab** — Six return cards: YTD, 1M, 3M, 6M, prior full year, and All-Time ROIC. Plus an Invested / Current Value / Unrealized Gain strip and a mini annual returns table.
- **Performance tab** — Period buttons (1M, 3M, 6M, YTD, 1Y, 3Y, 5Y) or custom year/month selector. Shows Modified Dietz return %, APY, and dollar gain. Per-account breakdown for multi-account portfolios.
- **Chart tab** — Portfolio value vs cost basis line chart over time.
- **Annual tab** — Year-by-year table: Start Value, Deposits (cash flows), End Value, Return % (Modified Dietz). All-time ROIC footer row.
- **Data tab** — Account blurbs with current value, last updated date, and a ⚠️ warning if market value hasn't been updated after the last deposit. Record Deposit form (auto-bumps market value by deposit amount). Update Market Value form. Editable snapshot table.

### Return methodology

| Metric | Formula |
|---|---|
| **Period return (YTD, 1M, 3M, 6M, annual)** | Modified Dietz: `(EndValue − StartValue − CashFlows) / (StartValue + CashFlows)` |
| **All-Time ROIC** | `(CurrentValue − TotalDeposited) / TotalDeposited` |
| **APY** | Annualised from Modified Dietz using period days |

Cash flows are derived automatically from increases in the `cost_basis` column — no separate transactions table needed.

### Data model

One Supabase table: `portfolio_snapshots`

```sql
create table portfolio_snapshots (
  id          uuid default gen_random_uuid() primary key,
  date        date not null,
  account     text not null default 'Fidelity',
  value       numeric not null,
  cost_basis  numeric not null,
  created_at  timestamptz default now(),
  unique (date, account)
);
alter table portfolio_snapshots enable row level security;
```

- `cost_basis` stores the **running total** invested in that account as of that date (not the incremental deposit).
- `value` stores the market value on that date.
- A deposit row has an increased `cost_basis`; a market-value-only update carries `cost_basis` forward unchanged.
- Multiple accounts are stored in the same table, differentiated by the `account` column.

### Architecture

```
Browser (React / Vite)
      │  /api/* proxy (dev) → port 8000
      ▼
FastAPI (Python) — server/main.py
      │  httpx  (service key, server-side only)
      ▼
Supabase PostgreSQL
```

### Running locally

**1. Supabase** — create the table above, then copy your keys:
```bash
cp server/.env.example server/.env
# fill in SUPABASE_URL and SUPABASE_SERVICE_KEY
```

**2. Python backend**
```bash
cd server
pip3 install -r requirements.txt      # first time only
python3 -m uvicorn main:app --reload --port 8000
```
Or use the Claude Code launch config (auto-starts both servers):
```
.claude/launch.json  →  "FastAPI Backend"
```

**3. Vite frontend**
```bash
npm run dev        # proxies /api → localhost:8000
```

Navigate to `http://localhost:5173/returns-tracker`

### API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/snapshots` | All rows, ordered by date asc |
| POST | `/api/snapshots` | Insert a new snapshot |
| PUT | `/api/snapshots/{id}` | Update value / cost_basis |
| DELETE | `/api/snapshots/{id}` | Delete a row |

### Troubleshooting

| Problem | Fix |
|---|---|
| Backend won't start via launch config | Run manually: `cd server && python3 -m uvicorn main:app --port 8000` |
| `PermissionError` on uvicorn start | Use Homebrew Python: `/opt/homebrew/bin/uvicorn` with `--loop asyncio --http h11` |
| Returns show `—` | No cost_basis data yet — add a deposit first |
| ⚠️ warning on account card | Update market value for that account after the deposit date |

---

## Repo structure explained

```
akshay-apps/
├── .github/
│   └── workflows/
│       └── deploy.yml        ← Auto-deploys on every git push
├── .claude/
│   └── launch.json           ← Dev server configs (FastAPI + Vite)
├── public/
│   └── icons/                ← PWA icons (192px + 512px PNGs)
├── server/                   ← FastAPI backend (not deployed to GitHub Pages)
│   ├── main.py               ← API endpoints + Supabase integration
│   ├── requirements.txt
│   └── .env.example          ← Copy to .env and fill in Supabase keys
├── src/
│   ├── main.jsx              ← Router — add new apps here
│   ├── Launcher.jsx          ← Home screen / app hub
│   ├── index.css             ← Global styles
│   └── apps/
│       ├── flight-dashboard/
│       │   └── FlightDashboard.jsx
│       ├── finance-pwa/
│       │   └── FinancePWA.jsx
│       └── returns-tracker/
│           └── ReturnsTracker.jsx  ← Investment returns dashboard
├── index.html
├── vite.config.js            ← Change base: '/apps/' if repo name differs
└── package.json
```

---

## Adding a new app later

1. Create `src/apps/my-new-app/MyNewApp.jsx`
2. In `src/main.jsx`, add:
   ```jsx
   import MyNewApp from './apps/my-new-app/MyNewApp.jsx'
   // inside <Routes>:
   <Route path="/my-new-app" element={<MyNewApp />} />
   ```
3. In `src/Launcher.jsx`, add an entry to the `APPS` array
4. `git push` — live in 2 minutes

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Blank page after deploy | Check `base` in vite.config.js matches repo name |
| "Add to Home Screen" missing | Must use Safari on iOS, not Chrome |
| API calls blocked | Check browser console for CORS errors |
| Build fails in GitHub Actions | Check Actions tab in GitHub for error logs |
