# PlayHub Desktop 계약 (SSOT)

`contracts/desktop/`는 PlayHub 웹, PlayHub API, Rust Bootstrapper(`native/`), Godot Player(`native/runtime-bootstrap/`), TypeScript 도구(`tools/desktop/`) 사이의 단일 기준 계약(JSON Schema Draft 2020-12)을 정의한다.

## 계약 목록

| 파일 | 버전 | 용도 |
|---|---|---|
| `launch-ticket.v1.schema.json` | v1 | 웹 → API 발급, Native Player(Rust 호스트) 검증·교환 (1회용, TTL ≤ 60s, OS/arch 바인딩) |
| `bridge.v1.schema.json` | v1 | Player ↔ Bootstrapper loopback WebSocket IPC (`auth`, `request`, `response`, `event`) |
| `deeplink.v1.schema.json` | v1 | `playhub://` 및 빌드 구성별 프로토콜 URI (`launch`, `join`, `install`, `avatar-studio`) |
| `content-manifest.v1.schema.json` | v1 | FastCDC CAS 청크·필수/선택 패키지·플랫폼 호환·Ed25519 서명 |
| `release-manifest.v1.schema.json` | v1 | 채널(`dev`/`qa`/`rc`/`live`), 롤아웃 %, `COMPAT_*` 강업/선업, 롤백, TUF 메타데이터 |
| `avatar-render-profile.v1.schema.json` | v1 | 아바타 상점 V0/V1/V2 및 인게임 공통 조명·톤매핑·카메라 프리셋 |

## 규칙

1. 계약 변경은 하위 호환을 유지하거나 새 메이저 파일(`*.v2.schema.json`)을 추가한다.
2. 보안 핵심 로직(청크 분할·해시·서명 검증)은 Rust(`native/core`, `native/pack`)에만 구현하고, TypeScript 도구는 `playhub-pack` CLI를 호출한다.
3. 계약 검증 테스트: `node --test hub/tests/desktop-contracts.test.mjs`
