#!/usr/bin/env bash
set -euo pipefail

bundle_id=com.georgicole.crystalpath.infinity
team_id=C97T2A5255
project=apps/mobile/ios/App/App.xcodeproj
archive="$RUNNER_TEMP/CrystalPath.xcarchive"
signing="$RUNNER_TEMP/cpi-ios-signing"
keychain="$signing/crystal-path.keychain-db"
profile_dir="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"

require_current_main() {
  if [[ "$GITHUB_REPOSITORY" != georgi-cole/crystal-path-infinity ||
        "$GITHUB_EVENT_NAME" != workflow_dispatch || "$GITHUB_REF" != refs/heads/main ||
        "$GITHUB_RUN_ATTEMPT" != 1 || "$CPI_EXPECTED_SOURCE_SHA" != "$GITHUB_SHA" ||
        "$(git rev-parse HEAD)" != "$GITHUB_SHA" ||
        "$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq .object.sha)" != "$GITHUB_SHA" ]]; then
    echo 'Upload requires a new manual run on the supplied, current main commit.' >&2
    exit 1
  fi
}

preflight() {
  xcodebuild -version
  xcodebuild -help > "$RUNNER_TEMP/cpi-xcodebuild-help.txt" 2>&1 || true
  grep -Fq testFlightInternalTestingOnly "$RUNNER_TEMP/cpi-xcodebuild-help.txt"
  if [[ "$CPI_NATIVE_ADS" != "$VITE_REWARDED_ADS_ENABLED" ||
        "$VITE_ACCOUNT_API_BASE_URL" != https://crystal-path-staging-api.kolequant.workers.dev ]]; then
    echo 'Internal TestFlight requires matching ad flags and the Crystal Path staging gateway.' >&2
    exit 1
  fi
  if [[ "$CPI_IOS_UPLOAD" == true ]]; then
    require_current_main
    if [[ "$CPI_NATIVE_ADS" == true ]]; then
      local version
      version=$(node -p 'require("./apps/mobile/package.json").version')
      if [[ "${CPI_IOS_ADMOB_TEST_VERSION:-}" != "$version" ]]; then
        echo 'Confirm version-specific AdMob test mode in CPI_IOS_ADMOB_TEST_VERSION before upload.' >&2
        exit 1
      fi
    fi
    gh api --paginate --slurp "repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/check-runs" \
      > "$RUNNER_TEMP/cpi-source-checks.json"
    node --experimental-strip-types --input-type=module - "$RUNNER_TEMP/cpi-source-checks.json" <<'JS'
import { readFileSync } from 'node:fs';
import { assertSourceChecks } from './.github/scripts/unsigned-beta.mjs';

assertSourceChecks(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.env.GITHUB_SHA);
JS
  fi
}

install_signing() {
  : "${CPI_IOS_DISTRIBUTION_P12_PASSWORD:?Set the distribution certificate password}"
  umask 077
  mkdir -p "$signing"
  python3 - "$signing" <<'PY'
import base64
import os
import pathlib
import sys

directory = pathlib.Path(sys.argv[1])
for secret, filename in (
    ("CPI_IOS_DISTRIBUTION_P12_BASE64", "distribution.p12"),
    ("CPI_IOS_PROFILE_BASE64", "profile.mobileprovision"),
):
    value = os.environ.get(secret)
    if not value:
        raise SystemExit(f"Set {secret} in the TestFlight environment")
    (directory / filename).write_bytes(base64.b64decode(value, validate=True))
PY
  security cms -D -i "$signing/profile.mobileprovision" > "$signing/profile.plist"
  python3 - "$signing" "$project/project.pbxproj" "$team_id" "$bundle_id" <<'PY'
import datetime
import pathlib
import plistlib
import re
import sys

directory, project = map(pathlib.Path, sys.argv[1:3])
team, bundle = sys.argv[3:]
profile = plistlib.loads((directory / "profile.plist").read_bytes())
entitlements = profile["Entitlements"]
uuid = profile["UUID"]
if not (
    re.fullmatch(r"[A-Fa-f0-9-]{36}", uuid)
    and profile["TeamIdentifier"] == [team]
    and entitlements["application-identifier"] == f"{team}.{bundle}"
    and entitlements.get("get-task-allow") is False
    and "ProvisionedDevices" not in profile
    and not profile.get("ProvisionsAllDevices", False)
    and profile["ExpirationDate"] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
):
    raise SystemExit("Expected an unexpired Crystal Path App Store provisioning profile")

project_settings = project.read_text()
marker = "\t\t\t\tCODE_SIGNING_ALLOWED = NO;"
if project_settings.count(marker) != 2:
    raise SystemExit("The generated iOS app target signing settings changed")
settings = "\n\t\t\t\t".join((
    "CODE_SIGNING_ALLOWED = YES;",
    "CODE_SIGNING_REQUIRED = YES;",
    'CODE_SIGN_IDENTITY = "Apple Distribution";',
    f"DEVELOPMENT_TEAM = {team};",
    f'PROVISIONING_PROFILE_SPECIFIER = "{uuid}";',
))
project.write_text(project_settings.replace(marker, "\t\t\t\t" + settings))
(directory / "profile-uuid").write_text(uuid)
(directory / "ExportOptions.plist").write_bytes(plistlib.dumps({
    "method": "app-store-connect",
    "destination": "upload",
    "signingStyle": "manual",
    "teamID": team,
    "signingCertificate": "Apple Distribution",
    "provisioningProfiles": {bundle: uuid},
    "testFlightInternalTestingOnly": True,
    "manageAppVersionAndBuildNumber": False,
    "uploadSymbols": True,
}))
PY
  keychain_password=$(openssl rand -base64 32)
  echo "::add-mask::$keychain_password"
  security create-keychain -p "$keychain_password" "$keychain"
  security set-keychain-settings -lut 3600 "$keychain"
  security unlock-keychain -p "$keychain_password" "$keychain"
  security import "$signing/distribution.p12" -P "$CPI_IOS_DISTRIBUTION_P12_PASSWORD" \
    -T /usr/bin/codesign -T /usr/bin/security -t cert -f pkcs12 -k "$keychain"
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain"
  security list-keychains -d user -s "$keychain" "$HOME/Library/Keychains/login.keychain-db"
  mkdir -p "$profile_dir"
  cp "$signing/profile.mobileprovision" "$profile_dir/$(cat "$signing/profile-uuid").mobileprovision"
  rm -f "$signing/distribution.p12"
}

compile_archive() {
  local options=("CURRENT_PROJECT_VERSION=$GITHUB_RUN_NUMBER" DEBUG_INFORMATION_FORMAT=dwarf-with-dsym)
  if [[ "$CPI_IOS_UPLOAD" != true ]]; then
    options+=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=)
  fi
  xcodebuild archive -project "$project" -scheme App -configuration Release \
    -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$archive" \
    -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile "${options[@]}"
  local app="$archive/Products/Applications/App.app"
  python3 - "$app" "$bundle_id" "$GITHUB_RUN_NUMBER" <<'PY'
import json
import os
import pathlib
import plistlib
import sys

app = pathlib.Path(sys.argv[1])
bundle_id, build = sys.argv[2:]
info = plistlib.loads((app / "Info.plist").read_bytes())
public = app / "public"
metadata = json.loads((public / "build-info.json").read_text())
assert info["CFBundleIdentifier"] == metadata["appId"] == bundle_id
assert info["CFBundleShortVersionString"] == metadata["version"]
assert info["CFBundleVersion"] == build
assert info["UIDeviceFamily"] == [1]
assert metadata["environment"] == "production" and not (public / "qa-info.json").exists()
if os.environ["CPI_NATIVE_ADS"] == "true":
    assert info["GADApplicationIdentifier"] == "ca-app-pub-9243398419153145~7303584917"
else:
    assert "GADApplicationIdentifier" not in info
PY
  if [[ "$CPI_IOS_UPLOAD" == true ]]; then
    codesign --verify --deep --strict "$app"
    codesign -d --verbose=4 "$app" 2>&1 | grep -Fx "TeamIdentifier=$team_id"
  fi
  printf '### Crystal Path iOS archive\n\nBundle: %s\n\nBuild: %s\n\nSource: %s\n\nRewarded ads test: %s\n\n' \
    "$bundle_id" "$GITHUB_RUN_NUMBER" "$GITHUB_SHA" "$CPI_NATIVE_ADS" >> "$GITHUB_STEP_SUMMARY"
  if [[ "$CPI_IOS_UPLOAD" != true ]]; then
    printf 'Unsigned verification archive. No Apple credentials used.\n' >> "$GITHUB_STEP_SUMMARY"
  fi
}

upload() {
  require_current_main
  umask 077
  local key="$signing/upload.p8"
  trap 'rm -f "$RUNNER_TEMP/cpi-ios-signing/upload.p8"' EXIT
  python3 - "$key" <<'PY'
import base64
import os
import pathlib
import re
import sys
import uuid

key_id = os.environ.get("CPI_ASC_UPLOAD_KEY_ID", "")
issuer = os.environ.get("CPI_ASC_UPLOAD_ISSUER_ID", "")
key = os.environ.get("CPI_ASC_UPLOAD_KEY_BASE64", "")
if not re.fullmatch(r"[A-Z0-9]{10}", key_id) or not issuer or not key:
    raise SystemExit("Set the App Store Connect upload key, key ID and issuer ID")
uuid.UUID(issuer)
pathlib.Path(sys.argv[1]).write_bytes(base64.b64decode(key, validate=True))
PY
  xcodebuild -exportArchive -archivePath "$archive" -exportPath "$signing/export" \
    -exportOptionsPlist "$signing/ExportOptions.plist" -allowProvisioningUpdates \
    -authenticationKeyPath "$key" -authenticationKeyID "$CPI_ASC_UPLOAD_KEY_ID" \
    -authenticationKeyIssuerID "$CPI_ASC_UPLOAD_ISSUER_ID"
  printf 'Sent to App Store Connect as an internal TestFlight build for Apple processing.\n' \
    >> "$GITHUB_STEP_SUMMARY"
}

cleanup() {
  if [[ -f "$signing/profile-uuid" ]]; then
    rm -f "$profile_dir/$(cat "$signing/profile-uuid").mobileprovision"
  fi
  if [[ -f "$keychain" ]]; then security delete-keychain "$keychain"; fi
  rm -f "$signing/distribution.p12" "$signing/profile.mobileprovision" "$signing/profile.plist" \
    "$signing/profile-uuid" "$signing/upload.p8" "$signing/ExportOptions.plist"
}

case "$1" in
  preflight) preflight ;;
  install-signing) install_signing ;;
  archive) compile_archive ;;
  upload) upload ;;
  cleanup) cleanup ;;
  *) echo 'Usage: ios-testflight.sh preflight|install-signing|archive|upload|cleanup' >&2; exit 1 ;;
esac
