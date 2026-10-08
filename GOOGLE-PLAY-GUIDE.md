# PaceLedger on Google Play — click-by-click (Windows, browser only)

Same idea as the iPhone app: **Codemagic** builds the Android app in the
cloud, and the app opens **big-pace-ledger.com**, so website updates reach it
automatically. You only rebuild for app-level changes.

What you'll need:
- the two upload-key files I sent separately: **paceledger-upload.jks** and
  **PACELEDGER-UPLOAD-KEY.txt** (keep them private, never put them on GitHub);
- your Google Play Console account;
- an Android phone for testing (yours or a teammate's).

> **Important: personal vs. organization Play account.** If your Play
> Console developer account is a *personal* account created after
> 13 November 2023, Google requires a **closed test with at least 12 testers
> for 14 days in a row** before you can publish to everyone (Part 6). With
> your team that's easy: invite 12+ advisors as testers. *Organization*
> accounts can skip it. Your account type is shown in Play Console →
> Settings (the gear) → Developer account → Account details.

---

## Part 1 — Upload this update (website + build files)

On GitHub, open each folder, then **Add file → Upload files → Commit changes**.

| Folder | Files |
|---|---|
| top level of the repo | `codemagic.yaml`, `capacitor.config.json`, `GOOGLE-PLAY-GUIDE.md` |
| `src` | `App.jsx`, `native.js` |
| `public` | `delete-account.html` (new), `privacy-policy.html` |
| new folder `assets-android` | the 5 images in it |
| new folder `android-extras` | the whole folder (it has a `res` folder inside) |
| `app-assets` | `GOOGLE-PLAY-LISTING.md` and the `google-play` folder (optional, for reference) |

For the new folders: at the top level, **Add file → Upload files**, drag the
whole folder from the zip, then commit. GitHub keeps the folders inside.

Check: https://big-pace-ledger.com/delete-account.html opens.

None of this changes the iPhone app or the website's look.

---

## Part 2 — Create the app in Play Console (5 minutes)

1. Go to <https://play.google.com/console> → **Create app**.
2. Fill it in:
   - App name: `PaceLedger`
   - Default language: English (United States)
   - App or game: **App**
   - Free or paid: **Free**
   - Tick the two declarations.
3. Click **Create app**.

---

## Part 3 — Codemagic: add the upload key and build

**3a. Add the upload key** (one time)
1. Codemagic → **Team settings** (or Personal account settings) →
   **codemagic.yaml settings** → **Code signing identities** →
   **Android keystores** tab.
2. Upload **paceledger-upload.jks**, then fill in from
   **PACELEDGER-UPLOAD-KEY.txt**:
   - Keystore password
   - Key alias: `paceledger`
   - Key password (the same as the keystore password)
   - Reference name: `paceledger_upload` (exactly this; the build file looks for it)
3. Click **Add keystore**.

**3b. Build**
1. Codemagic → your app → **Start new build**.
2. Workflow: **Android — Google Play**, branch **main** → **Start new build**.
   It takes about 10–20 minutes.
3. When it's green, open the build and, under **Artifacts**, download the
   file ending in **.aab** (for example `app-release.aab`).

If it fails, open the red step, copy the last 30 or so lines and send them to me.

---

## Part 4 — Fill in "App content" and the store listing

Play Console → your app. Everything to paste is in
`app-assets/GOOGLE-PLAY-LISTING.md`. The Dashboard shows these as a
checklist ("Set up your app"); do each one:

1. **App access**: restricted, with the demo login (same as Apple's).
2. **Ads**: No.
3. **Content rating**: the questionnaire answers are in the listing file.
   Result: Everyone.
4. **Target audience**: 18 and over.
5. **Data safety**: answers in the listing file. The delete-account URL is
   `https://big-pace-ledger.com/delete-account.html`.
6. **Government apps / Financial features / Health / News / Advertising ID**:
   answers in the listing file (all "no", "doesn't provide").
7. **Store settings**: category **Business**, contact email, website.
8. **Main store listing**: name, short and full description, then upload:
   - App icon: `app-assets/google-play/app-icon-512.png`
   - Feature graphic: `app-assets/google-play/feature-graphic-1024x500.png`
   - Phone screenshots: the five files in `app-assets/google-play/phone-screenshots/`
   - Leave tablet screenshots empty.

---

## Part 5 — Test it on a phone (Internal testing, no review)

1. Play Console → **Test and release** → **Testing** → **Internal testing** →
   **Create new release**.
2. The first time, it asks about **Play App Signing**: choose
   **Use Google-generated key** (recommended) and continue. Google keeps the
   real app-signing key safe; yours is only the upload key.
3. Upload the **.aab** from Codemagic. Release name fills itself in.
   Release notes: `First release.` → **Next** → **Save and publish**.
4. **Testers** tab → **Create email list** → name it `Team`, add your Gmail
   (and anyone testing with you) → **Save** → tick the list → **Save**.
5. Copy the **Join on the web** link, open it on the Android phone (signed in
   with that Gmail), tap **Accept invite**, then **Download it on Google Play**.

Check on the phone:
- You can log in, and Today loads.
- The top of the screen is navy with white icons; nothing hides under the camera
  or the bottom bar.
- **Turn on** reminders shows Android's "Allow notifications?" prompt. Then
  an **On-time reminders → Allow** card appears: tap it, switch on
  **Allow setting alarms and reminders**, and come back.
- The phone's **Back** button closes an open window, then goes back to Today,
  then leaves the app.
- **Calendar → Connect Google Calendar** opens a browser tab; after
  connecting, close it and the Calendar shows connected.
- **Share link** and **Export** open Android's share menu.
- Airplane mode, then reopen: the "You're offline" screen shows.

---

## Part 6 — Closed test (only for new personal accounts)

Skip to Part 7 if your account is an organization account.

1. **Test and release → Testing → Closed testing → Create track**, or use
   the default **Alpha** track → **Manage track**.
2. **Testers** tab → create an email list with **at least 12** teammates'
   Gmail addresses (Android users) → **Save**.
3. **Create new release** → **Add from library** → pick the same build →
   **Next** → **Save** → **Send for review** (a quick check by Google).
4. Once it's approved, share the **Join on the web** link with the 12+ testers.
   Each opens it, taps **Accept invite** and installs the app. They need to
   **stay opted in for 14 days in a row**; using the app now and then helps.
5. After 14 days: **Dashboard → Apply for production**. Answer the three short
   sections (what testers did, who the app is for, what changed). Google
   usually answers within 7 days.

---

## Part 7 — Publish to everyone (Production)

1. **Test and release → Production → Countries/regions** → add
   **United States** (and any other country where you have advisors).
2. **Create new release** → **Add from library** → pick the build →
   release notes → **Next** → **Save**.
3. **Publishing overview** (left menu) → **Send changes for review**.
   Reviews usually take from a few hours to a few days.

To control the launch day, turn on **Managed publishing** in Publishing
overview first, then click **Publish** when you're ready.

---

## If Google sends it back

| Google says | What to do |
|---|---|
| **Can't log in / App access** | Check the demo login still works and has data. Update **App content → App access**. |
| **Data safety doesn't match** | Send me the message; usually one data type needs adding. |
| **Account deletion** | Point them to `https://big-pace-ledger.com/delete-account.html` and the in-app steps. |
| **Minimum functionality / webview** | Reply that the app has native reminders, the Android share menu, spreadsheet export, an offline screen and in-app account deletion, and that big-pace-ledger.com is our own service. Send me the message if they insist. |

---

## Later: updating the Android app

- **Website changes:** nothing to do; they show up in the app on the next launch.
- **App changes** (icon, name, plugins):
  1. Raise `"version"` in `package.json` (for example `1.0.1`) and upload it.
  2. Codemagic → **Start new build** → **Android — Google Play**.
  3. Play Console → Production → **Create new release** → upload the new .aab.

Each Codemagic build gets a higher build number automatically, which Google
Play requires.
