"""Verify only generated unsigned CPI candidates. Never sign, upload or use credentials."""
from __future__ import annotations

import json
import os
import plistlib
import re
import struct
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "apps" / "mobile"
FORBIDDEN_SUFFIXES = {".keystore", ".jks", ".p12", ".p8", ".pem", ".key", ".mobileprovision"}


def verify_public_text(content: str) -> None:
    assert not re.search(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{12,}", content)


def metadata() -> dict:
    release = json.loads((APP / "dist/release-info.json").read_text())
    assert release["kind"] == "unsigned-beta-preparation"
    assert release["signing"] == "unsigned" and release["distribution"] == "not-uploaded"
    assert release["liveServices"] == dict(accounts="disabled", ranked="disabled", ads="disabled")
    assert release["app"]["appId"] in {
        "com.georgicole.crystalpath.infinity.staging",
        "com.georgicole.crystalpath.infinity",
    }
    return release


def verify_zip(path: Path, release: dict, prefix: str) -> None:
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        assert len(entries) <= 20000
        assert len({entry.filename for entry in entries}) == len(entries), "Duplicate archive members"
        assert sum(entry.file_size for entry in entries) < 512 * 1024 * 1024
        for entry in entries:
            parts = PurePosixPath(entry.filename).parts
            assert ".." not in parts and not entry.filename.startswith("/")
            assert "\\" not in entry.filename and not re.match(r"^[A-Za-z]:", entry.filename)
            assert not entry.flag_bits & 1, "Encrypted archive members are forbidden"
            assert Path(entry.filename).suffix.lower() not in FORBIDDEN_SUFFIXES
            assert not re.search(r"(?:^|/)META-INF/[^/]+\.(?:SF|RSA|DSA|EC)$", entry.filename, re.I)
            assert (entry.external_attr >> 16) & 0o170000 != 0o120000, "Archive contains symlink"
            if entry.filename.startswith(prefix) and re.search(r"\.(?:js|css|html|json|txt)$", entry.filename):
                assert entry.file_size < 8 * 1024 * 1024
                content = archive.read(entry).decode("utf-8")
                verify_public_text(content)
        assert json.loads(archive.read(prefix + "build-info.json")) == release["app"]
        assert json.loads(archive.read(prefix + "release-info.json")) == release


def has_apk_signing_block(path: Path) -> bool:
    data = path.read_bytes()
    footer = data.rfind(b"PK\x05\x06")
    assert footer >= 0 and len(data) >= footer + 22
    central = struct.unpack_from("<I", data, footer + 16)[0]
    assert central != 0xFFFFFFFF and 16 <= central <= len(data)
    return data[central - 16:central] == b"APK Sig Block 42"


def command(arguments: list[str]) -> str:
    result = subprocess.run(arguments, capture_output=True, text=True, check=False)
    assert result.returncode == 0, "Unsigned artifact inspection command failed"
    return result.stdout


MACH_O_MAGIC = {
    b"\xfe\xed\xfa\xce", b"\xce\xfa\xed\xfe",  # 32-bit
    b"\xfe\xed\xfa\xcf", b"\xcf\xfa\xed\xfe",  # 64-bit
    b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca",  # universal
    b"\xca\xfe\xba\xbf", b"\xbf\xba\xfe\xca",  # universal 64-bit
}


def verify_mach_o_unsigned(path: Path, inspect=command) -> bool:
    with path.open("rb") as source:
        magic = source.read(4)
    if magic not in MACH_O_MAGIC:
        return False
    load_commands = inspect(["xcrun", "otool", "-arch", "all", "-l", str(path)])
    assert re.search(r"\bcmd LC_(?:SEGMENT|SEGMENT_64)\b", load_commands), "No Mach-O load commands inspected"
    assert not re.search(r"\bcmd LC_CODE_SIGNATURE\b", load_commands), "Mach-O contains an embedded code signature"
    return True


def android(release: dict) -> dict:
    aab = APP / "android/app/build/outputs/bundle/release/app-release.aab"
    apk = APP / "android/app/build/outputs/apk/release/app-release-unsigned.apk"
    verify_zip(aab, release, "base/assets/public/")
    verify_zip(apk, release, "assets/public/")
    assert not has_apk_signing_block(apk), "APK contains a signing block"
    sdk = Path(os.environ["ANDROID_HOME"]) / "build-tools/36.0.0"
    badging = command([str(sdk / "aapt"), "dump", "badging", str(apk)])
    info = release["app"]
    assert f"package: name='{info['appId']}' versionCode='{release['buildNumber']}' versionName='{info['version']}'" in badging
    permissions = set(re.findall(r"uses-permission(?:-sdk-\d+)?: name='([^']+)'", badging))
    internal = info["appId"] + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"
    assert "android.permission.INTERNET" in permissions
    assert permissions <= {"android.permission.INTERNET", internal}
    merged = list((APP / "android/app/build/intermediates/merged_manifests").glob("release/**/AndroidManifest.xml"))
    assert merged, "Merged release manifest is missing"
    namespace = "{http://schemas.android.com/apk/res/android}"
    for path in merged:
        manifest = ET.parse(path).getroot()
        application = manifest.find("application")
        assert application is not None
        assert application.get(namespace + "usesCleartextTraffic") == "false"
        assert application.get(namespace + "allowBackup") == "false"
        assert application.get(namespace + "debuggable") != "true"
        assert application.find("activity").get(namespace + "screenOrientation") == "portrait"
    return {"crashSymbolsIncluded": False, "minification": "disabled-no-mapping",
            "artifactVerification": {
                "app-release-unsigned.aab": {
                    "publicMetadataVerified": True, "nativeMetadataVerified": False,
                    "signatureChecks": ["jar-signatures-absent"],
                },
                "app-release-unsigned.apk": {
                    "publicMetadataVerified": True, "nativeMetadataVerified": True,
                    "signatureChecks": ["jar-signatures-absent", "apk-signing-block-absent"],
                },
            }}


def ios(release: dict) -> dict:
    archive = APP / "build/unsigned-beta/App.xcarchive"
    application = archive / "Products/Applications/App.app"
    inspected_mach_o = set()
    for path in archive.rglob("*"):
        assert not path.is_symlink(), "Unsigned archive contains a symlink"
        assert path.suffix.lower() not in FORBIDDEN_SUFFIXES
        assert path.name != "_CodeSignature", "Unsigned archive contains code signatures"
        if path.is_file() and path.is_relative_to(application) and verify_mach_o_unsigned(path):
            inspected_mach_o.add(path)
        if path.is_file() and path.is_relative_to(application / "public") and re.search(r"\.(?:js|css|html|json|txt)$", path.name):
            assert path.stat().st_size < 8 * 1024 * 1024
            verify_public_text(path.read_text())
    info = plistlib.loads((application / "Info.plist").read_bytes())
    assert info["CFBundleIdentifier"] == release["app"]["appId"]
    assert info["CFBundleShortVersionString"] == release["app"]["version"]
    assert info["CFBundleVersion"] == release["iosBuildNumber"]
    assert not any(key.startswith("GAD") or key.endswith("UsageDescription") for key in info)
    assert info["UISupportedInterfaceOrientations"] == ["UIInterfaceOrientationPortrait"]
    assert "NSAppTransportSecurity" not in info
    assert json.loads((application / "public/build-info.json").read_text()) == release["app"]
    assert json.loads((application / "public/release-info.json").read_text()) == release
    privacy = plistlib.loads((application / "PrivacyInfo.xcprivacy").read_bytes())
    assert privacy["NSPrivacyTracking"] is False
    assert privacy["NSPrivacyCollectedDataTypes"] == []
    symbols = archive / "dSYMs/App.app.dSYM"
    assert symbols.is_dir(), "Retain the device build dSYM before packaging"
    binary = application / info["CFBundleExecutable"]
    assert binary in inspected_mach_o, "Main executable was not inspected for embedded signatures"
    pattern = r"UUID: ([A-Fa-f0-9-]+)"
    binary_uuids = set(re.findall(pattern, command(["xcrun", "dwarfdump", "--uuid", str(binary)])))
    symbol_uuids = set(re.findall(pattern, command(["xcrun", "dwarfdump", "--uuid", str(symbols)])))
    assert binary_uuids and binary_uuids == symbol_uuids, "App and crash symbols must match"
    return {"crashSymbolsIncluded": True, "machOFilesInspected": len(inspected_mach_o),
            "artifactVerification": {"unsigned-ios-device-archive.tar.gz": {
                "publicMetadataVerified": True, "nativeMetadataVerified": True,
                "signatureChecks": ["bundle-signature-directories-absent", "provisioning-profiles-absent", "mach-o-code-signatures-absent"],
            }}}


def main() -> None:
    assert len(sys.argv) == 2 and sys.argv[1] in {"android", "ios"}
    platform = sys.argv[1]
    release = metadata()
    details = android(release) if platform == "android" else ios(release)
    report = dict(schemaVersion=1, platform=platform, unsigned=True,
                  appId=release["app"]["appId"], buildNumber=release["buildNumber"],
                  sourceSha=release["sourceSha"], **details)
    target = APP / f"artifacts/unsigned-{platform}-verification.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Unsigned {platform} artifact inspection completed; receipt records each artifact's exact scope.")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, AttributeError, KeyError, TypeError, ValueError, OSError, zipfile.BadZipFile):
        print("Unsigned binary verification failed; no artifact is approved for distribution.", file=sys.stderr)
        raise SystemExit(1)
