# PlayForge Asset Store — 오픈 라이선스 4-Tier 정책 및 외부 API 우선 연동 가이드

본 문서는 외부 조사 결과(유니티형 자체 에셋스토어 오픈 에셋 수집·라이선스·운영 가이드)를 PlayForge Asset Store(`store/**`)와 PlayHub 통합 포털(`hub/**`)에 반영한 정책 및 기술 규격입니다.

## 1. 4-Tier 라이선스 적격성 및 호스팅 정책

| 등급 | 코드 (`license_tier`) | 적용 라이선스 | 호스팅 / 연동 방식 | 필수 조치 |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1 (최우선 안전군)** | `tier1_cc0` | `CC0-1.0`, `Unlicense` | 직접 호스팅 + 외부 CDN 우선 링크 | 원출처 이력(`ASSET_METADATA.json`)·`Third-Party Notices.txt`·`No AI` 표기 |
| **Tier 2 (표기 의무군)** | `tier2_attribution` | `MIT`, `Apache-2.0`, `BSD-3-Clause`, `Zlib`, `CC-BY-3.0`, `CC-BY-4.0`, `OGA-BY-3.0` | 무료 배포 + 외부 원출처 우선 링크 | 상품 상세 저작자·출처 URL·원클릭 크레딧 복사 UI + `Third-Party Notices.txt` 동봉 |
| **Tier 2-B (폰트 무료 전용)** | `tier2b_ofl_font` | `OFL-1.1` (SIL Open Font License) | 무료 배포 전용 (단독 유료 판매 금지) | 게임 임베딩 허용, `OFL-1.1` 원문 고지 동봉 (Pretendard, Noto Serif KR) |
| **Tier 4 (직접 호스팅 금지)** | `tier4_external_only` | `Custom-No-Redist` (Sonniss GDC, Cainos, Tiny Swords 최신, Quaternius Custom, Pixabay, 99Sounds, ZapSplat, Mixkit) | **`release_kind = editorial` 외부 링크 전용 (`hosting_policy = external_link_only`)** | 서버 파일 호스팅·설치 버튼 전면 차단, 공식 배포처 아웃바운드 링크로만 안내 |
| **영구 제외** | 차단 | `GPL`, `LGPL`, `MPL`, `CC-BY-SA`, `CC-BY-NC`, `BBC RemArc` | 수집기(`collect-free-assets.mjs`) 자동 거부 | 카피레프트 전염 및 비영리(NC) 충돌 원천 차단 |

## 2. 외부 공식 API 우선 활용 현황 (`11,830`개 통합 카탈로그)

- **Game-Icons.net 공식 GitHub API (`CC-BY-3.0`, Tier 2)**: `4,239`종 벡터 SVG 게임 아이콘 (GitHub Raw SVG 썸네일 및 직접 다운로드 링크 + 원저작자별 자동 크레딧 문구)
- **ambientCG 공식 v2 API (`CC0-1.0`, Tier 1)**: `2,939`종 심리스 PBR 머티리얼·데칼·HDRI·3D 모델·터레인 (`ambientcg.com/get?file=...` 공식 CDN ZIP 외부 링크 + `Powered by ambientCG` 표기)
- **Poly Haven 공식 API (`CC0-1.0`, Tier 1)**: `2,391`종 3D PBR 모델·8K PBR 텍스처·16K HDRI (`Powered by Poly Haven` 표기)
- **Godot 공식 Asset Library API (`MIT`/`CC0`/`Apache-2.0`/`BSD-3-Clause`/`Unlicense`)**: `2,192`종 Godot 4.3+ 애드온·도구·셰이더·UI·오디오 (GPL/CC-BY-SA 등 119종 자동 차단)
- **조사 기반 검증 외부 팩 큐레이션 (`52`종) + 로컬 검증 CC0 GLB (`5`종) + Tier 4 외부 리소스 디렉토리 (`8`종) + 핵심 샘플 (`4`종)**:
  - KayKit 공식 GitHub CC0 ZIP, Kenney OpenGameArt CC0 ZIP(3D·2D·UI·VFX·Audio) 및 Godot Starter Kits, Pixel Frog(CC0 3종), 0x72, ansimuz, pixel-boy, Crusenho(`CC-BY-4.0`), Pretendard & Noto Serif KR(`OFL-1.1`), Tallbeard 200+ BGM, Incompetech(`CC-BY-4.0`), Freesound, Musopen, The Base Mesh, Smithsonian 3D CC0, 100 Avatars, Godot Shaders CC0, jsfxr

## 3. 패키징 · AI 투명성 · 크레딧 표준
- **패키지 내부 `Third-Party Notices.txt` 자동 생성** (`store/server/package-builder.mjs`):
  ```text
  Asset uses [에셋명] by [원작자명] under [라이센스명 및 버전] ([원본 URL]); see Third-Party Notices.txt file in package for details. (AI Disclosure: No generative AI used)
  ```
- **AI 투명성 메타데이터 (`ai_disclosure`)**: Steam/Fab/Unity 2026 기준에 맞춰 `No generative AI used` 배지 및 `No AI` 필터를 제공합니다.
- **원클릭 크레딧 복사 UI**: 상세 페이지에서 `CREDITS.md`용 표준 저작자 표기 문구를 1클릭으로 복사할 수 있습니다.
- **Forge 전용 플랫폼 경계**: Web · Windows · Linux · macOS만 지원하며 AOS/iOS 네이티브는 미지원 정책을 유지합니다.
