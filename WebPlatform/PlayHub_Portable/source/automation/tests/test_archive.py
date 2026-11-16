"""Generated temporary archives are regression fixtures, not game implementations."""

from pathlib import Path
import stat
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from platform_check import archive as validator


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.path = self.root / "fixture.zip"

    def make(self, entries=None, compression=zipfile.ZIP_STORED):
        entries = entries if entries is not None else [("index.html", b"<!doctype html><title>Validator fixture</title>")]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(self.path, "w", compression=compression) as target:
                for name, content in entries:
                    target.writestr(name, content)
        return self.path

    def checks(self):
        return validator.validate_archive(self.path)

    def assertFailed(self, identifier=None):
        checks = self.checks()
        failures = [c for c in checks if c["status"] == "fail"]
        self.assertTrue(failures, checks)
        if identifier:
            self.assertIn(identifier, [c["id"] for c in failures], checks)
        return checks

    def test_valid_archive_and_report_contract(self):
        self.make([("index.html", b"<canvas></canvas>"), ("assets/", b""), ("assets/app.js", b"console.log('fixture')")])
        checks = self.checks()
        self.assertFalse([c for c in checks if c["status"] == "fail"], checks)
        self.assertTrue(next(c for c in checks if c["id"] == "ZIP-008")["details"]["full_crc_verified"])
        for check in checks:
            self.assertTrue({"id", "title", "status", "message"} <= check.keys())
            self.assertIn(check["status"], {"pass", "fail", "warning", "skip"})
        self.assertEqual(list(self.root.iterdir()), [self.path], "No files may be extracted")

    def test_deflate_supported(self):
        self.make(compression=zipfile.ZIP_DEFLATED)
        self.assertFalse([c for c in self.checks() if c["status"] == "fail"])

    def test_missing_file_returns_result(self):
        self.assertFailed("ZIP-001")

    def test_not_a_zip(self):
        self.path.write_bytes(b"not a ZIP")
        self.assertFailed("ZIP-002")

    def test_directory_input(self):
        self.path.mkdir()
        self.assertFailed("ZIP-001")

    def test_archive_symlink(self):
        target = self.root / "real.zip"
        target.write_bytes(b"ignored")
        self.path.symlink_to(target)
        self.assertFailed("ZIP-001")

    def test_traversal_absolute_drive_and_backslash(self):
        for name in ["../escape.js", "a/../../escape", "/absolute.js", "C:/drive.js", "a\\b.js", "a//b", "a/./b", "a:b", "CON.txt"]:
            with self.subTest(name=name):
                self.make([("index.html", b"<html></html>"), (name, b"bad")])
                self.assertFailed("ZIP-003")

    def test_duplicate_path(self):
        self.make([("index.html", b"first"), ("index.html", b"second")])
        self.assertFailed("ZIP-003")

    def test_casefold_collision(self):
        self.make([("index.html", b"entry"), ("assets/A.js", b"a"), ("assets/a.js", b"b")])
        self.assertFailed("ZIP-003")

    def test_implicit_directory_casefold_collision(self):
        self.make([("index.html", b"entry"), ("Assets/a.js", b"a"), ("assets/b.js", b"b")])
        self.assertFailed("ZIP-003")

    def test_unicode_normalization_collision(self):
        self.make([("index.html", b"entry"), ("caf\u00e9.js", b"a"), ("cafe\u0301.js", b"b")])
        self.assertFailed("ZIP-003")

    def test_file_as_parent_directory(self):
        self.make([("index.html", b"entry"), ("assets", b"file"), ("assets/app.js", b"child")])
        self.assertFailed("ZIP-003")

    def test_utf8_path_byte_limit(self):
        self.make([("index.html", b"entry"), ("\uac00" * 81, b"long")])
        self.assertFailed("ZIP-003")

    def test_symlink_member(self):
        link = zipfile.ZipInfo("link.js")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.make([("index.html", b"entry"), (link, b"../../outside")])
        self.assertFailed("ZIP-004")

    def test_special_file_member(self):
        member = zipfile.ZipInfo("pipe")
        member.create_system = 3
        member.external_attr = (stat.S_IFIFO | 0o600) << 16
        self.make([("index.html", b"entry"), (member, b"")])
        self.assertFailed("ZIP-004")

    def test_missing_empty_or_nested_entry(self):
        for entries in [[], [("index.html", b"")], [("nested/index.html", b"entry")], [("INDEX.HTML", b"entry")]]:
            with self.subTest(entries=entries):
                self.make(entries)
                self.assertFailed("ZIP-006")

    def test_compression_bomb_ratio(self):
        self.make([("index.html", b"entry"), ("bomb.txt", b"x" * 200000)], zipfile.ZIP_DEFLATED)
        checks = self.assertFailed("ZIP-005")
        self.assertEqual(next(c for c in checks if c["id"] == "ZIP-008")["status"], "skip")

    def test_archive_size_bound(self):
        self.make()
        with patch.object(validator, "MAX_ARCHIVE_BYTES", 1):
            self.assertFailed("ZIP-001")

    def test_expanded_and_individual_size_limits(self):
        self.make()
        with patch.object(validator, "MAX_EXPANDED_BYTES", 1):
            self.assertFailed("ZIP-005")
        with patch.object(validator, "MAX_MEMBER_BYTES", 1):
            self.assertFailed("ZIP-005")

    def test_entry_count_guard_before_zipfile(self):
        self.make([("index.html", b"entry"), ("a.js", b"a")])
        with patch.object(validator, "MAX_ENTRIES", 1), patch.object(validator.zipfile, "ZipFile", side_effect=AssertionError("must not parse")):
            self.assertFailed("ZIP-002")

    def test_forged_central_directory_count(self):
        self.make([("index.html", b"entry"), ("a.js", b"a")])
        data = bytearray(self.path.read_bytes())
        eocd = data.rfind(b"PK\x05\x06")
        struct.pack_into("<HH", data, eocd + 8, 1, 1)
        self.path.write_bytes(data)
        self.assertFailed("ZIP-002")

    def test_zip64_eocd_rejected(self):
        self.make()
        data = bytearray(self.path.read_bytes())
        eocd = data.rfind(b"PK\x05\x06")
        struct.pack_into("<HH", data, eocd + 8, 65535, 65535)
        self.path.write_bytes(data)
        self.assertFailed("ZIP-002")

    def test_encrypted_flag_rejected(self):
        self.make()
        data = bytearray(self.path.read_bytes())
        central = data.find(b"PK\x01\x02")
        struct.pack_into("<H", data, central + 8, 1)
        self.path.write_bytes(data)
        self.assertFailed("ZIP-004")

    def test_unsupported_compression(self):
        self.make(compression=zipfile.ZIP_BZIP2)
        self.assertFailed()

    def test_small_force_zip64_archive_rejected(self):
        with zipfile.ZipFile(self.path, "w") as target:
            with target.open("index.html", "w", force_zip64=True) as member:
                member.write(b"<html>fixture</html>")
        self.assertFailed("ZIP-002")

    def test_zip64_extra_field_without_size_sentinel_rejected(self):
        member = zipfile.ZipInfo("index.html")
        member.extra = struct.pack("<HHQQ", 0x0001, 16, 5, 5)
        self.make([(member, b"entry")])
        self.assertFailed("ZIP-002")

    def test_invalid_deflate_returns_failure_instead_of_raising(self):
        self.make(compression=zipfile.ZIP_DEFLATED)
        data = bytearray(self.path.read_bytes())
        name_length, extra_length = struct.unpack_from("<HH", data, 26)
        data[30 + name_length + extra_length] = 0x07  # Reserved DEFLATE block type.
        self.path.write_bytes(data)
        self.assertFailed("ZIP-008")

    def test_crc_corruption(self):
        self.make([("index.html", b"PAYLOAD_TO_CORRUPT")])
        data = bytearray(self.path.read_bytes())
        data[data.index(b"PAYLOAD_TO_CORRUPT")] ^= 1
        self.path.write_bytes(data)
        self.assertFailed("ZIP-008")

    def test_inspection_byte_budget_is_visible_warning(self):
        self.make([("index.html", b"entry payload exceeds budget")])
        with patch.object(validator, "MAX_INSPECTION_BYTES", 4):
            check = next(c for c in self.checks() if c["id"] == "ZIP-008")
        self.assertEqual(check["status"], "warning")
        self.assertFalse(check["details"]["full_crc_verified"])
        self.assertLessEqual(check["details"]["inspected_bytes"], 4)

    def test_inspection_deadline_is_visible_warning(self):
        self.make()
        with patch.object(validator, "MAX_INSPECTION_SECONDS", 0):
            check = next(c for c in self.checks() if c["id"] == "ZIP-008")
        self.assertEqual(check["status"], "warning")

    def test_nul_name_detected_before_zipinfo_truncation(self):
        self.make([("index.html", b"entry"), ("badXname", b"bad")])
        self.path.write_bytes(self.path.read_bytes().replace(b"badXname", b"bad\x00name"))
        self.assertFailed("ZIP-003")


if __name__ == "__main__":
    unittest.main()
