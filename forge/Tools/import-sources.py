"""Import the two supplied archives without executing their contents or overwriting files."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("studio", type=Path)
    parser.add_argument("web_projects", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    manifest_path = root / "Docs" / "imports.json"
    if manifest_path.exists():
        raise SystemExit("Import already recorded; refusing to overwrite the integration.")
    pending, archives, seen = [], [], set()
    for source, prefix, target in [(args.studio, "PlayForge_Studio_v18", "References/PlayForgeStudio/v18"),
                                    (args.web_projects, "WebProjects", "WebProjects")]:
        raw = source.read_bytes()
        archive_info = {"filename": source.name, "sha256": digest(raw), "bytes": len(raw), "files": []}
        with zipfile.ZipFile(source) as archive:
            if sum(entry.file_size for entry in archive.infolist()) > 256 * 1024 * 1024:
                raise ValueError("Archive exceeds the expected import size")
            for entry in archive.infolist():
                parts = PurePosixPath(entry.filename).parts
                if (not parts or parts[0] != prefix or ".." in parts or "\\" in entry.filename
                        or ":" in entry.filename or stat.S_ISLNK(entry.external_attr >> 16)):
                    raise ValueError(f"Unsafe archive path: {entry.filename}")
                if entry.is_dir():
                    continue
                relative = PurePosixPath(target, *parts[1:]).as_posix()
                destination = root / relative
                destination.resolve().relative_to(root)
                if destination.exists() or relative.casefold() in seen:
                    raise ValueError(f"Refusing to overwrite: {relative}")
                seen.add(relative.casefold())
                data = archive.read(entry)  # zipfile validates CRC while reading.
                pending.append((destination, data))
                archive_info["files"].append({"source": entry.filename, "destination": relative,
                                               "bytes": len(data), "sha256": digest(data)})
        archives.append(archive_info)
    for destination, data in pending:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps({"imported_on": "2026-11-17", "archives": archives},
                                         ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"files": len(pending), "bytes": sum(len(data) for _, data in pending),
                      "manifest": str(manifest_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
