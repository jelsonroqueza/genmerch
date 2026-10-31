# GENMERCH iOS app

A native iOS SwiftUI + WKWebView app shell for the live GENMERCH storefront.

- Storefront: https://shopgenmerch.com/
- Bundle identifier: com.shopgenmerch.ios
- Minimum iOS version: iOS 15.0
- Supports iPhone and iPad.
- Uses the persistent WKWebView website data store so normal website sign-in cookies can persist on the device.
- Includes native back/reload controls, pull-to-refresh, a loading indicator, an offline/error retry screen, native web file upload selection, and external-app handling for telephone, email, messaging, and external web links.
- The app only loads GENMERCH and its configured Supabase project inside the app. Other top-level web destinations open outside the app.
- HTTPS is required for GENMERCH navigation. No certificate-error bypass is implemented.

## Build with Xcode

Open `GENMERCH.xcodeproj` on a Mac with Xcode installed, select the `GENMERCH` scheme, then build for an iOS device or simulator.

The GitHub Actions workflow on branch `ios-app-build` compiles the generic iOS device target without signing and uploads the app bundle as a build artifact.

## Signing and TestFlight

The CI artifact is an **unsigned build output**. It proves that the iOS device target compiles, but it is not an installable IPA and cannot be installed on a physical iPhone as-is.

To create a TestFlight-ready IPA, the Apple Developer team must configure Apple code signing and provisioning. This normally requires an active Apple Developer Program membership, an Apple Distribution certificate, an App Store provisioning profile, and secure CI signing configuration. Do not commit certificates, private keys, or provisioning profiles to this repository. Configure signing secrets securely in GitHub Actions before creating a signed release.

The iOS wrapper is isolated from the GENMERCH production website source and Supabase configuration. It loads the live storefront URL; it does not deploy or modify the storefront.
