# 복원 데이터와 게임 실행 계약 — v9

실행 계약 갱신일은 **2026-11-18 KST**, Data Dragon 빌드는 **16.22.1**, 공개 패치 표기는 **26.22**다. 정적 입력과 데이터 모듈 스키마는 v8에서 고정한 것을 유지하고, v9는 전투 검산·표식·관측·저장 계약을 보강한다. 공개된 정적 수치를 별도로 구현한 대표 스킬 동작과 결합하며, 원작 서버·내부 스킬 코드를 복원한 것으로 설명하지 않는다.

## 1. 데이터와 실행 콘텐츠

| 구분 | 도감 | 실행 콘텐츠 |
|---|---:|---:|
| 챔피언 | 173명 | 아리·애쉬·가렌·럭스·리 신·진 6명 |
| 최상위 QWER | 692개 | 위 6명의 24개 |
| 아이템 | 전체 모드 863개 | 협곡 후보 중 지원 효과를 구현한 25개 |

도감의 존재는 선택·구매 가능을 의미하지 않는다. 챔피언 `playableId`가 null이면 도감에만 존재하며, 아이템 `playable=false` 역시 구매 목록에서 제외한다. 챔피언 카탈로그의 네 개 스킬은 변신·재시전·숨겨진 파생 스킬을 모두 포함하지 않는다.

## 2. 파일과 재생성

| 파일 | 책임 |
|---|---|
| `data/restored-input.json` | 공식 데이터에서 필요한 사실·수치·식별자·출처를 선별한 오프라인 입력 |
| `data/restored-assets.json` | 공식 CDN에서 받은 챔피언 6개·아이템 25개 PNG의 URL·해시·크기 |
| `dist/restored-data.js` | 브라우저와 Node가 함께 사용하는 UMD 데이터 모듈 |
| `scripts/import-restored-data.py` | 고정 입력을 게임 카탈로그와 실행 정의로 변환 |
| `dist/assets/champions/` | 플레이 가능한 6명의 초상화 |
| `dist/assets/items/` | 구매 가능한 25개 아이템의 아이콘 |

기본 재생성에는 네트워크·API 키·외부 Python 패키지가 필요 없다. Python 3.9 이상에서 저장소 루트 기준으로 실행한다.

```sh
python scripts/import-restored-data.py
```

앞서 배포한 원작 데이터 패키지의 정규화 값을 다시 반영하려면 그 `data` 폴더를 지정한다. 다른 Data Dragon 빌드는 자동으로 이 프로필에 넣지 않고 오류로 거절한다.

```sh
python scripts/import-restored-data.py --source ../lol_original_reconstruction/data
```

추가 아이템 수치와 이미지 정보는 동봉한 입력에 따로 보존한다. 새 패치로 갱신할 때는 정규화 입력뿐 아니라 설명 전용 효과·구매 지원 목록·충돌/시전 정책·스키마 및 저장 호환을 함께 검토해야 한다.

## 3. API

브라우저 전역은 `NexusRestoredData`, Node는 `require('./dist/restored-data.js')`로 동일한 객체를 얻는다.

```js
{
  version: '16.22.1',
  publicPatch: '26.22',
  unitScale: 0.5,
  profileId: 'lol16.22',
  champions: [],       // 도감 173명
  items: [],           // 도감 863개, 여러 모드 포함
  playableHeroes: [],  // 현재 엔진에 연결하는 6명
  shopItems: [],       // 현재 엔진에 연결하는 25개
  sources: [],
  coverage: {},
  notices: []
}
```

### 도감 챔피언

`id`는 원작 숫자 챔피언 ID, `key`는 `Ahri` 같은 원작 문자열 키다. `name`, `nameEn`, `title`, `resource`, `tags`, 원본 이름을 유지한 `stats`, 네 개 `spells`, `passiveName`, `playableId`와 출처 필드가 있다.

도감 스킬의 `slot`은 `q/w/e/r`, `spellId`는 원작 식별자다. `maxRank`, `cooldownByRank`, `costByRank`, `rangeByRank`는 원본 배열이다. 미해결 식별자는 `unresolvedTokens`에 보존한다.

### 실행 챔피언

ID는 `lol_ahri`, `lol_ashe`, `lol_garen`, `lol_lux`, `lol_leesin`, `lol_jhin`이다. 기존 게임의 `HEROES`와 호환되는 이름·색·역할·기본 스탯·스킬 메타데이터를 갖는다.

`sourceKey`, `sourceId`, `sourceProfile='lol16.22'`, `archetype`, `resourceType`, `originalStats`가 추가된다. 자원은 `mana/energy/none`으로 구분한다. 기력 200을 최대 마나 200으로 해석하거나 가렌의 자원 0을 시전 불가로 판단하지 않는다.

`portrait`는 `assets/champions/Ahri.png`처럼 `dist/` 기준 경로다. 이미지 로드가 실패해도 선택·전투 기능이 실패하지 않도록 UI에 대체 표시를 둔다.

### v9 실행 상태와 정적 버전의 구분

`NexusRestoredData.version`과 저장의 `dataVersion`은 계속 `16.22.1`이다. 게임 저장 형식의 `engineVersion=9`는 별도 값이며 정적 데이터가 다른 패치로 바뀌었다는 뜻이 아니다. 신규 경기는 복원·기존 영웅 모두 v9 상태로 저장하고, 이전 v4~v8 저장은 기존 프로필을 유지한 채 명시적으로 이전한다.

`game.getBasicAttackPreview(target, hero?)`는 현재 관측 가능한 적에 대한 기본 공격의 최소·최대 HP/보호막 피해, 확정/가능 처치 여부와 피해 성분을 반환한다. `restored-gameplay.js`의 실제 공격과 같은 순수 계산 함수를 사용하며 조회 중 RNG·탄약·자원·표식을 변경하지 않는다. 가렌 Q, 럭스 광채, 진 네 번째 탄환, 애쉬 서리/Q를 반영한다.

리 신 E의 재시전 상태에는 해당 시전의 `targetIds`가 있고, Q는 시전자 자신의 `recasts.q.targetId`와 만료 시각을 사용한다. 지연 공격·효과에는 `originX/originY`를 보존한다. v8에 없던 필드는 이전 가능한 사실만으로 채우고, 과거에 소실된 소유권이나 발사 위치를 추정하지 않는다. 자세한 반환 필드·이전 규칙은 [v9-combat.md](v9-combat.md)에 있다.

## 4. 원본 단위와 월드 단위

| 필드 | 단위 |
|---|---|
| 도감 `stats.movespeed`, `stats.attackrange` | 원본 LoL 단위 |
| 모든 `rangeByRank` 배열 | 원본 LoL 단위 |
| 실행 영웅 `range`, `speed` | 원본의 0.5배인 웹 월드 단위 |
| 실행 스킬 `range` | 월드 단위 |
| `runtimeRangeOverride` | 명시적으로 재구성한 월드 단위 |
| 체력·AD·방어력·MR·자원·공격 속도 | 원본 수치 그대로 |
| 쿨다운·비용 배열 | 원본 초·자원 값 그대로 |
| 실행 스킬 `radius`, 충돌·시전 정책 | 프로젝트 재구성값 |

맵 배율을 1.5 또는 2로 바꿔도 이 변환 계수를 다시 곱하지 않는다. 기존 사용자 요구처럼 맵의 배치와 크기를 바꾸며, 챔피언 전투 수치·사거리·이동 속도는 경기 중 일정하다.

애쉬 E/R의 원본 25000은 실제 관측한 투사체 비거리라고 확정하지 않는다. 웹에서는 모든 지원 맵을 덮는 4800 월드 단위로 제한한다. 진 R 역시 원본 25000을 그대로 사용할 수 없으므로 1750 월드 단위의 재구성 사거리를 사용한다. 세 예외는 `runtimeRangeOverride`와 이유를 함께 기록한다.

## 5. 아이템 수치와 조합

도감 `items[].stats`는 `FlatMagicDamageMod` 같은 **원본 키**다. 실행 `shopItems[].stats`는 엔진용 키로 변환했다. 두 객체의 키와 단위를 같은 것으로 취급하지 않는다.

| 원본/추가 수치 | 실행 키 | 단위 |
|---|---|---|
| FlatPhysicalDamageMod | damage | 공격력 |
| FlatMagicDamageMod | abilityPower | 주문력 |
| FlatHPPoolMod / FlatMPPoolMod | maxHp / maxMana | 체력·마나 |
| FlatArmorMod / FlatSpellBlockMod | armor / magicResist | 방어력·마법 저항력 |
| FlatMovementSpeedMod | speed | 원본 ×0.5 |
| PercentMovementSpeedMod | percentSpeed | 4% → 0.04 |
| PercentAttackSpeedMod | attackSpeed | 30% → 0.30 |
| FlatCritChanceMod | critChance | 25% → 0.25 |
| PercentLifeStealMod | lifeSteal | 7% → 0.07 |
| 설명의 Ability Haste | abilityHaste | 가속 수치 |
| 무한의 대검 설명의 Critical Strike Damage | critDamageBonus | 30% → 0.30 |
| 라바돈 설명의 총 AP 증가 | abilityPowerMultiplier | 30% → 0.30 |

가격 `cost`는 완성 가격, `combineCost`는 원본 추가 조합 비용, `sell`은 **공식 판매 가격**이다. 기존 독자 아이템의 일괄 70% 내림 규칙으로 원작 판매가를 다시 만들지 않는다. 예를 들어 곡괭이는 공식 판매가 613을 보존한다.

`components`는 런타임 아이템 ID의 배열이며 수량 중복을 유지한다. 라바돈은 `['lol_1058','lol_1058']`, 광전사의 군화는 `['lol_1001','lol_1042','lol_1042']`다. 같은 재료 한 개를 두 번 차감하거나, 중복 재료를 Set으로 바꾸면 안 된다.

장화·광전사의 군화는 같은 `uniqueGroup='boots'`다. 조합으로 기존 장화를 소모할 수 있지만 완성 장화를 중복 보유하게 만들지 않는다. 무한의 대검과 라바돈도 각자의 고유 그룹을 갖는다.

### 구매 지원 목록 — 25개

| 분류 | 아이템 |
|---|---|
| 이동 | 장화, 광전사의 군화 |
| 공격 | 롱소드, 곡괭이, B.F. 대검, 단검, 민첩성의 망토, 흡혈의 낫, 열정의 검, 무한의 대검 |
| 마법 | 증폭의 고서, 방출의 마법봉, 쓸데없이 큰 지팡이, 라바돈의 죽음모자, 악마의 마법서 |
| 체력·방어 | 루비 수정, 거인의 허리띠, 천 갑옷, 쇠사슬 조끼, 마법무효화의 망토, 음전자 망토 |
| 자원·가속 | 사파이어 수정, 빛나는 티끌, 점화석, 콜필드의 전투 망치 |

군단의 방패는 원본 현대 협곡 맵 플래그가 false이므로 구매 지원 목록에서 제외했다. 효과 수치가 미해결인 아이템이나 별도 활성 스킬이 필요한 아이템을 이름만 올려 놓고 모든 효과가 구현됐다고 표시하지 않는다.

## 6. 근거와 미확정 값

공식 능력치·비용·쿨다운·가격과 별개로, 6명 스킬의 피해 계수·충전 재생·충돌 기하·시전/취소·패시브 동작은 **웹 프로젝트의 재구성 규칙**이다. 데이터 필드 `statsEvidence`, `evidence`, `behaviorEvidence`, `geometryEvidence`로 이를 구분한다. 스킬 이름과 메타데이터가 있다고 원작의 모든 판정이 일치하는 것은 아니다.

원본에는 선택한 6명 모두 `attackdamageperlevel=0`이 있다. 입력을 임의의 과거 값으로 덮어쓰지 않는다. 이 값은 해당 공개 파일의 관측값이며, 원작 실제 레벨별 최종 AD가 성장하지 않는다고 확정하는 증거가 아니다.

설명 전용 수치 6개는 같은 16.22.1 공식 영문 아이템 JSON에서 숫자를 직접 추출했다. `extraStatEvidence`에 URL·설명 필드 포인터·응답 해시를 넣었다. 긴 툴팁 본문은 입력 스냅샷에 배포하지 않는다.

## 7. 공식 원천

- [한국어 챔피언 정적 데이터](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion.json)
- [한국어 아이템 정적 데이터](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/item.json)
- [영문 아이템 정적 데이터](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/en_US/item.json)
- [Riot 개발자 문서: Data Dragon](https://developer.riotgames.com/docs/lol)
- 챔피언별 상세 URL·JSON 포인터·SHA-256은 동봉 입력과 모듈의 개별 행에 보존했다.
- PNG는 동일 버전 Riot Data Dragon의 공개 이미지 경로에서 받았다. 이 게임의 독자 도형·기존 캐릭터 그림과 원작 CDN 이미지는 출처가 다르다.
