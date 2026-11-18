# JavaScript와 SQL에서 사용하기

## 1. 오프라인 조회

루트의 `index.html`은 데이터를 내장한다. 압축을 해제한 뒤 더블클릭하면 된다. 별도 파일을 fetch하지 않으므로 `file://`에서도 동작한다. 표시된 출처 링크를 열 때만 인터넷이 필요하다.

## 2. JavaScript에서 JSON 읽기

실제 앱에 통합할 때는 기준 JSON을 읽고, 값과 근거 상태를 함께 판단한다. 아래 예제는 웹 서버를 통해 실행하는 ES module 예제다.

```javascript
import { loadCatalogue, getObservation, requireNumber }
  from './scripts/data_loader.mjs';

const catalogue = await loadCatalogue('./data/cosmoteer_original.json');

const observation = getObservation(catalogue, 'small_reactor_core', 'power_generation_per_s');
console.log(observation.value, observation.unit, observation.status, observation.sources);

// 위키 관측값을 임시 입력으로 쓸 때는 허용 범위를 명시한다.
const cost = requireNumber(catalogue, 'small_reactor_core', 'value_credits', {
  allowedStatuses: ['wiki_snapshot', 'wiki_history_resolved', 'patch_confirmed'],
  unit: 'credits'
});

// 기본 허용 상태는 patch_confirmed뿐이다.
const radiatorHp = requireNumber(catalogue, 'radiator', 'hp', { unit: 'HP' });

// 충전 시간은 자료가 충돌하므로 null이다. 0으로 강제 변환하지 않는다.
const charge = getObservation(catalogue, 'small_reactor_core', 'battery_charge_s');
if (charge.value === null) {
  console.log('이 필드는 원본 데이터 대조가 필요합니다.', charge.sources);
}
```

로컬 웹 서버 예시:

```bash
python3 -m http.server 8080
```

이 명령은 ZIP을 압축 해제한 프로젝트 루트에서 실행한다. Node.js에서는 `fs.readFile`과 `JSON.parse`로 같은 JSON을 읽은 뒤 `validateCatalogue`에 넘길 수 있다. `data_loader.mjs`는 파일을 수정하지 않는다.

## 3. SQLite 조회

데이터베이스는 `records`, `observations`, `sources`, `evidence`, `conflicts`, `metadata` 테이블을 가진다. `observations.value_json`에 JSON 타입을 보존하고, 숫자 필드만 뽑은 `numeric_stats` 뷰를 제공한다.

```sql
-- 원작 정상 모드 부품의 체력. 문헌 상태를 함께 출력한다.
SELECT r.id, r.name_ko, s.value AS hp, s.status
FROM records r
JOIN numeric_stats s ON s.record_id = r.id AND s.field = 'hp'
WHERE r.record_type = 'part'
ORDER BY s.value DESC;

-- 확인이 보류된 모든 필드.
SELECT r.name_ko, o.field, o.unit, o.status
FROM observations o
JOIN records r ON r.id = o.record_id
WHERE o.value_json = 'null'
ORDER BY r.category, r.id, o.field;

-- 특정 수치의 근거 문서.
SELECT e.record_id, e.field, s.title, s.url
FROM evidence e
JOIN sources s ON s.id = e.source_id
WHERE e.record_id = 'radiator' AND e.field = 'hp';
```

`numeric_stats`는 근거 상태를 자동 필터하지 않는다. 확정 패치값만 사용하려면 `status = 'patch_confirmed'` 조건을 추가한다.

## 4. 재생성

```bash
python3 scripts/build_exports.py
python3 scripts/validate_data.py
```

첫 명령은 `authoring/support.json`, `authoring/combat.json`, `authoring/economy.json`, `authoring/starforge.json`을 읽는다. 출력은 결정적으로 생성되며 원본 게임 파일을 다운로드하거나 게임 저장소를 수정하지 않는다. 두 번째 명령은 오류가 있으면 0이 아닌 종료 코드를 반환한다.

`schemas/catalogue.schema.json`은 별도 JSON Schema 도구에서도 검증할 수 있다. 기본 검증 스크립트는 Python 표준 라이브러리만 사용한다.

## 5. STARFORGE 상수 재추출

`scripts/export_starforge.cjs`는 기존 STARFORGE Git 저장소와 지정 커밋을 필요로 한다. 원작 데이터 추출기나 `.rules` 파서는 아니다. 두 위치 인자는 저장소 경로와 출력 JSON 경로다.

```bash
node scripts/export_starforge.cjs /absolute/path/to/starforge /absolute/path/to/starforge_export.json
```

코드 줄 번호는 해당 커밋을 기준으로 한다. 이후 코드를 수정한 파일의 같은 줄 번호와 대조하지 말고, `source_commit`을 함께 확인해야 한다. 원본 파일별 해시와 추출 검증 결과는 `docs/starforge_validation.json`에 있다.
