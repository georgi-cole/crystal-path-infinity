"""Synthetic archive fixtures test metadata/secret guards, not native compilation."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("unsigned_artifacts", Path(__file__).with_name("verify-unsigned-artifacts.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class UnsignedArtifactsTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "candidate.apk"
        self.release = {"app": {"appId": "com.georgicole.crystalpath.infinity.staging"}, "buildNumber": 42}

    def archive(self, extras=None, metadata=None):
        with zipfile.ZipFile(self.path, "w") as archive:
            archive.writestr("assets/public/build-info.json", json.dumps(self.release["app"]))
            archive.writestr("assets/public/release-info.json", json.dumps(metadata or self.release))
            for name, content in (extras or {}).items():
                archive.writestr(name, content)

    def test_matching_unsigned_metadata(self):
        self.archive()
        module.verify_zip(self.path, self.release, "assets/public/")
        self.assertFalse(module.has_apk_signing_block(self.path))

    def test_rejects_stale_build_and_signing_or_secret_files(self):
        self.archive(metadata={**self.release, "buildNumber": 43})
        with self.assertRaises(AssertionError):
            module.verify_zip(self.path, self.release, "assets/public/")
        for extras in [{"META-INF/CERT.RSA": "signature"}, {"private.p12": "secret"},
                       {"assets/public/key.txt": "-----BEGIN PRIVATE KEY-----"}, {"../outside": "escape"},
                       {"..\\outside": "escape"}, {"C:/private.key": "secret"},
                       {"assets/public/key.txt": "sb_secret_1234567890abcdef"}]:
            self.archive(extras)
            with self.assertRaises(AssertionError):
                module.verify_zip(self.path, self.release, "assets/public/")

    def test_inspects_all_mach_o_architectures_and_rejects_embedded_ad_hoc_signatures(self):
        self.path.write_bytes(b"\xcf\xfa\xed\xfe" + b"fixture")
        calls = []

        def unsigned(arguments):
            calls.append(arguments)
            return "Load command 0\n cmd LC_SEGMENT_64\n"

        self.assertTrue(module.verify_mach_o_unsigned(self.path, unsigned))
        self.assertEqual(calls[0], ["xcrun", "otool", "-arch", "all", "-l", str(self.path)])
        with self.assertRaises(AssertionError):
            module.verify_mach_o_unsigned(self.path, lambda _: "cmd LC_SEGMENT_64\ncmd LC_CODE_SIGNATURE\n")
        with self.assertRaises(AssertionError):
            module.verify_mach_o_unsigned(self.path, lambda _: "not an inspected binary")
        self.path.write_bytes(b"not-mach-o")
        self.assertFalse(module.verify_mach_o_unsigned(self.path, unsigned))


if __name__ == "__main__":
    unittest.main()
