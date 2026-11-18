"""Bounded, non-extracting ZIP checks for the proposed static-game profile.

This is a preflight validator, not a malware scanner or a browser sandbox.  The
profile deliberately accepts ordinary single-volume ZIP_STORED/ZIP_DEFLATED
archives only; ZIP64, encrypted archives and self-extracting prefixes are refused.
Payload CRC inspection is capped at 32 MiB and five seconds.  A warning explicitly
reports incomplete inspection; callers must not treat that warning as full CRC
verification.  No archive member is written or executed and no URL is fetched.
"""

from __future__ import annotations

import os
from pathlib import Path
import re
import stat
import struct
import time
import unicodedata
import zipfile
import zlib

MIB = 1024 * 1024
MAX_ARCHIVE_BYTES = 100 * MIB
MAX_EXPANDED_BYTES = 300 * MIB
MAX_MEMBER_BYTES = 100 * MIB
MAX_ENTRIES = 2000
MAX_PATH_BYTES = 240
MAX_COMPRESSION_RATIO = 100
MAX_CENTRAL_DIRECTORY_BYTES = 8 * MIB
MAX_INSPECTION_BYTES = 32 * MIB
MAX_INSPECTION_SECONDS = 5.0
CHUNK_BYTES = 64 * 1024
MAX_EVIDENCE = 20


def _check(identifier: str, title: str, status: str, message: str, **extra) -> dict:
    return {"id": identifier, "title": title, "status": status,
            "message": message, **extra}


def _issues(identifier: str, title: str, issues: list[str], success: str) -> dict:
    return _check(identifier, title, "fail" if issues else "pass",
                  f"{len(issues)}개 문제가 발견되었습니다." if issues else success,
                  evidence=issues[:MAX_EVIDENCE],
                  details={"issue_count": len(issues), "evidence_limit": MAX_EVIDENCE})


class _Rejected(ValueError):
    pass


def _reject_zip64_extra(extra: bytes) -> None:
    position = 0
    while position < len(extra):
        if position + 4 > len(extra):
            raise _Rejected("ZIP extra field 헤더가 잘렸습니다.")
        identifier, length = struct.unpack_from("<HH", extra, position)
        position += 4
        if position + length > len(extra):
            raise _Rejected("ZIP extra field 범위가 잘못됐습니다.")
        if identifier == 0x0001:
            raise _Rejected("초기 프로필은 작은 파일의 ZIP64 extra field도 지원하지 않습니다.")
        position += length


def _guard_directory(handle, size: int) -> int:
    """Count bounded central-directory records before ZipFile allocates them."""
    handle.seek(max(0, size - (65535 + 22)))
    tail = handle.read(65535 + 22)
    position = tail.rfind(b"PK\x05\x06")
    if position < 0 or len(tail) - position < 22:
        raise _Rejected("정상 ZIP 종료 레코드(EOCD)가 없습니다.")
    values = struct.unpack_from("<4s4H2LH", tail, position)
    _, disk, cd_disk, disk_count, count, cd_size, cd_offset, comment_len = values
    if position + 22 + comment_len != len(tail):
        raise _Rejected("EOCD 길이가 맞지 않거나 ZIP 뒤에 추가 데이터가 있습니다.")
    if disk or cd_disk or disk_count != count:
        raise _Rejected("분할 ZIP은 지원하지 않습니다.")
    if count == 65535 or cd_size == 0xFFFFFFFF or cd_offset == 0xFFFFFFFF:
        raise _Rejected("이 초기 프로필은 ZIP64를 지원하지 않습니다.")
    if count > MAX_ENTRIES:
        raise _Rejected(f"ZIP 항목 수가 {MAX_ENTRIES}개를 초과합니다.")
    if cd_size > MAX_CENTRAL_DIRECTORY_BYTES:
        raise _Rejected("중앙 디렉터리가 8 MiB 검사 한도를 초과합니다.")
    eocd_offset = size - len(tail) + position
    if cd_offset + cd_size != eocd_offset:
        raise _Rejected("중앙 디렉터리 범위가 EOCD와 일치하지 않습니다.")
    if count:
        handle.seek(0)
        if handle.read(4) != b"PK\x03\x04":
            raise _Rejected("실행 파일 접두부 등 일반 ZIP 이외의 형식은 지원하지 않습니다.")
    cursor, seen = cd_offset, 0
    while cursor < eocd_offset:
        if seen >= MAX_ENTRIES or cursor + 46 > eocd_offset:
            raise _Rejected("중앙 디렉터리 항목 수 또는 레코드 길이가 잘못됐습니다.")
        handle.seek(cursor)
        header = handle.read(46)
        if len(header) != 46 or header[:4] != b"PK\x01\x02":
            raise _Rejected("중앙 디렉터리 레코드가 손상됐습니다.")
        name_len, extra_len, entry_comment_len = struct.unpack_from("<HHH", header, 28)
        next_cursor = cursor + 46 + name_len + extra_len + entry_comment_len
        local_offset = struct.unpack_from("<L", header, 42)[0]
        member_disk = struct.unpack_from("<H", header, 34)[0]
        compressed, expanded = struct.unpack_from("<LL", header, 20)
        if next_cursor > eocd_offset or local_offset >= cd_offset or member_disk:
            raise _Rejected("ZIP 항목의 파일 위치 또는 디스크 정보가 잘못됐습니다.")
        if compressed == 0xFFFFFFFF or expanded == 0xFFFFFFFF:
            raise _Rejected("ZIP64 항목은 지원하지 않습니다.")
        extract_version = struct.unpack_from("<H", header, 6)[0]
        if extract_version > 20:
            raise _Rejected("ZIP 버전 2.0을 넘는 확장 형식은 지원하지 않습니다.")
        handle.seek(cursor + 46 + name_len)
        _reject_zip64_extra(handle.read(extra_len))
        handle.seek(local_offset)
        local = handle.read(30)
        if len(local) != 30 or local[:4] != b"PK\x03\x04":
            raise _Rejected("ZIP 로컬 파일 헤더가 손상됐습니다.")
        local_version = struct.unpack_from("<H", local, 4)[0]
        local_name_len, local_extra_len = struct.unpack_from("<HH", local, 26)
        if local_version > 20 or local_offset + 30 + local_name_len + local_extra_len > cd_offset:
            raise _Rejected("ZIP64 또는 잘못된 로컬 파일 헤더 범위입니다.")
        handle.seek(local_offset + 30 + local_name_len)
        _reject_zip64_extra(handle.read(local_extra_len))
        cursor, seen = next_cursor, seen + 1
    if cursor != eocd_offset or seen != count:
        raise _Rejected("EOCD에 선언된 항목 수와 실제 중앙 디렉터리가 다릅니다.")
    return seen


def _path_problem(name: str) -> str | None:
    if not name or "\x00" in name:
        return "빈 경로 또는 NUL 문자가 있습니다"
    if "\\" in name or name.startswith("/") or re.match(r"^[A-Za-z]:", name):
        return "절대 경로·드라이브·역슬래시가 있습니다"
    if len(name.encode("utf-8")) > MAX_PATH_BYTES:
        return f"UTF-8 경로가 {MAX_PATH_BYTES}바이트를 초과합니다"
    parts = name.rstrip("/").split("/")
    if any(part in ("", ".", "..") for part in parts):
        return "빈 경로 요소 또는 . / .. 요소가 있습니다"
    if any(ord(char) < 32 or ord(char) == 127 for char in name):
        return "제어 문자가 있습니다"
    for part in parts:
        if ":" in part or part.endswith((".", " ")):
            return "이식 가능한 파일 경로가 아닙니다(콜론·끝 공백·끝 점)"
        stem = part.split(".", 1)[0].casefold()
        if stem in {"con", "prn", "aux", "nul"} or re.fullmatch(r"(?:com|lpt)[1-9]", stem):
            return "예약된 장치 이름이 있습니다"
    return None


def _inspect_payloads(archive: zipfile.ZipFile, members: list[zipfile.ZipInfo]) -> dict:
    start, inspected, completed = time.monotonic(), 0, 0
    files = [member for member in members if not member.is_dir()]
    files.sort(key=lambda member: member.filename != "index.html")
    for member in files:
        if time.monotonic() - start >= MAX_INSPECTION_SECONDS:
            break
        with archive.open(member, "r") as source:
            member_read = 0
            while member_read < member.file_size:
                if (inspected >= MAX_INSPECTION_BYTES or
                        time.monotonic() - start >= MAX_INSPECTION_SECONDS):
                    return _check("ZIP-008", "제한된 payload·CRC 검사", "warning",
                                  "검사 예산에 도달해 일부 payload·CRC를 확인하지 못했습니다.",
                                  details={"inspected_bytes": inspected, "completed_files": completed,
                                           "total_files": len(files), "full_crc_verified": False})
                data = source.read(min(CHUNK_BYTES, member.file_size - member_read,
                                       MAX_INSPECTION_BYTES - inspected))
                if not data:
                    raise _Rejected(f"선언 크기보다 짧은 payload: {member.filename}")
                member_read += len(data)
                inspected += len(data)
            # Empty entries also need a read to trigger their local-header/CRC path.
            if source.read(1):
                raise _Rejected(f"선언 크기를 초과한 payload: {member.filename}")
        completed += 1
    full = completed == len(files)
    return _check("ZIP-008", "제한된 payload·CRC 검사", "pass" if full else "warning",
                  "모든 일반 파일의 payload를 읽고 CRC를 확인했습니다." if full else
                  "시간 한도에 도달해 모든 payload·CRC를 확인하지 못했습니다.",
                  details={"inspected_bytes": inspected, "completed_files": completed,
                           "total_files": len(files), "full_crc_verified": full})


def validate_archive(archive_path: Path) -> list[dict]:
    """Return report checks for a ZIP without extracting or executing its files."""
    checks: list[dict] = []
    try:
        path = Path(archive_path)
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode):
            raise _Rejected("검사 입력은 심볼릭 링크가 아닌 일반 ZIP 파일이어야 합니다.")
        if metadata.st_size > MAX_ARCHIVE_BYTES:
            raise _Rejected("압축 파일이 100 MiB 한도를 초과합니다.")
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as handle:
            current = os.fstat(handle.fileno())
            if not stat.S_ISREG(current.st_mode) or current.st_size > MAX_ARCHIVE_BYTES:
                raise _Rejected("열린 파일의 종류 또는 크기가 입력 정책에 맞지 않습니다.")
            checks.append(_check("ZIP-001", "입력 파일", "pass", "일반 파일·100 MiB 한도를 확인했습니다.",
                                 details={"archive_bytes": current.st_size}))
            count = _guard_directory(handle, current.st_size)
            checks.append(_check("ZIP-002", "중앙 디렉터리 사전 검사", "pass",
                                 "ZIP 구조와 메타데이터 읽기 한도를 확인했습니다.",
                                 details={"entries": count}))
            handle.seek(0)
            with zipfile.ZipFile(handle) as archive:
                members = archive.infolist()
                if len(members) != count:
                    raise _Rejected("ZIP 해석기의 항목 수가 사전 검사 결과와 다릅니다.")
                path_errors, type_errors, size_errors = [], [], []
                seen, folded, file_names = {}, {}, set()
                expanded_total = 0
                for member in members:
                    original = member.orig_filename
                    name = unicodedata.normalize("NFC", original)
                    problem = _path_problem(name)
                    if problem:
                        path_errors.append(f"{original!r}: {problem}")
                    key = name.rstrip("/")
                    if key in seen:
                        path_errors.append(f"정규화된 경로 중복: {original!r}")
                    seen[key] = original
                    # Include implicit directories, so A/x and a/y also collide.
                    parts = key.split("/")
                    for length in range(1, len(parts) + 1):
                        prefix = "/".join(parts[:length])
                        prior = folded.get(prefix.casefold())
                        if prior is not None and prior != prefix:
                            path_errors.append(f"대소문자 경로 충돌: {prior!r} / {prefix!r}")
                        folded[prefix.casefold()] = prefix
                    mode = (member.external_attr >> 16) & 0xFFFF
                    kind = stat.S_IFMT(mode)
                    if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                        type_errors.append(f"심볼릭 링크 또는 특수 파일: {original!r}")
                    if ((kind == stat.S_IFDIR and not member.is_dir()) or
                            (kind == stat.S_IFREG and member.is_dir()) or
                            (member.is_dir() and member.file_size != 0)):
                        type_errors.append(f"디렉터리 표시와 파일 유형/크기가 다름: {original!r}")
                    if not member.is_dir():
                        file_names.add(key.casefold())
                    if member.flag_bits & (1 | 0x20 | 0x40):
                        type_errors.append(f"암호화 또는 패치 ZIP 항목: {original!r}")
                    if member.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                        type_errors.append(f"지원하지 않는 압축 방식: {original!r}")
                    expanded_total += member.file_size
                    if member.file_size > MAX_MEMBER_BYTES:
                        size_errors.append(f"개별 파일 100 MiB 초과: {original!r}")
                    if member.file_size and (member.compress_size == 0 or
                            member.file_size > member.compress_size * MAX_COMPRESSION_RATIO):
                        size_errors.append(f"압축률 100배 초과 또는 잘못된 압축 크기: {original!r}")
                for name in seen:
                    parts = name.split("/")
                    if any("/".join(parts[:i]).casefold() in file_names for i in range(1, len(parts))):
                        path_errors.append(f"일반 파일을 상위 디렉터리로 사용: {name!r}")
                if expanded_total > MAX_EXPANDED_BYTES:
                    size_errors.append("전체 추출 크기가 300 MiB를 초과합니다.")
                checks.append(_issues("ZIP-003", "경로·중복·대소문자", path_errors, "안전한 상대 경로와 고유성을 확인했습니다."))
                checks.append(_issues("ZIP-004", "파일 유형·암호화·압축 방식", type_errors, "일반 파일·디렉터리와 지원 압축 방식입니다."))
                checks.append(_issues("ZIP-005", "추출 크기·압축률", size_errors, "300/100 MiB 및 압축률 100배 한도 이내입니다."))
                entries = [m for m in members if m.orig_filename == "index.html" and not m.is_dir()]
                entry_ok = len(entries) == 1 and entries[0].file_size > 0
                checks.append(_check("ZIP-006", "루트 진입 파일", "pass" if entry_ok else "fail",
                                     "비어 있지 않은 루트 index.html이 있습니다." if entry_ok else
                                     "비어 있지 않은 일반 파일 index.html이 ZIP 루트에 하나 있어야 합니다."))
                checks.append(_check("ZIP-007", "검사 정책", "pass", "압축 해제·파일 실행·네트워크 요청 없이 검사합니다.",
                                     details={"declared_expanded_bytes": expanded_total,
                                              "payload_budget_bytes": MAX_INSPECTION_BYTES,
                                              "payload_budget_seconds": MAX_INSPECTION_SECONDS}))
                if any(check["status"] == "fail" for check in checks):
                    checks.append(_check("ZIP-008", "제한된 payload·CRC 검사", "skip",
                                         "정적 정책 위반으로 payload 읽기를 생략했습니다."))
                else:
                    try:
                        checks.append(_inspect_payloads(archive, members))
                    except (OSError, ValueError, RuntimeError, NotImplementedError, zipfile.BadZipFile, EOFError, zlib.error) as exc:
                        checks.append(_check("ZIP-008", "제한된 payload·CRC 검사", "fail", f"payload 검사 실패: {exc}"))
    except (OSError, TypeError, ValueError, RuntimeError, NotImplementedError, zipfile.BadZipFile, EOFError, struct.error, zlib.error) as exc:
        identifier = "ZIP-001" if not checks else "ZIP-002"
        failure = _check(identifier, "ZIP 입력·구조 검사", "fail", str(exc))
        previous = next((i for i, check in enumerate(checks) if check["id"] == identifier), None)
        if previous is None:
            checks.append(failure)
        else:
            checks[previous] = failure
    checks.append(_check("ZIP-009", "검증 범위", "skip",
                         "브라우저 실행·동적 자산·악성 코드 부재·CSP·서버 권한은 이 정적 검사로 검증하지 않습니다."))
    return checks
