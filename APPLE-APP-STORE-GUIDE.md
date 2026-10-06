# PaceLedger on the App Store — click-by-click (Windows, browser only)

You don't need a Mac. **Codemagic** builds the iPhone app on its own Macs
straight from your GitHub repo and uploads it to Apple. Personal Codemagic
accounts get 500 free build minutes a month, and one build takes about
15–25 minutes.

How the app works: it opens **big-pace-ledger.com** inside a native iPhone
app. Your normal website updates (GitHub → Cloudflare) show up in the app
automatically. You only rebuild in Codemagic when the app itself changes
(icon, name, version or new phone features).

Allow about an afternoon for Parts 1–4 the first time, then 1–3 days for
Apple's review.

---

## Part 1 — Upload this update (do this first)

**Supabase SQL first.** In Supabase → **SQL Editor** → **New query**, paste
all of `migration-account-deletion.sql` and click **Run**. It's safe to run
twice. It lets account deletion work for managers too.

**Supabase: new function `delete-account`.** Apple requires people to be
able to delete their account inside the app.
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via
   Editor**.
2. Name it exactly `delete-account`.
3. Paste in `supabase/functions/delete-account/index.ts` and click
   **Deploy**.
4. Open the function's **Details** and turn **Verify JWT** (or "Enforce JWT
   verification") **OFF**.

**GitHub: upload these.** Open each folder first, then **Add file →
Upload files**, then **Commit changes**.

| Folder | Files |
|---|---|
| `src` | `App.jsx`, `styles.js`, `native.js` (new), `ClientIntake.jsx`, `clientIntake.js` |
| `public` | `offline.html` (new), `privacy-policy.html` |
| top level of the repo | `package.json`, `capacitor.config.json`, `codemagic.yaml` (new), `APPLE-APP-STORE-GUIDE.md` |
| `assets` (new folder) | `icon-only.png`, `splash.png`, `splash-dark.png` |
| `ios-extras` (new folder) | `PrivacyInfo.xcprivacy` |

To make the new `assets` and `ios-extras` folders on GitHub: at the top
level, **Add file → Upload files**, drag in each whole folder from the zip,
then commit.

**Check the website still works.** Wait for Cloudflare to finish, then on
big-pace-ledger.com:
- click your **name** at the top right to open the new **Your account**
  window;
- with a throwaway test account, try **Delete my account** once to make
  sure it works.

---

## Part 2 — Apple Developer: register the app (5 minutes)

1. Go to <https://developer.apple.com/account> → **Certificates, IDs &
   Profiles** → **Identifiers** → the blue **+**.
2. Choose **App IDs** → **Continue** → **App** → **Continue**.
3. Fill it in:
   - Description: `PaceLedger`
   - Bundle ID: **Explicit**, `com.armanbig.paceledger`
   - Leave every capability unticked, then **Continue** → **Register**.
4. Go to <https://appstoreconnect.apple.com> → **Apps** → **+** → **New
   App**:
   - Platform: **iOS**
   - Name: `PaceLedger`. If that name is taken, try `PaceLedger by BIG` or
     `Big Pace Ledger`.
   - Primary language: English (U.S.)
   - Bundle ID: pick `com.armanbig.paceledger`
   - SKU: `paceledger-ios`
   - User access: Full Access
   - Click **Create**.

---

## Part 3 — App Store Connect API key (lets Codemagic upload for you)

1. App Store Connect → **Users and Access** → **Integrations** tab → **App
   Store Connect API** → **Team Keys**. The first time, click **Request
   Access** and accept.
2. Click **+** (Generate API Key):
   - Name: `Codemagic`
   - Access: **App Manager**
   - Click **Generate**.
3. Write down the **Issuer ID** (shown above the table) and the key's **Key
   ID**.
4. Click **Download** to save the `.p8` file. **Apple only lets you
   download it once.** Keep it somewhere safe.

---

## Part 4 — Codemagic: connect and build

**4a. Sign up and add the app**
1. Go to <https://codemagic.io/signup> → **Sign up with GitHub** → allow
   access to your PaceLedger repository.
2. Make sure you're in your **Personal account**. Team accounts don't get
   the free minutes.
3. **Add application** → **GitHub** → pick your repo → project type
   **Ionic Capacitor App** → **Finish**. It finds `codemagic.yaml`
   automatically.

**4b. Add the Apple key**
1. Go to **Personal account settings** (on newer screens, **Team
   settings**) → **Integrations** → **Developer Portal** → **Manage keys** →
   **Add key**.
2. Fill it in:
   - App Store Connect API key name: `PaceLedger` (exactly this; the build
     file looks for this name)
   - Issuer ID and Key ID: from Part 3
   - API key: upload the `.p8` file
3. Click **Save**.

**4c. Signing certificate**
1. In the same settings: **codemagic.yaml settings** → **Code signing
   identities** → **iOS certificates** → **Generate certificate**.
2. Pick type **Apple Distribution** and the key **PaceLedger**, then click
   **Create certificate**.
3. If Codemagic offers a download (`.p12` plus a password), save both. If
   the certificate doesn't then appear in the list, add it with **Upload
   certificate**.

**4d. Provisioning profile** (made at Apple, then fetched by Codemagic)
1. <https://developer.apple.com/account> → **Profiles** → **+**.
2. Under **Distribution**, choose **App Store Connect** → **Continue**.
3. Pick the App ID `com.armanbig.paceledger` → **Continue**.
4. Tick the **Apple Distribution** certificate created today (by Codemagic)
   → **Continue**.
5. Profile name: `PaceLedger App Store` → **Generate**. You don't need to
   download it.
6. Back in Codemagic: **Code signing identities** → **iOS provisioning
   profiles** → **Fetch profiles**. Tick `PaceLedger App Store`, then
   **Download selected**.

**4e. Build**
1. Codemagic → your app → **Start new build**.
2. Workflow: **iOS — App Store / TestFlight**, branch **main**, then
   **Start new build**.
3. When it's green, the app is uploaded to App Store Connect. Apple takes
   another 10–30 minutes to process it, then emails you.

If a build fails, open the red step, copy the last 30 or so lines of the
log, and send them to me.

---

## Part 5 — Test on your iPhone (TestFlight)

1. App Store Connect → your app → **TestFlight** tab. When the build shows
   **Ready to Submit** or **Missing Compliance**, it's processed. The build
   file already answers the encryption question, so Missing Compliance
   shouldn't appear.
2. Under **Internal Testing**, click **+** → create a group called `Team`.
   Leave **Enable automatic distribution** ticked so every new build reaches
   you, then add yourself (and anyone else on your App Store Connect team).
3. On your iPhone, install **TestFlight** from the App Store, open the
   invite email, and install PaceLedger.
4. Things to check:
   - Logging in works.
   - The Overview shows **Turn on** reminders. Tap it and allow
     notifications.
   - Log a test appointment about 35 minutes from now. A reminder should
     arrive 30 minutes before.
   - **Follow Up** → a recruit → **Share link** opens the iPhone share
     sheet.
   - **My Appointments** → **Export** opens the share sheet with a
     spreadsheet.
   - **Calendar** → **Connect Google Calendar** opens a Safari sheet. Sign
     in, connect, close it, and the Calendar shows connected.
   - Tap your name → **Your account** → **Delete my account** is there.
     Don't use it on your real account.
   - Turn on Airplane mode and reopen the app: you should see the "You're
     offline" screen.

---

## Part 6 — Store listing and submit for review

In App Store Connect → your app:

**App Information**
- Category: **Business**
- Content Rights: "Does not contain third-party content"
- Age Rating: answer **None/No** to everything, which gives 4+.

**Pricing and Availability:** Price **Free**. Availability: United States,
or all countries.

**App Privacy**
1. Privacy Policy URL: `https://big-pace-ledger.com/privacy-policy.html`.
2. Click **Get Started** → "Yes, we collect data" and tick:
   - **Contact Info → Name**, **Email Address**
   - **Financial Info → Other Financial Info** (Business Plan expenses,
     premium figures)
   - **User Content → Other User Content** (appointments, prospects,
     notes)
   - **Identifiers → User ID**
3. For each one, answer:
   - Used for: **App Functionality** only.
   - Linked to the user: **Yes**.
   - Used for tracking: **No**.
4. **Publish** the privacy answers.

**Version 1.0 page (iOS App)**
- **Screenshots:** in the **iPhone 6.9" Display** slot, upload the five
  files in `app-assets/app-store-screenshots/` in order (01 → 05). They're
  1290×2796, which Apple accepts there.
- Promotional text, Description, Keywords: from
  `app-assets/APP-STORE-LISTING.md`.
- Support URL: `https://big-pace-ledger.com/support.html`
- Marketing URL: `https://big-pace-ledger.com/home.html`
- Version: `1.0.0` (it must match the app). Copyright: `2026 [your
  company name]`.
- **Build:** click **+** and pick the TestFlight build.
- **App Review Information:**
  - Tick **Sign-in required** and enter the demo account (see below).
  - Add your name, phone and email.
  - Paste the Notes from `APP-STORE-LISTING.md`.
- **Version Release:** "Manually release this version", so you choose the
  day.

**Demo account (important).** Make a separate login just for Apple, for
example `appreview@yourdomain.com`.
- Give it a few prospects, a few appointments this week, one past
  appointment and a Business Plan, so the reviewer sees real screens.
- Don't connect it to your real Google or Zoom accounts.
- An empty demo account is the most common reason apps like this get sent
  back.
- Don't make it a manager or admin.
- Check it still exists before every submission. A reviewer may try
  **Delete my account** on it.

Click **Add for Review** → **Submit to App Review**.

---

## If Apple sends it back

| Apple says | What it means and what to reply |
|---|---|
| **4.2 Minimum Functionality** ("repackaged website") | Reply that the app includes native appointment reminders (notifications), the native share sheet for intake and recruit links, native spreadsheet export, an offline screen, and per-user account deletion. It's a working tool for a sales team, not marketing pages. Send me their message; I can add another native feature if needed. |
| **5.1.1(v) Account deletion** | Reply that it's in the app: tap your name (top right) → **Your account** → **Delete my account**. |
| **2.1 Can't sign in / no content** | The demo account is wrong or empty. Fix it, reply in the Resolution Center, and resubmit. |
| **Internal-only app** | Ask Apple for **Unlisted App Distribution** (developer.apple.com/support/unlisted-app-distribution). Your app is then reachable only by direct link and won't appear in search. That's often the best fit for a team tool. |
| **5.1.1(ix) Regulated field** (financial services) | Apple wants apps in this space submitted by the business, not an individual. If your developer account is an individual one, ask Apple Support about converting it to an organization (this needs a D-U-N-S number). |

---

## Later: updating the app

- **Website changes:** nothing to do. They appear in the app on its next
  launch.
- **App changes** (icon, name, plugins):
  1. Raise `"version"` in `package.json` (for example `1.0.1`) and upload
     it.
  2. In Codemagic, click **Start new build**.
  3. In App Store Connect, add a new version, pick the new build, and
     submit.
