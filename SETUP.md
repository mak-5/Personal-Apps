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

## Adding the Finance PWA

Your existing Plaid + FastAPI frontend components go in:
```
src/apps/finance-pwa/FinancePWA.jsx
```
The routing is already wired. Just replace the placeholder component with your actual app.

---

## Repo structure explained

```
akshay-apps/
├── .github/
│   └── workflows/
│       └── deploy.yml        ← Auto-deploys on every git push
├── public/
│   └── icons/                ← PWA icons (192px + 512px PNGs)
├── src/
│   ├── main.jsx              ← Router — add new apps here
│   ├── Launcher.jsx          ← Home screen / app hub
│   ├── index.css             ← Global styles
│   └── apps/
│       ├── flight-dashboard/
│       │   └── FlightDashboard.jsx
│       └── finance-pwa/
│           └── FinancePWA.jsx
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
