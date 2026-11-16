"""Read-only, local catalog checks for an immutable CI checkout.

This module does not build, execute, fetch, publish, or sanitize games.  Disabled
entries still have to satisfy the repository contract; publication eligibility
is computed separately.  JSON/HTML reads and directory walks have explicit
budgets.  Run against an immutable checkout: this is not a filesystem sandbox
against another process concurrently replacing parent directories.
"""

from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
from itertools import islice
import json
import math
import os
from pathlib import Path
import re
import stat
import struct
import unicodedata
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

from jsonschema import Draft202012Validator

MAX_JSON_BYTES = 1024 * 1024
MAX_HTML_BYTES = 2 * 1024 * 1024
MAX_HTML_TOTAL_BYTES = 8 * 1024 * 1024
MAX_FILE_BYTES = 100 * 1024 * 1024
MAX_GAME_BYTES = 300 * 1024 * 1024
MAX_TREE_ENTRIES = 2000
MAX_CATALOG_ENTRIES = 1000
MAX_DEPTH = 32
MAX_SVG_BYTES = 256 * 1024
ID_PATTERN = re.compile(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*\Z")


def _result(check_id: str, title: str, status: str, message: str, **extra) -> dict:
    return {"id": check_id, "title": title, "status": status,
            "message": message, **extra}


def _read(path: Path, limit: int) -> bytes:
    """Reject special files, final symlinks and oversized reads before parsing."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    fd = os.open(path, flags)
    with os.fdopen(fd, "rb") as stream:
        metadata = os.fstat(stream.fileno())
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError("일반 파일만 읽을 수 있습니다")
        if metadata.st_size > limit:
            raise ValueError(f"읽기 한도 {limit} bytes를 초과했습니다")
        value = stream.read(limit + 1)
        if len(value) > limit:
            raise ValueError(f"읽기 한도 {limit} bytes를 초과했습니다")
        return value


def _unique_object(pairs: list) -> dict:
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"중복 JSON 키: {key}")
        value[key] = item
    return value


def _json(path: Path) -> object:
    return json.loads(_read(path, MAX_JSON_BYTES).decode("utf-8-sig"),
                      object_pairs_hook=_unique_object,
                      parse_constant=lambda name: (_ for _ in ()).throw(
                          ValueError(f"JSON 비표준 숫자: {name}")))


def _guard(base: Path, relative: str) -> Path:
    """Resolve a strict repository-relative path without accepting symlinks."""
    if (not isinstance(relative, str) or not relative or "\\" in relative
            or ":" in relative or relative.startswith("/")
            or any(part in ("", ".", "..") for part in relative.split("/"))
            or any(ord(char) < 32 for char in relative)):
        raise ValueError(f"안전한 상대 경로가 아닙니다: {relative!r}")
    target = base
    for part in relative.split("/"):
        target = target / part
        if target.is_symlink():
            raise ValueError(f"symlink 경로는 허용하지 않습니다: {relative}")
    resolved = target.resolve(strict=True)
    if not resolved.is_relative_to(base):
        raise ValueError(f"프로젝트/게임 폴더 밖 경로입니다: {relative}")
    return resolved


def _schema(path: Path) -> Draft202012Validator:
    schema = _json(path)
    pending = [schema]
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            for key in ("$ref", "$dynamicRef"):
                if key in value and (not isinstance(value[key], str)
                                     or not value[key].startswith("#")):
                    raise ValueError("스키마의 외부 참조를 거부합니다. 네트워크 조회는 하지 않습니다")
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _schema_errors(validator: Draft202012Validator, value: object) -> list[str]:
    return [(f"/{'/'.join(map(str, error.absolute_path))}: {error.message}")[:1000]
            for error in islice(validator.iter_errors(value), 20)]


def _inventory(game: Path) -> tuple[list[Path], list[str], int]:
    files, issues, total, visited = [], [], 0, 0
    pending = [(game, 0)]
    folded = {}
    while pending:
        directory, depth = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                visited += 1
                if visited > MAX_TREE_ENTRIES:
                    issues.append(f"게임 폴더 항목 한도 {MAX_TREE_ENTRIES}개 초과")
                    return files, issues[:20], total
                path = Path(entry.path)
                relative = path.relative_to(game).as_posix()
                if len(relative.encode("utf-8")) > 240:
                    issues.append(f"경로 UTF-8 240 bytes 초과: {relative}")
                normalized = unicodedata.normalize("NFC", relative).casefold()
                previous = folded.get(normalized)
                if previous is not None and previous != relative:
                    issues.append(f"대소문자/Unicode 경로 충돌: {previous}, {relative}")
                folded[normalized] = relative
                metadata = entry.stat(follow_symlinks=False)
                if stat.S_ISLNK(metadata.st_mode):
                    issues.append(f"symlink 거부: {relative}")
                elif stat.S_ISDIR(metadata.st_mode):
                    if depth >= MAX_DEPTH:
                        issues.append(f"디렉터리 깊이 한도 초과: {relative}")
                    else:
                        pending.append((path, depth + 1))
                elif stat.S_ISREG(metadata.st_mode):
                    files.append(path)
                    total += metadata.st_size
                    if metadata.st_size > MAX_FILE_BYTES:
                        issues.append(f"개별 파일 100 MiB 초과: {relative}")
                    if total > MAX_GAME_BYTES:
                        issues.append("게임 폴더 전체 300 MiB 초과")
                        return files, issues[:20], total
                else:
                    issues.append(f"특수 파일 거부: {relative}")
    return files, issues[:20], total


class _AssetParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.references: list[tuple[str, str]] = []
        self.issues: list[str] = []

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "base":
            self.issues.append("base 태그는 상대 자산 경로 계약에서 지원하지 않습니다")
        if tag in ("iframe", "object", "embed"):
            self.issues.append(f"기본 실행 프로필에서 {tag} 임베드를 허용하지 않습니다")
        if tag == "meta" and (attributes.get("http-equiv") or "").lower() == "refresh":
            self.issues.append("meta refresh 이동을 허용하지 않습니다")
        reference_attributes = {
            "script": ("src",), "img": ("src",), "source": ("src",),
            "audio": ("src",), "video": ("src", "poster"),
            "track": ("src",), "input": ("src",), "iframe": ("src",),
            "object": ("data",), "embed": ("src",),
        }
        if tag == "link":
            rel = set((attributes.get("rel") or "").lower().split())
            if rel & {"stylesheet", "icon", "preload", "modulepreload", "manifest", "prefetch", "apple-touch-icon"}:
                reference_attributes["link"] = ("href",)
        for attribute in reference_attributes.get(tag, ()):
            if attribute in attributes:
                self.references.append((attributes[attribute] or "", f"{tag}[{attribute}]"))
        if tag in ("img", "source") and "srcset" in attributes:
            srcset = attributes["srcset"] or ""
            if "data:" in srcset.lower():
                self.issues.append("srcset의 data URL은 지원하지 않습니다. 정적 상대 파일을 사용하세요")
                return
            for item in srcset.split(","):
                parts = item.strip().split()
                if (not parts or len(parts) > 2 or (len(parts) == 2
                        and not re.fullmatch(r"(?:[1-9]\d*w|(?:\d+(?:\.\d+)?|\.\d+)x)", parts[1]))):
                    self.issues.append("지원하지 않는 srcset 형식입니다")
                else:
                    self.references.append((parts[0], f"{tag}[srcset]"))


def _asset_path(reference: str, html_relative: str, context: str) -> str | None:
    if (not reference or reference != reference.strip() or "\\" in reference
            or any(ord(char) < 32 for char in reference)):
        raise ValueError(f"비어 있거나 잘못된 자산 URL: {reference!r}")
    parsed = urlsplit(reference)
    if parsed.scheme == "data" and context in ("img[src]", "video[poster]", "input[src]"):
        if re.match(r"data:image/(?:png|jpeg|gif|webp|avif);base64,", reference, re.I):
            return None
    if parsed.scheme or parsed.netloc or parsed.path.startswith("/"):
        raise ValueError(f"외부/절대 자산 URL 거부: {reference}")
    decoded = unquote(parsed.path, encoding="utf-8", errors="strict")
    if ("\\" in decoded or ":" in decoded or decoded.startswith("/")
            or any(ord(char) < 32 for char in decoded)
            or re.search(r"%[0-9A-Fa-f]{2}", decoded)):
        raise ValueError(f"잘못된 인코딩/경로의 자산 URL: {reference}")
    if not decoded:
        raise ValueError(f"파일 경로 없는 자산 URL: {reference}")
    parts = html_relative.split("/")[:-1]
    for part in decoded.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if not parts:
                raise ValueError(f"게임 폴더 이탈 자산: {reference}")
            parts.pop()
        else:
            parts.append(part)
    if not parts:
        raise ValueError(f"파일이 아닌 자산 URL: {reference}")
    return "/".join(parts)


def _svg_profile(path: Path) -> str:
    """A conservative static SVG authoring profile, not a browser sanitizer."""
    source = _read(path, MAX_SVG_BYTES).decode("utf-8-sig")
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b|<\?\s*xml-stylesheet\b", source, re.I):
        raise ValueError("SVG의 DTD·entity·외부 stylesheet 선언은 허용하지 않습니다")
    try:
        root = ElementTree.fromstring(source)
    except ElementTree.ParseError as error:
        raise ValueError(f"SVG XML 파싱 실패: {error}") from error
    namespace = "{http://www.w3.org/2000/svg}"
    if root.tag != namespace + "svg":
        raise ValueError("SVG 루트와 표준 SVG namespace가 필요합니다")
    allowed_elements = {"svg", "g", "rect", "circle", "ellipse", "line", "polyline",
                        "polygon", "path", "text", "tspan", "title", "desc"}
    allowed_attributes = {
        "id", "width", "height", "viewBox", "version", "preserveAspectRatio",
        "x", "y", "x1", "y1", "x2", "y2", "dx", "dy", "cx", "cy", "r", "rx", "ry",
        "d", "points", "fill", "fill-opacity", "fill-rule", "opacity", "stroke",
        "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
        "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit", "transform",
        "font-family", "font-size", "font-weight", "font-style", "text-anchor",
        "dominant-baseline", "alignment-baseline", "letter-spacing", "word-spacing",
        "role", "aria-label", "aria-labelledby", "aria-describedby", "focusable",
        "textLength", "lengthAdjust", "vector-effect",
    }
    pending, visited = [(root, 0)], 0
    while pending:
        element, depth = pending.pop()
        visited += 1
        if visited > 5000 or depth > MAX_DEPTH:
            raise ValueError("SVG 요소 수/깊이 검사 한도 초과")
        if (not isinstance(element.tag, str) or not element.tag.startswith(namespace)
                or element.tag[len(namespace):] not in allowed_elements):
            raise ValueError(f"지원하지 않는 SVG 요소: {element.tag}")
        for attribute, value in element.attrib.items():
            local_name = attribute.rsplit("}", 1)[-1]
            if local_name.lower().startswith("on"):
                raise ValueError("SVG 이벤트 속성은 허용하지 않습니다")
            if attribute not in allowed_attributes:
                raise ValueError(f"SVG 제한 프로필에서 지원하지 않는 속성: {attribute}")
            if "\\" in value or re.search(r"url\s*\(|(?:javascript|vbscript)\s*:|@import", value, re.I):
                raise ValueError("SVG의 url()·활성 URL·외부 스타일 참조는 허용하지 않습니다")
        pending.extend((child, depth + 1) for child in element)
    size_ok = True
    for key in ("width", "height"):
        value = root.attrib.get(key, "")
        match = re.fullmatch(r"(\d+(?:\.\d+)?|\.\d+)(?:px|%)?", value)
        size_ok = (size_ok and match is not None and math.isfinite(float(match.group(1)))
                   and float(match.group(1)) > 0)
    viewbox = root.attrib.get("viewBox")
    viewbox_ok = False
    if viewbox is not None:
        try:
            numbers = [float(number) for number in re.split(r"[\s,]+", viewbox.strip())]
        except ValueError as error:
            raise ValueError("SVG viewBox가 숫자 4개가 아닙니다") from error
        viewbox_ok = (len(numbers) == 4 and all(math.isfinite(number) for number in numbers)
                      and numbers[2] > 0 and numbers[3] > 0)
        if not viewbox_ok:
            raise ValueError("SVG viewBox의 폭과 높이는 유한한 양수여야 합니다")
    if not size_ok and not viewbox_ok:
        raise ValueError("SVG에 양수 width/height 또는 유효한 viewBox가 필요합니다")
    return "image/svg+xml"


def _image_header(path: Path) -> str:
    # Header identification is deliberately not a full image decoder or sanitizer.
    if path.suffix.lower() == ".svg":
        return _svg_profile(path)
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    fd = os.open(path, flags)
    with os.fdopen(fd, "rb") as stream:
        metadata = os.fstat(stream.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size == 0:
            raise ValueError("비어 있거나 일반 파일이 아닌 미디어입니다")
        header = stream.read(64)
    suffix = path.suffix.lower()
    if suffix == ".png" and header.startswith(b"\x89PNG\r\n\x1a\n") and len(header) >= 24:
        width, height = struct.unpack(">II", header[16:24])
        if header[12:16] == b"IHDR" and width > 0 and height > 0:
            return "image/png"
    if suffix in (".jpg", ".jpeg") and header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if suffix == ".gif" and header[:6] in (b"GIF87a", b"GIF89a") and len(header) >= 10:
        width, height = struct.unpack("<HH", header[6:10])
        if width > 0 and height > 0:
            return "image/gif"
    if suffix == ".webp" and header[:4] == b"RIFF" and header[8:12] == b"WEBP" and len(header) >= 20:
        if header[12:16] in (b"VP8 ", b"VP8L", b"VP8X"):
            return "image/webp"
    raise ValueError("지원하는 PNG/JPEG/GIF/WebP 확장자와 이미지 헤더가 일치하지 않습니다")


def _metadata_issues(manifest: dict) -> list[str]:
    issues = []
    groups = {"title": manifest.get("title"), "summary": manifest.get("summary")}
    seo = manifest.get("seo")
    if isinstance(seo, dict):
        groups.update({"seo.title": seo.get("title"), "seo.description": seo.get("description")})
    for field, translations in groups.items():
        if not isinstance(translations, dict):
            continue  # The JSON schema reports structural errors.
        for language in ("ko", "en"):
            text = translations.get(language)
            if not isinstance(text, str):
                continue
            if not text.strip():
                issues.append(f"{field}.{language}: 공백만 있는 메타데이터")
            if re.search(r"<\s*/?\s*[A-Za-z!]", text):
                issues.append(f"{field}.{language}: 메타데이터는 HTML 없는 일반 텍스트여야 합니다")
    for field in ("instructions", "rules"):
        translations = manifest.get(field)
        if not isinstance(translations, dict):
            continue
        for language, text in translations.items():
            if not isinstance(text, str):
                continue
            if len(text.strip()) < 20:
                issues.append(f"{field}.{language}: 의미 있는 본문이 20자 미만입니다")
            if re.search(r"<\s*(?:script|iframe|object|embed|style)\b|(?:javascript|vbscript)\s*:", text, re.I):
                issues.append(f"{field}.{language}: 허용하지 않는 활성 콘텐츠 표기")
    return issues[:20]


def validate_catalog(project_root: Path, catalog_path: Path, specs_dir: Path) -> list[dict]:
    """Return machine-readable findings; bad inputs are findings, not crashes."""
    results = []
    try:
        root = Path(project_root).resolve(strict=True)
        if not root.is_dir():
            raise ValueError("project_root가 디렉터리가 아닙니다")
        results.append(_result("CAT-ROOT", "프로젝트 루트", "pass", "프로젝트 디렉터리를 확인했습니다"))
    except (OSError, TypeError, ValueError, RuntimeError) as error:
        return [_result("CAT-ROOT", "프로젝트 루트", "fail", str(error))]
    validators = {}
    for name in ("catalog", "game.manifest"):
        try:
            validators[name] = _schema(Path(specs_dir) / f"{name}.schema.json")
            results.append(_result(f"CAT-SCHEMA-{name.upper()}", "로컬 스키마", "pass", f"{name} Draft 2020-12 스키마를 확인했습니다"))
        except Exception as error:
            results.append(_result(f"CAT-SCHEMA-{name.upper()}", "로컬 스키마", "fail", f"스키마를 사용할 수 없습니다: {error}"))
    if len(validators) != 2:
        return results
    try:
        candidate = Path(catalog_path)
        if candidate.is_absolute():
            candidate = candidate.relative_to(root)
        catalog_file = _guard(root, candidate.as_posix())
        catalog = _json(catalog_file)
        results.append(_result("CAT-READ", "카탈로그 읽기", "pass", "중복 JSON 키 없이 로컬 카탈로그를 읽었습니다"))
    except (OSError, ValueError, RuntimeError, RecursionError) as error:
        results.append(_result("CAT-READ", "카탈로그 읽기", "fail", str(error)))
        return results
    errors = _schema_errors(validators["catalog"], catalog)
    results.append(_result("CAT-CONTRACT", "카탈로그 스키마", "fail" if errors else "pass",
                           "카탈로그 계약 오류" if errors else "카탈로그 계약을 만족합니다", details=errors))
    entries = catalog.get("entries") if isinstance(catalog, dict) else None
    if not isinstance(entries, list) or len(entries) > MAX_CATALOG_ENTRIES:
        return results
    for field in ("id", "path"):
        counts = Counter(item[field] for item in entries if isinstance(item, dict)
                         and isinstance(item.get(field), str))
        duplicates = [value for value, count in counts.items() if count > 1]
        results.append(_result(f"CAT-UNIQUE-{field.upper()}", f"{field} 고유성",
                               "fail" if duplicates else "pass",
                               f"중복 {field} 발견" if duplicates else f"중복 {field}가 없습니다", details=duplicates))
    slug_owners, enabled, disabled, indexable, seen = {}, [], [], [], set()
    for number, entry in enumerate(entries, 1):
        prefix = f"CAT-G{number:04d}"
        if not isinstance(entry, dict):
            continue
        game_id, relative = entry.get("id"), entry.get("path")
        try:
            if (not isinstance(game_id, str) or not ID_PATTERN.fullmatch(game_id)
                    or len(game_id) > 64 or relative != f"games/{game_id}"):
                raise ValueError("id와 games/<id> 경로가 정확히 일치해야 합니다")
            game = _guard(root, relative)
            if not game.is_dir():
                raise ValueError("게임 경로가 디렉터리가 아닙니다")
            results.append(_result(prefix + "-PATH", "게임 경로", "pass", f"{game_id}: 경로 일치·폴더 존재"))
            if game in seen:
                results.append(_result(prefix + "-DUPLICATE", "중복 폴더 검사", "skip", "앞서 검사한 폴더입니다. 중복 계약 오류는 별도 보고했습니다"))
                continue
            seen.add(game)
            files, issues, byte_count = _inventory(game)
            results.append(_result(prefix + "-FILES", "파일 트리·격리", "fail" if issues else "pass",
                                   f"{game_id}: {len(files)}개 일반 파일, {byte_count} bytes", details=issues))
            manifest = _json(_guard(game, "game.manifest.json"))
        except (OSError, ValueError, RuntimeError, RecursionError) as error:
            results.append(_result(prefix + "-READ", "게임 파일 읽기", "fail", f"{game_id}: {error}"))
            continue
        errors = _schema_errors(validators["game.manifest"], manifest)
        results.append(_result(prefix + "-MANIFEST", "게임 manifest 스키마", "fail" if errors else "pass",
                               f"{game_id}: manifest 계약 검사", details=errors))
        if not isinstance(manifest, dict):
            continue
        identity_ok = manifest.get("id") == game_id and manifest.get("slug") == game_id
        results.append(_result(prefix + "-IDENTITY", "게임 ID·slug", "pass" if identity_ok else "fail",
                               "catalog id·폴더·manifest id·초기 slug 일치" if identity_ok else "catalog id·manifest id·slug가 다릅니다"))
        slug = manifest.get("slug")
        if isinstance(slug, str):
            slug_owners.setdefault(slug, []).append(game_id)
        metadata_issues = _metadata_issues(manifest)
        results.append(_result(prefix + "-SEO", "SEO·다국어 본문", "fail" if metadata_issues else "pass",
                               "메타데이터 내용 검사. 실제 SSR 렌더링 검사는 별도입니다", details=metadata_issues))
        if entry.get("enabled") is True:
            enabled.append(game_id)
            if isinstance(manifest.get("seo"), dict) and manifest["seo"].get("indexable") is True:
                indexable.append(game_id)
        elif entry.get("enabled") is False:
            disabled.append(game_id)
        try:
            entry_file = _guard(game, manifest.get("entry", ""))
            if not entry_file.is_file() or entry_file.stat().st_size == 0:
                raise ValueError("진입점이 비어 있거나 일반 파일이 아닙니다")
            results.append(_result(prefix + "-ENTRY", "진입 HTML", "pass", f"{game_id}: 비어 있지 않은 진입 파일 존재"))
        except (OSError, ValueError, RuntimeError, TypeError) as error:
            results.append(_result(prefix + "-ENTRY", "진입 HTML", "fail", str(error)))
        media = manifest.get("media")
        media_issues, identified = [], []
        if isinstance(media, dict):
            references = [media.get("cover")]
            if isinstance(media.get("screenshots"), list):
                references.extend(media["screenshots"])
            for reference in references:
                try:
                    path = _guard(game, reference)
                    identified.append({"path": reference, "headerMime": _image_header(path)})
                except (OSError, ValueError, RuntimeError, TypeError) as error:
                    media_issues.append(f"{reference}: {error}")
        else:
            media_issues.append("media 객체가 없습니다")
        results.append(_result(prefix + "-MEDIA", "표지·스크린샷 파일", "fail" if media_issues else "pass",
                               "미디어 존재·헤더/SVG 제한 프로필 검사(완전한 디코딩·렌더 보안 검증 아님)", details=media_issues[:20], evidence=identified))
        html_issues, text_bytes, reference_count = [], 0, 0
        for path in files:
            if path.suffix.lower() not in (".html", ".htm"):
                continue
            relative_html = path.relative_to(game).as_posix()
            try:
                raw = _read(_guard(game, relative_html), MAX_HTML_BYTES)
                text_bytes += len(raw)
                if text_bytes > MAX_HTML_TOTAL_BYTES:
                    raise ValueError("전체 HTML 검사 예산 8 MiB 초과")
                parser = _AssetParser()
                parser.feed(raw.decode("utf-8-sig"))
                parser.close()
                html_issues.extend(f"{relative_html}: {issue}" for issue in parser.issues)
                for reference, context in parser.references:
                    reference_count += 1
                    try:
                        resolved = _asset_path(reference, relative_html, context)
                        if resolved is not None:
                            resource = _guard(game, resolved)
                            if not resource.is_file():
                                raise ValueError("자산이 일반 파일이 아닙니다")
                    except (OSError, ValueError, RuntimeError) as error:
                        html_issues.append(f"{relative_html} {context}: {error}")
            except (OSError, ValueError, RuntimeError, RecursionError) as error:
                html_issues.append(f"{relative_html}: {error}")
            if text_bytes > MAX_HTML_TOTAL_BYTES:
                break
        results.append(_result(prefix + "-ASSETS", "HTML 정적 자산 참조", "fail" if html_issues else "pass",
                               f"{reference_count}개 선언 참조 확인; JS import/fetch·CSS url은 실행·추적하지 않음", details=html_issues[:20]))
    duplicate_slugs = {slug: owners for slug, owners in slug_owners.items() if len(owners) > 1}
    results.append(_result("CAT-UNIQUE-SLUG", "slug 고유성", "fail" if duplicate_slugs else "pass",
                           "slug 중복 검사", details=duplicate_slugs))
    results.append(_result("CAT-PUBLISH-INTENT", "활성·비활성 등록 의도", "pass",
                           "disabled 항목도 파일 계약을 검사하며, 비활성 항목은 색인 대상에서 제외합니다",
                           evidence={"enabled": enabled, "disabled": disabled, "indexable": indexable}))
    results.append(_result("CAT-RUNTIME", "실행·SSR·배포 검증 경계", "skip",
                           "정적 검사만 수행했습니다. 실제 SSR/검색/sitemap/차단 overlay, 게임 실행·SDK·저장·보안·성능·이미지 전체 디코딩은 별도 검증이 필요합니다"))
    return results
