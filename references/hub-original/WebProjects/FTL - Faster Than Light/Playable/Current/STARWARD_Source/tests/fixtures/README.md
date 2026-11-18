# 이전 버전 저장 호환성 fixture

## v1

`v1-midcombat.json`은 v2 코드에서 버전 숫자만 바꿔 만든 가짜 저장이 아닙니다. 이전 배포 소스 커밋 `b9fb44ed1fc46370f41b9f02b3af05327aa84c59`의 `dist/data.js`, `dist/engine.js`, `dist/campaign.js`를 `git show`로 읽어 Node `vm`에서 실행하고, 당시 `serialize()`로 생성했습니다.

생성 조건은 시드 42, 첫 교전, 실드·엔진 전력 해제, 레이저 비활성화, 미사일의 적 실드실 조준, 실제 `tick(0.25)` 100회입니다. 이후 일시정지하고 첫 승무원에게 의료실 이동을 명령했습니다. 자원·체력·전투 결과를 직접 대입하지 않았습니다.

저장에는 전투 시간 약 25초, 선체 26/30, 엔지 체력 72/100, 미사일 8개, 진행 중 무기 충전과 이동 경로가 포함됩니다. v2 테스트는 이러한 기존 값을 보존하면서 문·보조 시스템·드론·승무원 물리 위치 등의 신규 필드를 추가하는지 확인합니다. 이 파일은 실제 사용자 저장이나 개인 정보를 포함하지 않습니다.

## v2

`v2-midboarding.json`은 배포 커밋 `7df81dcdb3facd8bd4805c8bcee921920e51aca4`의 실제 v2 스크립트를 `git show`로 읽어 Node `vm`에서 실행하고 당시 `serialize()`로 생성했습니다. 생성 당시 v2 `load()`로도 유효성을 확인했습니다.

시드 42의 첫 교전에서 실드·엔진 전력을 해제하고 레이저를 비활성화한 뒤 미사일로 적 실드실을 조준했습니다. 실제 `tick(0.25)` 100회 후 방어 드론을 전개하고 텔레포터에 전력을 넣었습니다. 록을 적 산소실로 보낸 뒤 의료실 이동을 명령하고, 아군 의료실 에어록을 열어 1초 더 진행한 뒤 정지했습니다. 모든 조작은 공개 명령이며 체력·자원·위치를 직접 대입하지 않았습니다.

전투 시간 약 26초, 선체 26/30, 엔지 체력 72/100, 미사일 8개, 드론 부품 3개가 남습니다. 적선 위 록, 전송 대기 약 17초, 파괴 중인 적 문 내구도 약 24/30, 의료실 산소 약 83.8%, 전개된 방어 드론을 포함합니다. v3 마이그레이션은 이 상태를 유지하면서 기본 아르고·표준 설정과 숙련·은폐·이온·환경 필드를 추가해야 합니다.

## v3

`v3-reward.json`과 `v3-midcloak.json`은 배포 커밋 `438f0412968ed541d2232844c2ceae18339b5e9d`에서 v4 구현을 시작하기 전에 열린 실제 v3 스크립트 세 개를 Node `vm`에 읽어 당시 게임과 `serialize()`로 생성했습니다. 생성 시 `version === 3`이고 `resolveSalvage` API가 없음을 확인했으며, 두 파일 모두 당시 v3 `load()`로 검증했습니다. 현재 버전의 숫자를 바꿔 만든 저장이 아닙니다.

시드 42 레이스·표준으로 출항해 삼연장 레이저는 무기실, 빔은 엔진실→무기실을 조준하고 실제 `tick(0.25)`로 첫 교전을 이겼습니다. 첫 파일은 이 승리 보상 화면입니다. 이어 보상을 확인하고 지도에서 소행성 비콘으로 도약했습니다. 자동 사격을 끄고 6.5초 진행한 뒤 은폐를 켜고 엔지에게 의료실 이동을 예약한 상태를 두 번째 파일로 저장했습니다. 체력·자원·XP·경로·승리 결과를 직접 대입하지 않았습니다.

두 번째 저장에는 누적 전투 약 20.23초, 선체 26/26, 스크랩 83·연료 13·미사일 9·부품 5, 소행성 경보 잔여 1.5초, 은폐 잔여 6초, 조종·무기·기관 운용자의 실제 XP 약 20.23, 아직 실행되지 않은 의료실 이동 경로가 있습니다. v4는 이 상태와 기존 ID·난수·진행을 유지하며 화물·적 전술·회수 통계만 추가해야 합니다. 이전 보상에는 새 장비 선택을 소급하지 않습니다.

생성 시 읽은 파일의 SHA-256은 다음과 같습니다. 배포 기준 커밋의 세 파일과 모두 일치함을 별도로 확인했습니다.

| 파일 | SHA-256 |
|---|---|
| `dist/data.js` | `d362b6666e032449a7925d42853919b9332e60e89dcfc9482cbac612cdc698bf` |
| `dist/engine.js` | `c3e40944464dc4d079a7a9d4cd07a3210c097e5f92e8f95feedb393b9f17f3ea` |
| `dist/campaign.js` | `a090c603d2709a0bd11cf2676bf011f24df48d824826b114310ba3f6f6e1232f` |

## v4

`v4-pending-salvage.json`, `v4-inventory-stations-combat.json`, `v4-midlegacy-route.json`과 아래 재지시 저장 두 개는 배포 커밋 `21a19454feeb3ab5c240fd19533a027dec653267`과 일치하는 실제 v4 코드로 생성했습니다. 생성 시 읽은 세 파일의 SHA-256을 기준 커밋과 별도로 대조해 모두 일치함을 확인했습니다. 다섯 저장 모두 당시 v4 `load()`가 승인했습니다.

시드42 레이스·표준으로 출항하고 삼연장 레이저는 무기실, 빔은 기관실→무기실을 조준해 실제 틱으로 첫 교전을 이겼습니다. 첫 파일은 아직 선택하지 않은 이온 회수품 보상입니다. 이어 이온을 화물로 회수해 기존 삼연장 레이저와 교환하고, 소행성 비콘으로 도약했습니다. 무기를 수동으로 두고 세 번째 승무원을 산소실로 실제 이동시킨 뒤 배치를 저장했습니다. 충전된 이온을 발사하고 0.25초 진행한 뒤 은폐·정지한 상태가 두 번째 파일입니다.

두 번째 파일은 누적 전투 약20.47초, 선체26, 스크랩83·연료13·미사일9·부품5, 화물의 원래 레이저 `wpn-1`, 회수 이온 `equip-29`, 산소실로 바뀐 저장 배치, 실제 적 표적, 소행성 경보 약1.27초·은폐6초·비행 중 이온과 빔 통과 방을 포함합니다.

세 번째 파일은 이 상태에서 산소실 인원에게 함교 이동을 명령해 조금 더 진행한 실제 구 버전 이동입니다. `roomId='oxygen'`, 좌표 `(4.035,3)`, `movePath=['medbay','bridge']`로, 이미 다음 방 내부로 들어갔지만 이전 방식의 방 ID는 아직 바뀌지 않은 경계입니다. 새 로더가 이 정상 구 저장을 거절하거나 위치를 순간이동시키지 않는지 검증합니다.

`v4-retarget-oxygen.json`과 `v4-retarget-shields.json`은 배포 소스 ZIP에서 같은 세 v4 스크립트를 읽어 해시 일치를 다시 확인한 뒤 생성했습니다. 세 번째 파일을 v4로 불러와 정지 상태에서 각각 `moveCrew('crew-5','oxygen')`, `moveCrew('crew-5','shields')`를 실행했습니다. 실제 좌표는 `(4.035,3)`으로 같지만 큐는 각각 `['oxygen']`, `['shields']`입니다. 실제 좌표가 들어간 인접 방과 첫 큐 방이 다를 수 있는 정상 구 버전 재지시를 보존합니다.

모든 생성은 공개 명령과 실제 전투·이동 틱을 사용했습니다. HP·자원·경험치·좌표·승리 결과를 직접 대입하지 않았습니다. v5는 기존 키를 보존하고 양측 함선에 `layoutId='legacy'`만 추가해야 합니다.

| 파일 | SHA-256 |
|---|---|
| `dist/data.js` | `d7bda7003107b74df0bf9cd949385f8893d4a36bef4dac3f3b37880df7e0fd45` |
| `dist/engine.js` | `285f12379f7bf6d444f0c9b201e47109c3cfc2a0051f33136cc1efd87a4b0eec` |
| `dist/campaign.js` | `861cfef275fac1524f5c4d12f13a1bad2450b7157cd872d4bcaf104bf175cd2b` |

## v5

`v5-pending-salvage.json`, `v5-midcombat-boarding.json`, `v5-shop.json`은 배포 기준 `641e80157cff3a49b25e101c4498d8d013cf8d43`의 실제 v5 모듈을 `git show`로 읽어 별도 경로에 고정한 뒤 생성했습니다. v6 작업 중인 모듈과 섞지 않았습니다. 세 저장 모두 당시 v5 로더의 승인과 serialize 완전 일치를 확인했습니다.

재현 절차는 [generate-v5-fixtures.cjs](../generate-v5-fixtures.cjs)에 보존합니다. 이 스크립트는 원본 모듈 세 개의 SHA-256을 먼저 확인하고, 공개 명령·실제 전투와 이동 틱만 실행합니다. HP·자원·좌표·XP·승리·예약 필드를 직접 대입하지 않습니다.

```bash
node tests/generate-v5-fixtures.cjs /path/to/preserved-v5-modules
```

시드42 레이스·표준으로 출항해 레이저는 무기실, 빔은 기관실→무기실을 조준하여 첫 교전을 이깁니다. 첫 저장은 전투13.73초, 선체26, 스크랩83·연료14·미사일9·부품5와 미결정 이온 회수품을 담습니다.

두 번째 저장은 이온을 회수해 원래 레이저와 교환하고 소행성으로 실제 도약한 뒤14초를 수동 사격으로 진행합니다. 배치를 저장하고 전력을 전송기로 옮긴 후 단을 적 산소실로 전송해 함교 이동을 명령하고, 엔지는 본함 의료실로 이동합니다. 조금 더 진행한 뒤 은폐·정지하고 완충 이온의 단발 명령을 예약합니다. 누적28초, 선체24, 무기실 실제손상1·전력2, 레이저 화물, 서로 다른 도면 위의 두 이동 경로, 이온 예약·빔4방 조준·은폐6초·전송 대기·소행성을 포함합니다. 손상으로 빔의 전력이 부족한 상태도 그대로 남깁니다.

세 번째 저장은 실제 첫 보상에서 분기해 이온을 화물로 회수하고 정비소·상점으로 도약한 상태입니다. 이온을 판매하고 은폐 강화·연료를 구매했습니다. 스크랩48·연료16·미사일10·부품6, 은폐2단계와 실제 판매 통계를 포함합니다. v6 변환은 기존3섹터 항해와 도면·현재 비콘·장비·자원을 보존하고 새 월드/능력 필드를 추가해야 합니다.

| 파일 | SHA-256 |
|---|---|
| `dist/data.js` | `514af7b45235474a4c70ea53e6c57a1463c3e837b4463eb427612ca972edf28d` |
| `dist/engine.js` | `22cca7fcfc290c66f1136d1e9974ef6ae4fa0aceca40ce5e91fbb1f3178fb062` |
| `dist/campaign.js` | `ac14ca6714ea5ac55d8d621f9aa863b005475b62f5f8dbc9478517563f58057f` |


## Genuine v6 snapshots for v7 migration

Source commit: `ca542828fbad42b08b0a8993bfb051d2952cbff9`. These files were captured from the v6 public-command campaign during the previous delivery, not made by changing a current save version number. Each exact file was accepted by the original data/engine/campaign scripts from that commit before v7 editing.

| File | Original state | SHA-256 |
|---|---|---|
| v6-quest-in-progress.json | Sector 1 map, hull30, accepted relay quest | a4b9f7778f2e3aff9ce900436a09095508652abc9ac9077778fa8dc205b512e4 |
| v6-hacking-in-flight.json | Sector5 combat, hull35, travelling hacking drone/battery | a811bd3e3a0d827524f8f4b4c90aace6bd9e0238fc44ca35546189a109d78b08 |
| v6-teleport-staging.json | Sector4 combat, hull28, publicly staged Rock crew | e6bcdc434e23d313c45649a0fd50a90c6a61d3e2a90fd9a85ef4717781870a32 |
| v6-world-choice.json | Sector1 map at pending next-sector choice | f4d4fc29167eb4a834fe50b677b8654b749516e15c29e1355e74e7a167c6d4f5 |

The v7 compatibility suite checks the real original fields before any tick, then save/load and public command continuation. New tile/slot metadata is additional; old campaign state is retained.
