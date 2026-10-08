# PaceLedger mobile apps

Both apps are built in the cloud with Codemagic, so no Mac or Android Studio
is needed. Both open big-pace-ledger.com, so website updates reach them
automatically.

**iPhone:** follow **APPLE-APP-STORE-GUIDE.md**.
- Store copy, privacy answers and reviewer notes: `app-assets/APP-STORE-LISTING.md`
- Screenshots: `app-assets/app-store-screenshots/`
- Icon and splash sources: `assets/`

**Android:** follow **GOOGLE-PLAY-GUIDE.md**.
- Store copy, data safety and content rating answers: `app-assets/GOOGLE-PLAY-LISTING.md`
- Icon, feature graphic and screenshots: `app-assets/google-play/`
- Icon and splash sources: `assets-android/`; notification icon and colors: `android-extras/`
- The Android build uses Capacitor 8 (Google Play requires Android 16 / API 36);
  `codemagic.yaml` switches to it only while building Android.

Shared:
- Build settings: `codemagic.yaml`
- App settings: `capacitor.config.json`
