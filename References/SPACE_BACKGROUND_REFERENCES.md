# Space Background, Starfield, and Milky Way References

## 결론

현재 `Captain Salvage`의 Godot 2D 구조에는 **외부 텍스처 없이 고정 시드 별·낮은 알파 은하수 띠를 `CanvasItem._draw()`로 그리는 방식**이 기본이다. CC0 타일·성운은 라이선스가 기록된 비교 레퍼런스로 보관하며 런타임에는 포함하지 않는다. 대형 실사 은하수 이미지는 전투 중에는 대비를 낮추기 어렵고, 크레딧·라이선스 검증 부담이 커서 메뉴나 정지 화면의 시각 참고로만 분류한다.

## 수집된 구현 가능 텍스처

다음 파일은 로컬 `assets/cc0`에 수집했으며, 각 OpenGameArt 원본 페이지가 CC0으로 표기한다. CC0 판정은 열람일 기준이며, 배포 전에 원문 라이선스를 다시 확인한다.

### 타일형 별밭

- 파일: `assets/cc0/bg_1_1_cc0.png`
- 출처: Sauer2, [Starfield background](https://opengameart.org/content/starfield-background)
- 라이선스: CC0
- 크기: 800×600, 15,133 bytes
- 용도: 반복 가능한 먼 별 레이어의 비교 레퍼런스. 현재 런타임은 이 파일을 로드하지 않는다.
- SHA-256: `00EBBC6B4924B9B9323AFDD7CD584ADD7A7B6908A63DD2A9C1E74C674475D649`

### 정사각형 성운·별 배경 5종

- 출처: Soluna Software, [Space backgrounds with stars and nubular](https://opengameart.org/content/space-backgrounds-with-stars-and-nubular)
- 라이선스: CC0
- 원본 설명: 각 1600×1600의 별·성운 배경. 타일 여부는 보장하지 않으므로 반복 배경이 아니라 구역별 단일 장면·느린 드리프트에 쓴다.

- `assets/cc0/space001_cc0.png` — 1600×1600, 1,553,897 bytes, `E72A98275D1F3831264AD164514AE1C502445A627B529BB53BF18BEC68773386`
- `assets/cc0/space002_cc0.png` — 1600×1600, 1,096,871 bytes, `79F413398A5BD068CF15B3E5A7553C4AC01F6937CBCFE96996C4EB1206D93A54`
- `assets/cc0/space003_cc0.png` — 1600×1600, 1,314,691 bytes, `1F0DBACDB9D265C621E94E2C1248D1D01D1013AB6757524DE77F37E973EF3A2E`
- `assets/cc0/space004_cc0.png` — 1600×1600, 1,924,582 bytes, `3E4A3F1CDA52A1E46DC3A3ECFEA5D709BB5CCCA342DF07C6D362698DED1DFF1B`
- `assets/cc0/space005_cc0.png` — 1600×1600, 2,121,242 bytes, `A5638B3658F79C4805E8153D34DBE32CA86922B0D74AA445ED495F534AC6361A`

### 추가 다운로드 후보 — 아직 로컬 미수집

- [Seamless Space Backgrounds](https://opengameart.org/content/seamless-space-backgrounds) — CC0, 32개 PNG(별밭 및 청록·보라·녹색 성운), 512×512 또는 1024×1024 ZIP. 타일 경계가 필요한 경우 위의 5종보다 적합하다.
- [Space Backgrounds 9](https://opengameart.org/content/space-backgrounds-9) — CC0, 타일형 별밭을 포함한다. 대용량 파일이므로 아트 방향을 확정한 뒤 선별 수집한다.

## 은하수·성운 시각 참고 — 로컬 미수집

- [Hubble Milky Way central bulge](https://science.nasa.gov/image-detail/hubble-milkywaycore-stsci-01evt1277v29q7xrwrxpc7t65v/) — 밀집된 색별 분포, 적갈색 먼지와 낮은 채도의 어두운 영역을 참고한다. 페이지 표기 크레딧은 NASA, ESA, Tom M. Brown이다. 복수 권리자 표기 때문에 프로젝트 에셋으로 포함하지 않았다.
- [Hubble Skymap](https://science.nasa.gov/image-detail/hubble-skymap-2/) — 화면을 가로지르는 얇은 은하수 밴드의 구도를 참고한다. 배경 이미지 크레딧이 ESA/Gaia/DPAC이고 CC BY-SA 3.0 IGO로 표기되어 있으므로, 라이선스 의무를 별도 검토하기 전까지는 구현 에셋으로 사용하지 않는다.

## 오픈소스 생성기 조사

### 1. Eluvade Cosmos — 구현 후보 A

- 저장소: [Eluvade/cosmos](https://github.com/Eluvade/cosmos)
- 라이선스: MIT
- 기능: 결정론적 seed 기반의 별·은하·성운·행성 렌더링. 성운은 Canvas 2D로 한 번 렌더할 수 있고, 나머지는 WebGL을 사용한다.
- 적합성: 정적 성운을 미리 굽거나 메뉴 배경을 만들 때 좋다. 현재 프로젝트는 GDScript 2D를 쓰므로, 실시간 전장 렌더러로 즉시 도입하지 않고 별도 설치·번들 크기·WebGL 폴백 테스트를 승인한 뒤 채택한다.

### 2. Procedural Stars Three.js — 기법 참고 B

- 저장소: [CK42BB/procedural-stars-threejs](https://github.com/CK42BB/procedural-stars-threejs)
- 라이선스: MIT
- 기능: 별의 분광색, 은하수 FBM 밴드, 성운, 천체를 레이어로 분리하고 WebGPU 및 WebGL2 폴백을 제공한다.
- 적합성: “별밭 → 은하수 밴드 → 성운 → 천체”의 레이어 설계와 색 분포의 참고로 유용하다. Three.js r170+와 WebGPU 기능을 전제로 하므로 현재 단일 Canvas 파일에 직접 이식하지 않는다.

### 3. Anthony Ellis Procedural Galaxy Generator — 구조 참고 C

- 데모 및 소스: [설계 노트](https://anthonyellis.dev/projects/galaxy/), [소스 파일](https://github.com/AnthonyEllisDev/portfolio/blob/main/demos/galaxy.html)
- 관찰: Vanilla JS·three.js r149·GLSL로 만든 25개 모듈의 단일 HTML 생성기다. 48비트 시드에서 결과를 재생성하고, 생성 계층을 DOM·렌더러와 분리하며, 별 점군을 Worker와 typed array 성능 경로로 취급한다. 설계 노트는 22만 별 생성 약 120ms, 별당 14 bytes, 전체 은하의 단일 draw call을 보고한다.
- 구현 비용 추정: 현재 전투 배경만 독자 구현하면 2D 셀-해시 별·성운 레이어로 1–3일 및 추가 약 5–20KiB gzip이면 충분하다. 원본 수준의 3D 은하·LOD·항성계·행성·지형까지 맞추면 WebGL/Worker/검증 체계가 필요해 숙련 개발자 기준 약 4–8주, three.js를 포함한 추가 전송량 약 200–400KiB gzip이 후보다. 이 수치는 프로젝트의 공식 측정이 아니라 통합 범위로부터의 추정이다.
- 적합성: 향후 구역별 배경을 재현 가능하게 만들 때의 아키텍처 참고다. 공개 저장소의 GitHub 메타데이터는 라이선스를 `none`으로 보고하므로, 코드·에셋을 복사하는 구현 후보가 아니다. 라이선스 허가를 별도로 받기 전에는 알고리즘 원칙만 독자 구현한다.

## 현재 프로젝트에 대한 구현 지침

1. `Godot/scripts/background.gd`에서 텍스처 없이 고정 시드 별과 저알파 은하수 띠를 그리고, 후속 단계에서 72px 월드 격자 해시와 성운 캐시를 추가한다.
2. 성운 이미지에는 낮은 불투명도와 큰 어두운 바탕을 적용해 레이저·적 코어·회수 잔해의 대비를 보호한다.
3. 해상도별로 새 이미지를 중복 로드하지 않는다. 1280×720에서 타일형 별밭은 여러 번 그려질 수 있으므로, 프로파일링 전에는 `drawImage` 수를 임의로 2개 이하라고 제한하지 않는다.
4. 절차 별은 전역 배열을 만들지 않고 화면 인접 셀만 계산한다. 월드 크기 확장에 따라 메모리나 프레임 순회량이 커지지 않는다.
5. 실시간 WebGL 성운·은하 생성은 이 프로토타입의 성능 목표를 측정한 뒤에만 도입한다. 먼저 고정 시드·사전 렌더 또는 CC0 텍스처 조합을 비교한다.

## 검증 필요

수집 파일의 무결성은 SHA-256으로 기록했다. 실제 게임 화면에서의 가독성, 메모리 사용량, 저사양 프레임 시간은 아직 측정하지 않았다. 배경 구현을 시작할 때는 전투 HUD 대비와 1280×720 프레임 시간을 함께 측정한다.
