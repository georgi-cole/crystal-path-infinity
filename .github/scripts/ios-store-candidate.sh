#!/usr/bin/env bash
set -euo pipefail

project=apps/mobile/ios/App/App.xcodeproj
archive="$RUNNER_TEMP/CrystalPathStore.xcarchive"
signing="$RUNNER_TEMP/cpi-ios-signing"
output="$RUNNER_TEMP/cpi-store-output"
team_id=C97T2A5255

xcodebuild archive -project "$project" -scheme App -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$archive" \
  -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile \
  DEBUG_INFORMATION_FORMAT=dwarf-with-dsym

# The shared signing installer verifies the certificate/profile and prepares Xcode.
# Export this candidate to disk for review, with the internal-only option disabled.
options="$signing/ExportOptions.plist"
/usr/libexec/PlistBuddy -c 'Set :destination export' "$options"
/usr/libexec/PlistBuddy -c 'Set :testFlightInternalTestingOnly false' "$options"
xcodebuild -exportArchive -archivePath "$archive" -exportOptionsPlist "$options" -exportPath "$output"

packages=("$output"/*.ipa)
[[ ${#packages[@]} == 1 && -f "${packages[0]}" ]]
ipa="${packages[0]}"
unzip -q "$ipa" -d "$RUNNER_TEMP/cpi-store-inspection"
app="$RUNNER_TEMP/cpi-store-inspection/Payload/App.app"
codesign --verify --deep --strict "$app"
codesign -d --verbose=4 "$app" 2>&1 | grep -Fx "TeamIdentifier=$team_id"

python3 - "$app" <<'PY'
import json
import os
from pathlib import Path
import plistlib
import sys

app = Path(sys.argv[1])
public = app / "public"
info = plistlib.loads((app / "Info.plist").read_bytes())
metadata = json.loads((public / "build-info.json").read_text())
assert info["CFBundleIdentifier"] == metadata["appId"] == "com.georgicole.crystalpath.infinity"
assert info["CFBundleShortVersionString"] == metadata["version"] == os.environ["CPI_STORE_VERSION"]
assert info["CFBundleVersion"] == os.environ["CPI_STORE_BUILD_NUMBER"]
assert info["GADApplicationIdentifier"] == "ca-app-pub-9243398419153145~7303584917"
assert "CpiGoogleSignInClientID" not in info and info["UIDeviceFamily"] == [1]
assert any('com.georgicole.crystalpath.infinity' in item['CFBundleURLSchemes'] for item in info['CFBundleURLTypes'])
accounts = json.loads((public / 'account-services-info.json').read_text())
assert accounts['kind'] == 'production-mobile' and accounts['gateway'] == 'https://crystalpath-api.kolequant.xyz/cpi'
assert accounts['providers'] == ['apple','google','email'] and accounts['ranked'] is False
assert metadata["environment"] == "production"
for marker in ("qa-info.json", "player-preview-info.json", "release-info.json"):
    assert not (public / marker).exists(), marker
scripts = "\n".join(asset.read_text(encoding="utf-8") for asset in (public / "assets").glob("*.js"))
assert "ca-app-pub-9243398419153145/8645259199" in scripts
assert '/identity/mobile/callback' in scripts
for marker in ("ca-app-pub-3940256099942544", "cpi.store.test.v1", "cpi-mystery-lab"):
    assert marker not in scripts, marker
PY

{
  printf 'Source: %s\nVersion: %s\nBuild: %s\nInventory: live guest rewarded\nDistribution: signed export, pending store upload\n' \
    "$GITHUB_SHA" "$CPI_STORE_VERSION" "$CPI_STORE_BUILD_NUMBER"
  shasum -a 256 "$ipa"
} | tee "$output/receipt.txt" >> "$GITHUB_STEP_SUMMARY"
