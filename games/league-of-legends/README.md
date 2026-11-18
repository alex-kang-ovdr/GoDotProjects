# League of Legends

- [게임 시작](Web/index.html)
- [플랫폼 등록 정보](game.manifest.json)
- [개발 소스](Source/Project/)
- [이전 산출물](Archive/)

공통 실행 경로는 Web/index.html입니다. 플랫폼 노출 상태는 포함이며 전체 목록은 상위 catalog.json에서 관리합니다.

## PlayHub 통합판 6.1.0

- [통합 실행판 보관본](Archive/Releases/league-of-legends-v6.1.0.zip)
- 반영일 2026-11-17. 기존 통합판 6.0.0에 수집본 7.0.0의 실행 변경을 반영했습니다.
- 수집 자료 `WebProjects/League of Legends/Archive/Web/LeagueOfLegends_Sites_Source.zip`, SHA-256 `65493793446e97338986cb525b1cce7d4633b466134aa8a214e7390005a2b0c5`.
- PlayHub 언어 어댑터, 게임 ID, 저장 연동과 표지를 유지했습니다.

## PlayHub integration 6.2.0 (2026-11-18)

- Upstream Nexus Front 9.0.0, full source and planning/reconstruction data imported.
- Original package: [League_of_Legends_Nexus_Front_v9_20261118.zip](Archive/Incoming/League_of_Legends_Nexus_Front_v9_20261118.zip), SHA-256 `7b1431ce1ace52ace36dfb385a62333fea15549892a78b63c2f3ae48f2304936`.
- [Integrated release](Archive/Releases/league-of-legends-v6.2.0.zip), SHA-256 `a550044638927bdc2b74c55cb3b2a662aceaab5683146aa510ea9f85287d482e`.
- Prior source preserved in `Archive/Source/v6.1.0/`; previous runtime remains in the 6.1.0 release archive.
- Current game source/tests/docs: `Source/Project/`. Full analysis, original data and repackage documentation: `Source/ReferencePackage-v9/`.
- Source inventory and hashes: `Source/import-v9-manifest.json`.
- `Web/index.html` uses upstream offline embedded v9 runtime with the existing PlayHub locale adapter. Vendor scripts, cover, game ID, save schema and existing save keys are preserved. Catalog visibility was not changed.
- All 352 upstream Node tests passed (82.8 s); [test log](Source/v9-integration-tests.tap). Static runtime-version, locale loader, cover/vendor hashes, save-key and ZIP CRC checks passed. This does not certify real-browser input/rendering or authenticated Hub cloud-save roundtrips; Hub sync and browser QA remain separate.
