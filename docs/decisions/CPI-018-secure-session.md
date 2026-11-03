# CPI-018 — protected native refresh-session foundation (first slice)

Issue: [#18](https://github.com/georgi-cole/crystal-path-infinity/issues/18)

## Scope and current state

This PR adds only the device-bound native secure credential layer needed for a recoverable account. **It does not enable email OTP, collect an address, create an account or claim verified ranked results.** Local practice, navigation and persistence remain unchanged. The CPI-017 migration stays untouched; no Supabase write or new secret is involved.

## Security boundary

- Access token: process memory only, never stored by this component.
- Refresh token: a single bounded printable-ASCII credential stored through the local Capacitor `CpiSecureSession` plugin. The API exposes only `readRefreshToken`, `writeRefreshToken`, and `clearRefreshToken`; arbitrary keys are not accepted.
- iOS: Keychain generic-password record, per-bundle service, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, no iCloud synchronization. If UserDefaults lacks the first-install marker, clear an orphaned Keychain item so uninstall/reinstall cannot log in a later device owner.
- Android: AndroidKeyStore 256-bit AES/GCM with per-encryption IV and 128-bit tag. Private SharedPreferences stores ciphertext + IV only. The generated AndroidManifest has `allowBackup=false`; invalidated or corrupt ciphertext fails closed.
- Web: `supported=false`, no persistent refresh token and no fallback to localStorage, IndexedDB or Capacitor Preferences. Future web sign-in would require a separately approved session model.

A failed read/write/clear is not silently treated as authentication or logout success. Callers must block account operations until state is resolved. Never print tokens, native error payloads, emails or secret values in app or CI logs.

## Follow-up slices before accepting issue #18

1. Define a server-enforced, market-aware account eligibility/consent path that defaults `privacyContext` to unknown. Guest practice remains available for all ages without account, DOB, or analytics opt-in. Child/unknown does not automatically become adult. Obtain reviewed privacy policy and jurisdiction-specific parental requirements **before email is collected**.
2. Add an environment-pinned Supabase publishable-key (not service-role) Auth adapter and OTP entry/verify UI with expiry, resend bounds, cancellation and offline handling. Do not use URLs containing access/refresh tokens; test account existence non-disclosure.
3. Build a refresh/revocation/logout state owner that serializes credential changes, invalidates stale in-flight requests and isolates identities. Test restart, token rotation, sign-out and device switching on Android/iOS; real OTP delivery and secure storage need device-level verification.
4. Add controlled server-side profile ownership and ranked read endpoints later; CPI-021 is responsible for authoritative runs. Never promote a local practice checkpoint or personal best to a verified result.
5. Test actual hosted guest/user A/user B Data API boundaries against the intended development project and repeat rollout approval before configuring production.

### Verification

`npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`, native generation `--check`, unsigned Android/iOS compilation and real native simulator launches remain required. The new unit tests specifically verify no web persistence, native write/read/clear behavior, input validation and fail-closed storage errors; template tests assert both native protected-storage implementations and registration.
