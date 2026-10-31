# GENMERCH Android test app

This is a standalone Android WebView wrapper for the live GENMERCH storefront.

- Website loaded by the app: https://shopgenmerch.com/
- Android application ID: com.shopgenmerch.app.debug (test/debug build)
- Minimum Android version: Android 6.0 (API 23)
- Target SDK: Android 16 (API 36)
- Website source, Supabase configuration, and production deployment are not modified by this Android project.

## Build locally

Install JDK 17, Android SDK Platform 36, and Android Build Tools 36.0.0. From this directory run:

```bash
gradle --version
gradle :app:assembleDebug
```

The APK will be created at:

`app/build/outputs/apk/debug/app-debug.apk`

## Test build

The GitHub Actions workflow on branch `android-apk-build` builds the debug APK and uploads it as a workflow artifact named `GENMERCH-Android-test-APK`.

The app opens the live website, so regular website deployments are reflected automatically when the app is opened or refreshed. The APK only needs rebuilding for changes to the native Android wrapper itself.

This is a test installer, not a Play Store release. It is debug-signed for direct installation on Android devices.
