#!/usr/bin/env python3
"""Selectively fetch Godot 4.6.3 native release templates from its official ZIP.

Only HTTPS byte ranges are read. A server that ignores Range is rejected before
reading the response body; the complete 1.2 GB archive is never downloaded.
Every extracted entry must match the ZIP central-directory size and CRC32.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib
from datetime import datetime, timezone
from pathlib import Path

URL = "https://godot-releases.nbg1.your-objectstorage.com/4.6.3-stable/Godot_v4.6.3-stable_export_templates.tpz"
VERSION = "4.6.3.stable"
EXPECTED_SIZE = 1255918323
WANTED = ("linux_release.x86_64", "windows_release_x86_64.exe")
CHUNK_SIZE = 4 * 1024 * 1024

class RangeReader:
    def __init__(self, url: str, total: int, timeout: int = 30):
        self.url = url
        self.total = total
        self.timeout = timeout
        self.bytes_read = 0
        self.requests = 0

    def read(self, start: int, length: int) -> bytes:
        if start < 0 or length < 0 or start + length > self.total:
            raise ValueError("Requested byte range is outside the verified archive length")
        if length == 0:
            return b""
        end = start + length - 1
        request = urllib.request.Request(self.url, headers={
            "Range": f"bytes={start}-{end}",
            "Accept-Encoding": "identity",
            "User-Agent": "NexusFront-Godot-Port/11 (selective native export templates)",
        })
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    self.requests += 1
                    if response.status != 206:
                        # Do not read even a partial body after a 200/full-file fallback.
                        raise RuntimeError(f"Server ignored HTTP Range (status {response.status}); full download refused")
                    content_range = response.headers.get("Content-Range", "")
                    match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
                    if not match or tuple(map(int, match.groups())) != (start, end, self.total):
                        raise RuntimeError(f"Unexpected Content-Range {content_range!r}; expected {start}-{end}/{self.total}")
                    if response.headers.get("Content-Encoding", "identity") not in ("", "identity"):
                        raise RuntimeError("Encoded HTTP response cannot be used as ZIP byte offsets")
                    payload = response.read(length + 1)
                    self.bytes_read += len(payload)
                    if len(payload) != length:
                        raise RuntimeError(f"Short/oversized byte range ({len(payload)} bytes; expected {length})")
                    return payload
            except (urllib.error.URLError, TimeoutError) as error:
                if attempt == 2:
                    raise RuntimeError(f"Range transfer failed after three attempts: {error}") from error
                time.sleep(1 + attempt)
        raise RuntimeError("Unreachable range transfer state")


def directory(reader: RangeReader) -> list[dict]:
    tail_length = min(reader.total, 65557)
    tail = reader.read(reader.total - tail_length, tail_length)
    offset = tail.rfind(b"PK\x05\x06")
    if offset < 0 or len(tail) < offset + 22:
        raise RuntimeError("ZIP end-of-central-directory not found")
    signature, disk, central_disk, disk_count, total_count, central_size, central_offset, comment_length = struct.unpack_from("<4s4H2LH", tail, offset)
    if offset + 22 + comment_length != len(tail):
        raise RuntimeError("Invalid ZIP trailer length")
    if disk != 0 or central_disk != 0 or disk_count != total_count:
        raise RuntimeError("Multi-volume archives are unsupported")
    if total_count == 0xFFFF or central_offset == 0xFFFFFFFF or central_size == 0xFFFFFFFF:
        raise RuntimeError("ZIP64 archive requires a separately reviewed parser")
    if central_size > 4 * 1024 * 1024:
        raise RuntimeError("Unexpectedly large central directory")
    central = reader.read(central_offset, central_size)
    cursor = 0
    entries = []
    for _ in range(total_count):
        if len(central) < cursor + 46:
            raise RuntimeError("Truncated central directory")
        values = struct.unpack_from("<4s6H3L5H2L", central, cursor)
        (signature, made_by, required, flags, method, mod_time, mod_date,
         crc32, compressed_size, size, name_length, extra_length, comment_length,
         start_disk, internal_attrs, external_attrs, local_offset) = values
        if signature != b"PK\x01\x02" or start_disk != 0:
            raise RuntimeError("Invalid central-directory entry")
        start = cursor + 46
        name = central[start:start + name_length].decode("utf-8" if flags & 0x800 else "cp437")
        entries.append({"entry": name, "method": method, "flags": flags,
                        "crc32": f"{crc32:08x}", "compressed_bytes": compressed_size,
                        "bytes": size, "local_offset": local_offset})
        cursor = start + name_length + extra_length + comment_length
    if cursor != len(central):
        raise RuntimeError("Central-directory length mismatch")
    return entries


def extract(reader: RangeReader, entry: dict, output: Path) -> dict:
    if entry["flags"] & 1 or entry["method"] not in (0, 8):
        raise RuntimeError("Encrypted/unsupported compression in selected ZIP entry")
    if entry["bytes"] > 500 * 1024 * 1024 or entry["compressed_bytes"] > 200 * 1024 * 1024:
        raise RuntimeError("Selected native template exceeds the expected bounded size")
    local = reader.read(entry["local_offset"], 30)
    signature, required, flags, method, mtime, mdate, crc, compressed, size, name_length, extra_length = struct.unpack("<4s5H3L2H", local)
    if signature != b"PK\x03\x04" or method != entry["method"] or flags & 1:
        raise RuntimeError("Local ZIP header disagrees with selected entry")
    local_name = reader.read(entry["local_offset"] + 30, name_length)
    if local_name.decode("utf-8" if flags & 0x800 else "cp437") != entry["entry"]:
        raise RuntimeError("Local ZIP filename disagrees with central directory")
    data_offset = entry["local_offset"] + 30 + name_length + extra_length
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".partial")
    checksum = 0
    digest = hashlib.sha256()
    written = 0
    inflater = zlib.decompressobj(-zlib.MAX_WBITS) if method == 8 else None
    try:
        with temporary.open("wb") as target:
            for cursor in range(0, entry["compressed_bytes"], CHUNK_SIZE):
                amount = min(CHUNK_SIZE, entry["compressed_bytes"] - cursor)
                compressed_chunk = reader.read(data_offset + cursor, amount)
                decoded = inflater.decompress(compressed_chunk) if inflater else compressed_chunk
                written += len(decoded)
                if written > entry["bytes"]:
                    raise RuntimeError("Inflated entry exceeds its advertised size")
                target.write(decoded)
                digest.update(decoded)
                checksum = zlib.crc32(decoded, checksum)
                if cursor == 0 or cursor + amount == entry["compressed_bytes"]:
                    print(f"{output.name}: {cursor + amount}/{entry['compressed_bytes']} compressed bytes", flush=True)
            if inflater:
                decoded = inflater.flush()
                written += len(decoded)
                target.write(decoded)
                digest.update(decoded)
                checksum = zlib.crc32(decoded, checksum)
                if not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
                    raise RuntimeError("Invalid/unfinished DEFLATE stream")
        if written != entry["bytes"] or f"{checksum & 0xFFFFFFFF:08x}" != entry["crc32"]:
            raise RuntimeError(f"ZIP size/CRC verification failed for {output.name}")
        os.replace(temporary, output)
        if output.name.startswith("linux_"):
            output.chmod(0o755)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
    return {**entry, "sha256": digest.hexdigest(), "local_path": str(output.resolve()),
            "verified_crc32": True, "verified_size": True}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inspect", action="store_true", help="Read directory metadata only")
    parser.add_argument("--install-dir", type=Path,
                        default=Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "godot/export_templates" / VERSION)
    parser.add_argument("--manifest", type=Path, default=Path("exports/export-template-manifest.json"))
    args = parser.parse_args()
    reader = RangeReader(URL, EXPECTED_SIZE)
    entries = directory(reader)
    selected = []
    for name in WANTED:
        matches = [entry for entry in entries if entry["entry"] == "templates/" + name]
        if len(matches) != 1:
            raise RuntimeError(f"Expected exactly one official templates/{name} entry")
        selected.append(matches[0])
    print(json.dumps({"archive_bytes": reader.total, "entry_count": len(entries), "selected": selected}, ensure_ascii=False), flush=True)
    if args.inspect:
        return 0
    results = []
    for entry in selected:
        output = args.install_dir / Path(entry["entry"]).name
        results.append(extract(reader, entry, output))
    manifest = {"godot_version": VERSION, "official_url": URL,
                "archive_bytes": reader.total, "archive_fully_downloaded": False,
                "range_requests": reader.requests, "downloaded_bytes": reader.bytes_read,
                "retrieved_utc": datetime.now(timezone.utc).isoformat(), "entries": results,
                "verification": "ZIP entry CRC32 + uncompressed size + SHA-256 of installed bytes; full archive SHA-256 not computed"}
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(args.manifest.resolve()), "downloaded_bytes": reader.bytes_read,
                      "entries": [{"name": Path(e["local_path"]).name, "bytes": e["bytes"], "crc32": e["crc32"], "sha256": e["sha256"]} for e in results]}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, ValueError, struct.error) as error:
        print(f"Template fetch failed: {error}", file=sys.stderr)
        raise SystemExit(1)
