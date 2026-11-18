# 실행 구조와 재빌드

## 구조

```
index.html                    오프라인 단일 v14 실행 파일
custom/index.html             수정하지 않은 v13 실행 파일
custom/src/                   보존한 v13 소스
src/data.js                   기반 구조·새 저장 키
src/gameplay.js               기본 전투·공간 그리드·피해·일반 AI
src/reference.js              R3 매핑·참조 규칙·새 공격·UI·검증
src/reference.css             참조 모드 전용 UI
src/persistence.js            v14 체크포인트 검증/복원
src/render3d.js                인스턴싱·블록 모델·새 공격 연출
src/legacy2d.js                2D 대체 렌더러
src/enhancements.js            설정·통계·사운드·고정 스텝 루프
src/input.js                   키보드·터치·포커스
src/tactics.js, doctrine.js    기반 호환 구조 (참조 모드의 자체 기능은 비활성)
data/reference_subset.json    선택된 R3 원문 레코드와 ID 매핑
data/runtime_balance.json     DESIGN 수치. 변경 후 재빌드해야 반영
build.py                      JSON과 JS/CSS를 단일 HTML로 결합
tests/                        기능 검사·자동 플레이·출처 보존·검사 결과
previews/                     실제 Chromium 캡처
```

`reference.js`는 기반 함수의 규칙을 명시적으로 교체하는 어댑터입니다. 원본 v13을 같은 파일에 조건문으로 섞지 않고 별도 실행본으로 보존합니다. 삭제되지 않은 기반 함수가 곧 참조 모드에서 실행된다는 뜻은 아닙니다. 공개 개발 연결 객체도 교체된 함수로 다시 바인딩됩니다.

## 재빌드

```
python build.py
```

Python은 소스 재빌드에만 필요합니다. 실행은 `index.html` 하나로 됩니다. `data/*.json`만 수정해도 기존 HTML이 즉시 바뀌지는 않습니다. JS 모듈 import, fetch, CDN, 폰트 다운로드를 사용하지 않습니다.

## 검사

```
pip install playwright
# 시스템 Chromium과 그래픽 환경 필요. 테스트 스크립트의 실행 경로 확인.
DISPLAY=:99 python tests/test_v14.py
DISPLAY=:99 python tests/balance_probe.py
DISPLAY=:99 python tests/file_origin_probe.py
python tests/validate_package.py
```

기능 검사는 Python과 Playwright가 필요합니다. 검사에만 URL `#test`에서 `window.__test`가 열립니다. 일반 플레이에는 무적·무료 강화·강제 레벨이 적용되지 않습니다. 테스트 소스의 부여 함수는 일부 기능 검사의 사전 조건을 만드는 용도이고 자연 진행 봇은 실제 카드만 선택합니다.

## 성능 경계

고정 1/60초 시뮬레이션, 누적 지연 최대 6스텝, 공간 그리드 검색, 투사체 경로 충돌, 인스턴싱과 화질 설정을 사용합니다. 원작과 같은 내부 구현이라는 의미가 아닙니다. 물리 모바일 GPU 프레임률·발열·전력 소모를 측정하지 않았습니다.
