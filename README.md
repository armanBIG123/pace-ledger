# PaceLedger

Standalone version of the advisor appointment-pace tracker, backed by Supabase
(real accounts + database) instead of Claude's artifact storage.

## 1. Set up the database (one time)

1. Open your Supabase project: https://supabase.com/dashboard
2. Go to the **SQL Editor** → **New query**.
3. Paste in the entire contents of `supabase-schema.sql` from this folder and click **Run**.
   This creates the `profiles` and `appointments` tables and the security rules
   that keep advisors from seeing each other's data while letting managers see everyone's.

## 2. Decide on email confirmation

By default, Supabase requires people to click a confirmation link in their
email before they can log in for the first time.

- **Keep it on** (recommended) if advisors/managers will sign up with real
  work email addresses — it's one extra click for them, no extra work for you.
- **Turn it off** for faster internal testing: Supabase dashboard →
  **Authentication** → **Providers** → **Email** → turn off "Confirm email."

## 3. Run it locally to test (optional but recommended)

You'll need [Node.js](https://nodejs.org) installed.

```bash
cd pace-ledger
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`), create a manager
account and an advisor account, and confirm appointments save and the
dashboards populate.

## 4. Put the code on GitHub

```bash
cd pace-ledger
git init
git add .
git commit -m "PaceLedger"
```

Then create a new empty repository at https://github.com/new (don't check
"add a README" — this folder already has one), and run the two commands
GitHub shows you on the next page, which will look like:

```bash
git remote add origin https://github.com/YOUR-USERNAME/pace-ledger.git
git branch -M main
git push -u origin main
```

## 5. Deploy on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the `pace-ledger` repository.
3. Build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Click **Save and Deploy**. You'll get a working `*.pages.dev` link in a minute or two.

## 6. Attach your domain

In that Pages project → **Custom domains** → **Set up a custom domain** →
enter the domain you registered. Since it's already on Cloudflare DNS, this
is usually automatic, including HTTPS.

## Notes

- The manager sign-up code is set in `src/App.jsx` as `MANAGER_CODE`. Change
  it to something private before sharing this with your team, and only tell
  it to people who should see everyone's data.
- Every time you want to change the app, edit the code, `git add . && git
  commit -m "..." && git push` — Cloudflare Pages rebuilds and redeploys
  automatically within a minute or two.
