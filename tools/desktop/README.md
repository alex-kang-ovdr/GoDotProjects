# PlayHub Desktop M0 도구 및 생명주기 테스트 하네스

## 필수 도구
- **Rust**: `native/rust-toolchain.toml` 고정 버전 (`1.100.0`)
- **Node.js**: 24 이상 (`.nvmrc`, 로컬 미설치 시 `PlayHub-Platform/artifacts/local-runtime/node24/node.exe` 사용) — TypeScript는 type stripping으로 빌드 없이 실행
- **Godot 4.7.2**: 로컬 바이너리 및 `4.7.2.stable` Export Templates

## 실행 순서 (Windows)

```powershell
# 1. Rust 단위 테스트 · clippy · release 빌드
cd native
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo build --release --workspace
cd ..

# 2. 계약 스키마 테스트 (Node 24)
node --test hub/tests/desktop-contracts.test.mjs

# 3. Godot 4.7.2 PlayHubPlayer.exe 준비 및 bootstrap.pck 익스포트
powershell -NoProfile -ExecutionPolicy Bypass -File tools/desktop/prepare-player.ps1

# 4. 생명주기 테스트 하네스 (L2 · L2-hitch · L4-crash · L4-hang · L5) + 용량·지연·셰이더 히치 실측
node tools/desktop/lifecycle-harness.ts --headless
# 창 모드 실측 (로컬 GPU 환경: GPU/드라이버·파이프라인 컴파일·프레임 p50/p95/p99 포함)
node tools/desktop/lifecycle-harness.ts
```

## 산출물
- `artifacts/desktop-m0/player-meta.json`: Player EXE·`bootstrap.pck` 크기 및 SHA-256
- `artifacts/desktop-m0/m0-report.json`: L2/L4/L5 시나리오 결과, 기동·첫 프레임 지연, 바이너리·압축 용량 실측
