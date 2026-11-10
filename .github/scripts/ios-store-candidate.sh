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
ipa="$output/Crystal-Path-Infinity-iPhone-1.0.0-44-Pawrachute.ipa"
mv "${packages[0]}" "$ipa"
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
assert info["CFBundleIcons"]["CFBundlePrimaryIcon"]["CFBundleIconName"] == "AppIcon"
assert metadata["environment"] == "production"
assert (public / "brand/apple-touch-icon.png").read_bytes() == Path(
    "apps/mobile/public/brand/apple-touch-icon.png"
).read_bytes()
assert "NativePurchases" not in (app / "capacitor.config.json").read_text()
for marker in ("qa-info.json", "player-preview-info.json", "release-info.json"):
    assert not (public / marker).exists(), marker
scripts = "\n".join(asset.read_text(encoding="utf-8") for asset in (public / "assets").glob("*.js"))
assert "ca-app-pub-9243398419153145/8645259199" in scripts
for marker in ("ca-app-pub-3940256099942544", "crystal-path-staging-api", "cpi.store.test.v1", "cpi-mystery-lab"):
    assert marker not in scripts, marker
PY

# Xcode resamples the launcher slot. Compare the packaged iPhone icon to
# the approved artwork after decoding both through the same native renderer.
source_icon=apps/mobile/brand-assets/native/ios/AppIcon.appiconset/AppIcon-512@2x.png
sips -s format bmp -z 64 64 "$source_icon" --out "$RUNNER_TEMP/cpi-source-icon.bmp" >/dev/null
sips -s format bmp -z 64 64 "$app/AppIcon60x60@2x.png" --out "$RUNNER_TEMP/cpi-ipa-icon.bmp" >/dev/null
python3 - "$RUNNER_TEMP/cpi-source-icon.bmp" "$RUNNER_TEMP/cpi-ipa-icon.bmp" <<'PY'
from pathlib import Path
import struct
import sys

def colors(path):
    data = Path(path).read_bytes()
    assert data[:2] == b"BM"
    offset, = struct.unpack_from("<I", data, 10)
    width, height, planes, bits, compression = struct.unpack_from("<iiHHI", data, 18)
    assert width == abs(height) == 64 and planes == 1 and bits in (24, 32)
    assert compression in (0, 3)
    pixel = bits // 8
    stride = (width * pixel + 3) // 4 * 4
    rows = range(height - 1, -1, -1) if height > 0 else range(-height)
    return [data[offset + y * stride + x * pixel + channel]
            for y in rows for x in range(width) for channel in range(3)]

expected, actual = map(colors, sys.argv[1:])
error = sum(abs(x - y) for x, y in zip(expected, actual)) / len(expected)
assert error < 8, f"Packaged iPhone icon differs from Pawrachute source ({error:.2f})"
print(f"Verified Pawrachute iPhone launcher art (mean channel difference {error:.2f})")
PY

{
  printf 'Merged source: %s\nPackaging overlay: %s\nVersion: %s\nBuild: %s\nLauncher: Pawrachute\nInventory: live guest rewarded\nDistribution: signed export, pending store upload\n' \
    "$CPI_MERGED_SOURCE_SHA" "$GITHUB_SHA" "$CPI_STORE_VERSION" "$CPI_STORE_BUILD_NUMBER"
  shasum -a 256 "$ipa"
} | tee "$output/receipt.txt" >> "$GITHUB_STEP_SUMMARY"
