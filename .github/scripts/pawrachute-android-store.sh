#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${CPI_PLAY_UPLOAD_P12_BASE64:?Missing Android upload key}"
: "${CPI_PLAY_UPLOAD_PASSWORD:?Missing Android upload key password}"
signing=$(mktemp -d "$RUNNER_TEMP/cpi-android-signing.XXXXXX")
key="$signing/upload.p12"
trap 'rm -f "$key"; rmdir "$signing"' EXIT
printf '%s' "$CPI_PLAY_UPLOAD_P12_BASE64" | base64 --decode > "$key"
unset CPI_PLAY_UPLOAD_P12_BASE64

out="$RUNNER_TEMP/cpi-store-output"
mkdir -p "$out"
aab="$out/Crystal-Path-Infinity-Android-1.0.0-44-Pawrachute.aab"
jarsigner -keystore "$key" -storetype PKCS12 -storepass:env CPI_PLAY_UPLOAD_PASSWORD \
  -signedjar "$aab" apps/mobile/android/app/build/outputs/bundle/release/app-release.aab cpi-play-upload
unset CPI_PLAY_UPLOAD_PASSWORD
rm -f "$key"
jarsigner -verify "$aab"
keytool -printcert -jarfile "$aab" > "$RUNNER_TEMP/cpi-android-signer.txt"
grep -Fq 'SHA256: 08:14:AA:45:DD:58:71:25:7C:4A:E2:F3:65:7B:74:31:EB:73:00:FA:9F:89:85:85:7C:22:E5:2D:F1:56:45:73' "$RUNNER_TEMP/cpi-android-signer.txt"

tool="$RUNNER_TEMP/bundletool-all-1.18.3.jar"
curl --fail --silent --show-error --location --retry 3 \
  'https://github.com/google/bundletool/releases/download/1.18.3/bundletool-all-1.18.3.jar' -o "$tool"
printf '%s  %s\n' a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29 "$tool" | sha256sum --check
java -jar "$tool" validate --bundle="$aab" > "$RUNNER_TEMP/cpi-bundle-validation.txt"
java -jar "$tool" dump manifest --bundle="$aab" > "$RUNNER_TEMP/cpi-bundle-manifest.xml"

python3 - "$aab" "$RUNNER_TEMP/cpi-bundle-manifest.xml" <<'PY'
import json
import os
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

bundle, manifest_file = sys.argv[1:]
manifest = ET.parse(manifest_file).getroot()
android = "{http://schemas.android.com/apk/res/android}"
app_id = "com.georgicole.crystalpath.infinity"
assert manifest.get("package") == app_id
assert manifest.get(android + "versionName") == os.environ["CPI_STORE_VERSION"]
assert manifest.get(android + "versionCode") == os.environ["CPI_STORE_BUILD_NUMBER"]
app = manifest.find("application")
assert app.get(android + "debuggable") != "true"
admob = next(node for node in app.findall("meta-data")
             if node.get(android + "name") == "com.google.android.gms.ads.APPLICATION_ID")
assert admob.get(android + "value") == "ca-app-pub-9243398419153145~7433632761"
assert all(node.get(android + "name") != "com.android.vending.BILLING"
           for node in manifest.findall("uses-permission"))

with zipfile.ZipFile(bundle) as archive:
    public = "base/assets/public/"
    paths = set(archive.namelist())
    info = json.loads(archive.read(public + "build-info.json"))
    assert info["appId"] == app_id and info["environment"] == "production"
    assert info["version"] == os.environ["CPI_STORE_VERSION"]
    for marker in ("qa-info.json", "player-preview-info.json", "release-info.json"):
        assert public + marker not in paths, marker
    scripts = b"\n".join(archive.read(name) for name in paths
                         if name.startswith(public + "assets/") and name.endswith(".js"))
    assert b"ca-app-pub-9243398419153145/2271422535" in scripts
    for marker in (b"ca-app-pub-3940256099942544", b"crystal-path-staging-api",
                   b"cpi.store.test.v1", b"cpi-mystery-lab"):
        assert marker not in scripts, marker
    assert archive.read(public + "brand/apple-touch-icon.png") == Path(
        "apps/mobile/public/brand/apple-touch-icon.png"
    ).read_bytes()
PY

for icon in ic_launcher.png ic_launcher_foreground.png; do
  java -Djava.awt.headless=true .github/scripts/pawrachute-store-icon.java "$aab" \
    "base/res/mipmap-xxxhdpi-v4/$icon" "apps/mobile/brand-assets/native/android/mipmap-xxxhdpi/$icon"
done

{
  printf 'Merged source: %s\nPackaging overlay: %s\nVersion: %s\nBuild: %s\nLauncher: Pawrachute\nInventory: live guest rewarded\nDistribution: signed export, pending store upload\n' \
    "$CPI_MERGED_SOURCE_SHA" "$GITHUB_SHA" "$CPI_STORE_VERSION" "$CPI_STORE_BUILD_NUMBER"
  sha256sum "$aab"
} | tee "$out/receipt.txt" >> "$GITHUB_STEP_SUMMARY"
