/* Generated from the immutable recovery bundle. No fetch/import required. */
(function (root) {
  "use strict";
  const data = {
  "catalogs": {
    "classic": [
      {
        "id": "catapult",
        "name": "캐터펄트",
        "hp": 960,
        "delay": 560,
        "movement": 35,
        "aimMin": 0,
        "aimMax": 90,
        "color": "#D9A05B",
        "body": "catapult",
        "description": "고전 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "catapult_w1",
            "name": "바위탄",
            "kind": "shell",
            "attack": 410.0,
            "radius": 44,
            "terrainRadius": 30,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_catapult_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "410",
              "attackValue": 410,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "small"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "catapult_w2",
            "name": "화염탄",
            "kind": "fire",
            "attack": 150.0,
            "radius": 44,
            "terrainRadius": 30,
            "shots": 1,
            "spread": 0,
            "delay": 200,
            "unlockRound": 1,
            "description": "착탄 지점에 불길을 남겨 지속 피해를 줍니다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "화염·독·지뢰·레이저·물·유도 효과의 발동 범위와 지속시간은 단순화한 구현이며 원작 엔진을 재현한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_catapult_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "150",
              "attackValue": 150,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "small"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_catapult",
            "JP2003_W_catapult_1",
            "JP2003_W_catapult_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/05.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 960,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_catapult"
            },
            {
              "field": "delay",
              "value": 560,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_catapult"
            },
            {
              "field": "movement",
              "value": 35,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_catapult"
            },
            {
              "field": "aimMin",
              "value": 0,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_catapult"
            },
            {
              "field": "aimMax",
              "value": 90,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_catapult"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다."
          ]
        },
        "passives": []
      },
      {
        "id": "crossbow",
        "name": "크로스보우",
        "hp": 930,
        "delay": 580,
        "movement": 39.5,
        "aimMin": 15,
        "aimMax": 80,
        "color": "#65BF91",
        "body": "crossbow",
        "description": "고전 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "crossbow_w1",
            "name": "강철 화살",
            "kind": "shell",
            "attack": 450.0,
            "radius": 34,
            "terrainRadius": 20,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_crossbow_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "450",
              "attackValue": 450,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "extremely_small"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "crossbow_w2",
            "name": "독 화살",
            "kind": "poison",
            "attack": 120.0,
            "radius": 34,
            "terrainRadius": 20,
            "shots": 1,
            "spread": 0,
            "delay": 200,
            "unlockRound": 1,
            "description": "착탄 피해와 독을 남겨 이후 차례에도 피해를 준다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "화염·독·지뢰·레이저·물·유도 효과의 발동 범위와 지속시간은 단순화한 구현이며 원작 엔진을 재현한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_crossbow_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "120",
              "attackValue": 120,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "extremely_small"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_crossbow",
            "JP2003_W_crossbow_1",
            "JP2003_W_crossbow_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/05.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 930,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_crossbow"
            },
            {
              "field": "delay",
              "value": 580,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_crossbow"
            },
            {
              "field": "movement",
              "value": 39.5,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_crossbow"
            },
            {
              "field": "aimMin",
              "value": 15,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_crossbow"
            },
            {
              "field": "aimMax",
              "value": 80,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_crossbow"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다."
          ]
        },
        "passives": []
      },
      {
        "id": "cannon",
        "name": "캐논",
        "hp": 880,
        "delay": 570,
        "movement": 32,
        "aimMin": 22,
        "aimMax": 45,
        "color": "#E56861",
        "body": "cannon",
        "description": "고전 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "cannon_w1",
            "name": "지형 파쇄탄",
            "kind": "shell",
            "attack": 230.0,
            "radius": 86,
            "terrainRadius": 72,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_cannon_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "230",
              "attackValue": 230,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "extremely_large"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "cannon_w2",
            "name": "집중 포탄",
            "kind": "shell",
            "attack": 700.0,
            "radius": 34,
            "terrainRadius": 20,
            "shots": 1,
            "spread": 0,
            "delay": 200,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_cannon_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "700",
              "attackValue": 700,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "extremely_small"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_cannon",
            "JP2003_W_cannon_1",
            "JP2003_W_cannon_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/05.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 880,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_cannon"
            },
            {
              "field": "delay",
              "value": 570,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_cannon"
            },
            {
              "field": "movement",
              "value": 32,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_cannon"
            },
            {
              "field": "aimMin",
              "value": 22,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_cannon"
            },
            {
              "field": "aimMax",
              "value": 45,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_cannon"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다."
          ]
        },
        "passives": []
      },
      {
        "id": "carrot",
        "name": "캐롯탱크",
        "hp": 1000,
        "delay": 560,
        "movement": 42.5,
        "aimMin": 0,
        "aimMax": 45,
        "color": "#F2AD4B",
        "body": "tracked",
        "description": "근대 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "carrot_w1",
            "name": "철갑탄",
            "kind": "shell",
            "attack": 350.0,
            "radius": 54,
            "terrainRadius": 40,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_carrot_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "350",
              "attackValue": 350,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "medium"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "carrot_w2",
            "name": "삼연발",
            "kind": "multi",
            "attack": 190.0,
            "radius": 44,
            "terrainRadius": 30,
            "shots": 3,
            "spread": 4,
            "delay": 200,
            "unlockRound": 1,
            "description": "한 번의 공격에 3발을 분산 발사합니다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문 공격값 570의 합산 단위가 불명하므로, 구현에서만 3발에 균등 배분하여 1발 입력을 190.0로 정했다. 원작의 1발당 공격력 또는 총합을 복원한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_carrot_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "570",
              "attackValue": 570,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": 3,
              "terrainGrade": "small"
            },
            "attackStatus": "simulation_assumption",
            "shotCountStatus": "source_reported",
            "modelAttackAllocation": "source_value_divided_by_visual_projectile_count",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_carrot",
            "JP2003_W_carrot_1",
            "JP2003_W_carrot_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/05.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 1000,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_carrot"
            },
            {
              "field": "delay",
              "value": 560,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_carrot"
            },
            {
              "field": "movement",
              "value": 42.5,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_carrot"
            },
            {
              "field": "aimMin",
              "value": 0,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_carrot"
            },
            {
              "field": "aimMax",
              "value": 45,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_carrot"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다."
          ]
        },
        "passives": []
      },
      {
        "id": "duke",
        "name": "듀크탱크",
        "hp": 1000,
        "delay": 560,
        "movement": 43,
        "aimMin": 0,
        "aimMax": 40,
        "color": "#C19BE4",
        "body": "tracked",
        "description": "근대 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "duke_w1",
            "name": "직격 포탄",
            "kind": "shell",
            "attack": 300.0,
            "radius": 54,
            "terrainRadius": 40,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_duke_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "300",
              "attackValue": 300,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "medium"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "duke_w2",
            "name": "산개 포탄",
            "kind": "shell",
            "attack": 130.0,
            "radius": 54,
            "terrainRadius": 40,
            "shots": 1,
            "spread": 0,
            "delay": 200,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_duke_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "130",
              "attackValue": 130,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "medium"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_duke",
            "JP2003_W_duke_1",
            "JP2003_W_duke_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/05.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 1000,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_duke"
            },
            {
              "field": "delay",
              "value": 560,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_duke"
            },
            {
              "field": "movement",
              "value": 43,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_duke"
            },
            {
              "field": "aimMin",
              "value": 0,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_duke"
            },
            {
              "field": "aimMax",
              "value": 40,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_duke"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다."
          ]
        },
        "passives": []
      },
      {
        "id": "mine_lander",
        "name": "마인랜더",
        "hp": 1150,
        "delay": 560,
        "movement": 40,
        "aimMin": 5,
        "aimMax": 40,
        "color": "#C6A34F",
        "body": "tracked",
        "description": "근대 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "mine_lander_w1",
            "name": "견제 포탄",
            "kind": "shell",
            "attack": 290.0,
            "radius": 54,
            "terrainRadius": 40,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_mine_lander_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "290",
              "attackValue": 290,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "medium"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "mine_lander_w2",
            "name": "매설 지뢰",
            "kind": "mine",
            "attack": 1100.0,
            "radius": 34,
            "terrainRadius": 0,
            "shots": 1,
            "spread": 0,
            "delay": 200,
            "unlockRound": 1,
            "description": "지면에 지뢰를 남긴다. 가까이 접근한 기체가 기폭시킨다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "화염·독·지뢰·레이저·물·유도 효과의 발동 범위와 지속시간은 단순화한 구현이며 원작 엔진을 재현한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_mine_lander_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "1100",
              "attackValue": 1100,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "none_reported"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_mine_lander",
            "JP2003_W_mine_lander_1",
            "JP2003_W_mine_lander_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/05.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 1150,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_mine_lander"
            },
            {
              "field": "delay",
              "value": 560,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_mine_lander"
            },
            {
              "field": "movement",
              "value": 40,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_mine_lander"
            },
            {
              "field": "aimMin",
              "value": 5,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_mine_lander"
            },
            {
              "field": "aimMax",
              "value": 40,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/05.html"
              ],
              "recordId": "JP2003_T_mine_lander"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다."
          ]
        },
        "passives": []
      },
      {
        "id": "missile",
        "name": "미사일",
        "hp": 1100,
        "delay": 560,
        "movement": 41.5,
        "aimMin": 20,
        "aimMax": 40,
        "color": "#5EC1CD",
        "body": "tracked",
        "description": "현대 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "missile_w1",
            "name": "파쇄 미사일",
            "kind": "shell",
            "attack": 370.0,
            "radius": 76,
            "terrainRadius": 62,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_missile_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "370",
              "attackValue": 370,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "very_large_vertical"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "missile_w2",
            "name": "유도 미사일",
            "kind": "homing",
            "attack": 155.0,
            "radius": 44,
            "terrainRadius": 30,
            "shots": 1,
            "spread": 0,
            "delay": 200,
            "unlockRound": 1,
            "description": "하강 중 적을 추적하는 유도탄 1발을 보냅니다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "화염·독·지뢰·레이저·물·유도 효과의 발동 범위와 지속시간은 단순화한 구현이며 원작 엔진을 재현한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_missile_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "155",
              "attackValue": 155,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "small"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_missile",
            "JP2003_W_missile_1",
            "JP2003_W_missile_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/06.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 1100,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_missile"
            },
            {
              "field": "delay",
              "value": 560,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_missile"
            },
            {
              "field": "movement",
              "value": 41.5,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_missile"
            },
            {
              "field": "aimMin",
              "value": 20,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_missile"
            },
            {
              "field": "aimMax",
              "value": 40,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_missile"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다."
          ]
        },
        "passives": []
      },
      {
        "id": "multi_missile",
        "name": "멀티미사일",
        "hp": 1050,
        "delay": 570,
        "movement": 39.5,
        "aimMin": 30,
        "aimMax": 45,
        "color": "#849CE8",
        "body": "tracked",
        "description": "현대 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "multi_missile_w1",
            "name": "삼연 미사일",
            "kind": "multi",
            "attack": 216.6667,
            "radius": 44,
            "terrainRadius": 30,
            "shots": 3,
            "spread": 4,
            "delay": 100,
            "unlockRound": 1,
            "description": "한 번의 공격에 3발을 분산 발사합니다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문 공격값 650의 합산 단위가 불명하므로, 구현에서만 3발에 균등 배분하여 1발 입력을 216.6667로 정했다. 원작의 1발당 공격력 또는 총합을 복원한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_multi_missile_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "650",
              "attackValue": 650,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": 3,
              "terrainGrade": "small"
            },
            "attackStatus": "simulation_assumption",
            "shotCountStatus": "source_reported",
            "modelAttackAllocation": "source_value_divided_by_visual_projectile_count",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "multi_missile_w2",
            "name": "구연 미사일",
            "kind": "multi",
            "attack": 72.2222,
            "radius": 34,
            "terrainRadius": 20,
            "shots": 9,
            "spread": 2.2,
            "delay": 200,
            "unlockRound": 1,
            "description": "한 번의 공격에 9발을 분산 발사합니다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문 공격값 650의 합산 단위가 불명하므로, 구현에서만 9발에 균등 배분하여 1발 입력을 72.2222로 정했다. 원작의 1발당 공격력 또는 총합을 복원한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_multi_missile_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "650",
              "attackValue": 650,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": 9,
              "terrainGrade": "extremely_small"
            },
            "attackStatus": "simulation_assumption",
            "shotCountStatus": "source_reported",
            "modelAttackAllocation": "source_value_divided_by_visual_projectile_count",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_multi_missile",
            "JP2003_W_multi_missile_1",
            "JP2003_W_multi_missile_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/06.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 1050,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_multi_missile"
            },
            {
              "field": "delay",
              "value": 570,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_multi_missile"
            },
            {
              "field": "movement",
              "value": 39.5,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_multi_missile"
            },
            {
              "field": "aimMin",
              "value": 30,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_multi_missile"
            },
            {
              "field": "aimMax",
              "value": 45,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_multi_missile"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다."
          ]
        },
        "passives": []
      },
      {
        "id": "super_tank",
        "name": "슈퍼탱크",
        "hp": 990,
        "delay": 550,
        "movement": 43.5,
        "aimMin": 20,
        "aimMax": 45,
        "color": "#EBD16D",
        "body": "tracked",
        "description": "현대 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "super_tank_w1",
            "name": "중화력 삼연포",
            "kind": "multi",
            "attack": 300.0,
            "radius": 76,
            "terrainRadius": 62,
            "shots": 3,
            "spread": 4,
            "delay": 100,
            "unlockRound": 1,
            "description": "한 번의 공격에 3발을 분산 발사합니다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문 공격값 900의 합산 단위가 불명하므로, 구현에서만 3발에 균등 배분하여 1발 입력을 300.0로 정했다. 원작의 1발당 공격력 또는 총합을 복원한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_super_tank_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "900",
              "attackValue": 900,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": 3,
              "terrainGrade": "very_large_vertical"
            },
            "attackStatus": "simulation_assumption",
            "shotCountStatus": "source_reported",
            "modelAttackAllocation": "source_value_divided_by_visual_projectile_count",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "super_tank_w2",
            "name": "집중 구연포",
            "kind": "multi",
            "attack": 94.4444,
            "radius": 54,
            "terrainRadius": 40,
            "shots": 9,
            "spread": 2.2,
            "delay": 200,
            "unlockRound": 1,
            "description": "한 번의 공격에 9발을 분산 발사합니다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문 공격값 850의 합산 단위가 불명하므로, 구현에서만 9발에 균등 배분하여 1발 입력을 94.4444로 정했다. 원작의 1발당 공격력 또는 총합을 복원한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_super_tank_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "850",
              "attackValue": 850,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": 9,
              "terrainGrade": "medium"
            },
            "attackStatus": "simulation_assumption",
            "shotCountStatus": "source_reported",
            "modelAttackAllocation": "source_value_divided_by_visual_projectile_count",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_super_tank",
            "JP2003_W_super_tank_1",
            "JP2003_W_super_tank_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/06.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 990,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_super_tank"
            },
            {
              "field": "delay",
              "value": 550,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_super_tank"
            },
            {
              "field": "movement",
              "value": 43.5,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_super_tank"
            },
            {
              "field": "aimMin",
              "value": 20,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_super_tank"
            },
            {
              "field": "aimMax",
              "value": 45,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_super_tank"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다."
          ]
        },
        "passives": []
      },
      {
        "id": "laser",
        "name": "레이저탱크",
        "hp": 990,
        "delay": 540,
        "movement": 58,
        "aimMin": 0,
        "aimMax": 33,
        "color": "#77DAE7",
        "body": "hover",
        "description": "미래 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "laser_w1",
            "name": "레이저 펄스",
            "kind": "laser",
            "attack": 300.0,
            "radius": 72,
            "terrainRadius": 58,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "화염·독·지뢰·레이저·물·유도 효과의 발동 범위와 지속시간은 단순화한 구현이며 원작 엔진을 재현한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_laser_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "300",
              "attackValue": 300,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "very_large"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "laser_w2",
            "name": "분산 레이저",
            "kind": "multi",
            "attack": 90.0,
            "radius": 44,
            "terrainRadius": 30,
            "shots": 3,
            "spread": 4,
            "delay": 200,
            "unlockRound": 1,
            "description": "한 번의 공격에 3발을 분산 발사합니다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문 공격값 270의 합산 단위가 불명하므로, 구현에서만 3발에 균등 배분하여 1발 입력을 90.0로 정했다. 원작의 1발당 공격력 또는 총합을 복원한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_laser_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "270",
              "attackValue": 270,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": 3,
              "terrainGrade": "small"
            },
            "attackStatus": "simulation_assumption",
            "shotCountStatus": "source_reported",
            "modelAttackAllocation": "source_value_divided_by_visual_projectile_count",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_laser",
            "JP2003_W_laser_1",
            "JP2003_W_laser_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/06.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 990,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_laser"
            },
            {
              "field": "delay",
              "value": 540,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_laser"
            },
            {
              "field": "movement",
              "value": 58,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_laser"
            },
            {
              "field": "aimMin",
              "value": 0,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_laser"
            },
            {
              "field": "aimMax",
              "value": 33,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_laser"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다.",
            "매설 지뢰의 접근 기폭 대상에서 제외하는 기존 엔진 모델을 passives에 명시했다. 다른 기체가 일으킨 지뢰 폭발이나 직격 피해에 면역인 것은 아니며 원문 내성을 수치화한 값도 아니다."
          ]
        },
        "passives": [
          {
            "id": "mine_trigger_exemption",
            "status": "simulation_assumption",
            "description": "매설 지뢰의 접근 기폭을 일으키지 않는 프로토타입 효과. 지뢰 직격·폭발 피해 면역은 아니다."
          }
        ]
      },
      {
        "id": "ion_attacker",
        "name": "이온어태커",
        "hp": 930,
        "delay": 550,
        "movement": 50,
        "aimMin": 20,
        "aimMax": 55,
        "color": "#9A8FF0",
        "body": "hover",
        "description": "미래 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "ion_attacker_w1",
            "name": "이온탄",
            "kind": "shell",
            "attack": 250.0,
            "radius": 54,
            "terrainRadius": 40,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_ion_attacker_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "250",
              "attackValue": 250,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "medium"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "ion_attacker_w2",
            "name": "위성 펄스",
            "kind": "laser",
            "attack": 350.0,
            "radius": 64,
            "terrainRadius": 50,
            "shots": 1,
            "spread": 0,
            "delay": 200,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "화염·독·지뢰·레이저·물·유도 효과의 발동 범위와 지속시간은 단순화한 구현이며 원작 엔진을 재현한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_ion_attacker_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "350",
              "attackValue": 350,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "large"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_ion_attacker",
            "JP2003_W_ion_attacker_1",
            "JP2003_W_ion_attacker_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/06.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 930,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_ion_attacker"
            },
            {
              "field": "delay",
              "value": 550,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_ion_attacker"
            },
            {
              "field": "movement",
              "value": 50,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_ion_attacker"
            },
            {
              "field": "aimMin",
              "value": 20,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_ion_attacker"
            },
            {
              "field": "aimMax",
              "value": 55,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_ion_attacker"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다."
          ]
        },
        "passives": []
      },
      {
        "id": "secwind",
        "name": "세크윈드",
        "hp": 950,
        "delay": 530,
        "movement": 58,
        "aimMin": 0,
        "aimMax": 40,
        "color": "#8CD0B0",
        "body": "walker",
        "description": "미래 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "secwind_w1",
            "name": "플라즈마탄",
            "kind": "shell",
            "attack": 400.0,
            "radius": 64,
            "terrainRadius": 50,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "곡선 궤도의 포탄 1발로 피해를 주고 지형을 파괴한다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_secwind_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "400",
              "attackValue": 400,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "large"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "secwind_w2",
            "name": "쌍열 펄스",
            "kind": "multi",
            "attack": 275.0,
            "radius": 44,
            "terrainRadius": 30,
            "shots": 2,
            "spread": 4,
            "delay": 200,
            "unlockRound": 1,
            "description": "한 번의 공격에 2발을 분산 발사합니다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문 공격값 550의 합산 단위가 불명하므로, 구현에서만 2발에 균등 배분하여 1발 입력을 275.0로 정했다. 원작의 1발당 공격력 또는 총합을 복원한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_secwind_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "550",
              "attackValue": 550,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": 2,
              "terrainGrade": "small"
            },
            "attackStatus": "simulation_assumption",
            "shotCountStatus": "source_reported",
            "modelAttackAllocation": "source_value_divided_by_visual_projectile_count",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_secwind",
            "JP2003_W_secwind_1",
            "JP2003_W_secwind_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/06.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 950,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_secwind"
            },
            {
              "field": "delay",
              "value": 530,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_secwind"
            },
            {
              "field": "movement",
              "value": 58,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_secwind"
            },
            {
              "field": "aimMin",
              "value": 0,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_secwind"
            },
            {
              "field": "aimMax",
              "value": 40,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_secwind"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다.",
            "HP 50% 이하에서 공격 입력을 1.5배로 적용하는 패시브는 기존 엔진 모델을 명시한 것이다. 원문 HP·공격값·내성 수치를 수정하거나 이 효과를 출처 확정값으로 승격하지 않는다."
          ]
        },
        "passives": [
          {
            "id": "low_hp_attack_boost",
            "hpRatioAtMost": 0.5,
            "attackMultiplier": 1.5,
            "status": "simulation_assumption",
            "description": "HP가 최대치의 절반 이하일 때 공격 입력을 1.5배로 적용하는 프로토타입 효과."
          }
        ]
      },
      {
        "id": "poseidon",
        "name": "포세이돈",
        "hp": 900,
        "delay": 550,
        "movement": 36.5,
        "aimMin": 15,
        "aimMax": 50,
        "color": "#5BA6E8",
        "body": "wedge",
        "description": "미래 계열 · 일본 서비스 2003 문헌 수치를 바탕으로 한 플레이 모델.",
        "weapons": [
          {
            "id": "poseidon_w1",
            "name": "물폭탄",
            "kind": "water",
            "attack": 350.0,
            "radius": 54,
            "terrainRadius": 40,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "물폭탄으로 피해를 주고 다음 두 차례의 이동을 막는다. 밀쳐내기 효과는 없다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "화염·독·지뢰·레이저·물·유도 효과의 발동 범위와 지속시간은 단순화한 구현이며 원작 엔진을 재현한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_poseidon_1",
              "profileId": "JP_2003_literature",
              "attackNotation": "350",
              "attackValue": 350,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "medium"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "poseidon_w2",
            "name": "구속 물폭탄",
            "kind": "water",
            "attack": 280.0,
            "radius": 44,
            "terrainRadius": 30,
            "shots": 1,
            "spread": 0,
            "delay": 200,
            "unlockRound": 1,
            "description": "물폭탄으로 피해를 주고 다음 두 차례의 이동을 막는다. 밀쳐내기 효과는 없다.",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html",
              "https://www.4gamer.net/specials/fortress2/12.html"
            ],
            "assumptions": [
              "무기 이름은 이 프로토타입의 편의 표기이다.",
              "공격 표 수치와 실제 HP 감소량은 같다고 검증되지 않았다. 엔진의 거리 감쇠·피해 배율을 거친다.",
              "폭발·지형 파괴 반경은 문헌의 정성 등급을 참고해 정한 픽셀 단위 모델이다.",
              "원문에 탄수 미기재인 무기는 구현에서 1발로 설정했다.",
              "화염·독·지뢰·레이저·물·유도 효과의 발동 범위와 지속시간은 단순화한 구현이며 원작 엔진을 재현한 값이 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "sourceSnapshot": {
              "recordId": "JP2003_W_poseidon_2",
              "profileId": "JP_2003_literature",
              "attackNotation": "280",
              "attackValue": 280,
              "attackAggregation": "unspecified_in_table",
              "reportedProjectileCount": null,
              "terrainGrade": "small"
            },
            "attackStatus": "source_input",
            "shotCountStatus": "simulation_assumption",
            "modelAttackAllocation": "source_scalar_as_model_input",
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "JP_2003_literature",
          "recordIds": [
            "JP2003_T_poseidon",
            "JP2003_W_poseidon_1",
            "JP2003_W_poseidon_2"
          ],
          "sourceRefs": [
            "https://www.4gamer.net/specials/fortress2/06.html",
            "https://www.4gamer.net/specials/fortress2/12.html"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 900,
              "status": "source_reported",
              "label": "일본 서비스 2003 문헌 HP",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_poseidon"
            },
            {
              "field": "delay",
              "value": 550,
              "status": "source_reported",
              "label": "일본 서비스 2003 기본 딜레이",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html",
                "https://www.4gamer.net/specials/fortress2/12.html"
              ],
              "recordId": "JP2003_T_poseidon"
            },
            {
              "field": "movement",
              "value": 36.5,
              "status": "source_reported",
              "label": "원문 이동력. 월드 이동 거리 환산은 모델",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_poseidon"
            },
            {
              "field": "aimMin",
              "value": 15,
              "status": "source_reported",
              "label": "문헌 최소 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_poseidon"
            },
            {
              "field": "aimMax",
              "value": 50,
              "status": "source_reported",
              "label": "문헌 최대 사격각",
              "sourceRefs": [
                "https://www.4gamer.net/specials/fortress2/06.html"
              ],
              "recordId": "JP2003_T_poseidon"
            }
          ],
          "simulationAssumptions": [
            "한국판 스탯과 혼합하지 않았다. 일본 서비스 문헌 프로필이며 바이너리 검증은 없다.",
            "이동력 원문 단위는 미상이다. 엔진은 원문값 × 2를 턴당 월드 픽셀 예산으로 사용하는 별도 모델이다.",
            "무기 반경, 상태효과, 충돌, 외형과 색상은 구현값이다.",
            "문헌의 내성 표기를 무적 또는 확정 피해 배율로 구현하지 않는다.",
            "매설 지뢰의 접근 기폭 대상에서 제외하는 기존 엔진 모델을 passives에 명시했다. 다른 기체가 일으킨 지뢰 폭발이나 직격 피해에 면역인 것은 아니며 원문 내성을 수치화한 값도 아니다."
          ]
        },
        "passives": [
          {
            "id": "mine_trigger_exemption",
            "status": "simulation_assumption",
            "description": "매설 지뢰의 접근 기폭을 일으키지 않는 프로토타입 효과. 지뢰 직격·폭발 피해 면역은 아니다."
          }
        ]
      }
    ],
    "blue3": [
      {
        "id": "catapult",
        "name": "캐터펄트",
        "hp": 1725,
        "delay": 550,
        "movement": 42,
        "aimMin": 8,
        "aimMax": 82,
        "color": "#F49C57",
        "body": "catapult",
        "description": "공식 공개 HP·딜레이와 4스킬을 기반으로 한 턴제 플레이 모델.",
        "weapons": [
          {
            "id": "large_rock",
            "name": "대형바위",
            "kind": "shell",
            "attack": 440,
            "radius": 62,
            "terrainRadius": 46,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "무거운 바위 1발로 상대와 지형을 함께 공격합니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "flaming_rock",
            "name": "화염바위",
            "kind": "fire",
            "attack": 320,
            "radius": 65,
            "terrainRadius": 38,
            "shots": 1,
            "spread": 0,
            "delay": 180,
            "unlockRound": 1,
            "description": "착탄 지점에 불길을 남겨 상대에게 지속 피해를 줍니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "volcanic_bomb",
            "name": "화산 폭발탄",
            "kind": "fire",
            "attack": 660,
            "radius": 86,
            "terrainRadius": 66,
            "shots": 1,
            "spread": 0,
            "delay": 300,
            "unlockRound": 3,
            "description": "큰 폭발과 화염으로 넓은 범위의 상대와 지형을 공격합니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "large_physical_shield",
            "name": "대형 물리방패",
            "kind": "shield",
            "attack": 0,
            "radius": 0,
            "terrainRadius": 0,
            "shots": 1,
            "spread": 0,
            "delay": 180,
            "unlockRound": 2,
            "description": "자신에게 피해 320을 흡수하는 방어막을 더합니다. 사용하면 차례를 마칩니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "지형에 설치하는 물리방패를 자신에게 적용되는 320 흡수 HP로 바꾼 단순화다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다.",
              "지원기는 한 번만 처리하며 준비된 더블 효과를 사용하지 않고 유지한다. 더블 도구를 준비할 때 재고와 딜레이 비용이 적용되며, 준비 효과는 이후 반복 가능한 공격을 발사할 때 사용한다. 지원 행동은 자기 차례를 마친다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "shieldValue": 320,
            "role": "support",
            "delivery": "self",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "support",
              "repeatable": false,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "F3_KR_mixed_dated_snapshots_prototype",
          "recordIds": [
            "f3_catapult_intro_20260921"
          ],
          "sourceRefs": [
            "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173",
            "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 1725,
              "status": "official_published",
              "label": "공식 신규 캐릭터 HP. 기준 성급·레벨·모드 미상",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173"
              ]
            },
            {
              "field": "delay",
              "value": 550,
              "status": "official_published",
              "label": "공식 신규 캐릭터 딜레이. 기준 성급·레벨·모드 미상",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173"
              ]
            },
            {
              "field": "movement",
              "value": 42,
              "status": "simulation_assumption",
              "label": "턴 이동 예산 모델. 원문 이동속도 1.5와 직접 환산하지 않음",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173"
              ],
              "sourceValue": 1.5
            },
            {
              "field": "aimMin",
              "value": 8,
              "status": "simulation_assumption",
              "label": "플레이용 최소 발사각",
              "sourceRefs": []
            },
            {
              "field": "aimMax",
              "value": 82,
              "status": "simulation_assumption",
              "label": "플레이용 최대 발사각",
              "sourceRefs": []
            }
          ],
          "sourceMovementSpeed": 1.5,
          "sourceStar": null,
          "sourceLevel": null,
          "sourceMode": null,
          "simulationAssumptions": [
            "서로 다른 날짜의 공식 소개와 패치를 조합한 프로토타입이다. 하나의 실제 라이브 빌드라고 주장하지 않는다.",
            "HP 소개표의 성급·레벨은 미상이며 무기의 0성·1레벨 기준과 같다고 확정하지 않는다.",
            "발사각·이동 예산·4스킬 해금 라운드·피해식과 맵은 구현값이다.",
            "F2 수치를 F3 스탯으로 이식하지 않았다."
          ]
        },
        "passives": []
      },
      {
        "id": "mecha_punch",
        "name": "메카펀치",
        "hp": 1834,
        "delay": 560,
        "movement": 40,
        "aimMin": 5,
        "aimMax": 75,
        "color": "#69BCE9",
        "body": "walker",
        "description": "공식 공개 HP·딜레이와 4스킬을 기반으로 한 턴제 플레이 모델.",
        "weapons": [
          {
            "id": "rocket_punch",
            "name": "로켓펀치",
            "kind": "shell",
            "attack": 460,
            "radius": 58,
            "terrainRadius": 42,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "펀치형 충격탄으로 피해를 주고 상대를 밀어냅니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "넉백 세기 65는 엔진 튜닝이다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "effect": {
              "type": "knockback",
              "strength": 65
            },
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "mecha_kick",
            "name": "메카킥",
            "kind": "shell",
            "attack": 520,
            "radius": 72,
            "terrainRadius": 56,
            "shots": 1,
            "spread": 0,
            "delay": 200,
            "unlockRound": 1,
            "description": "묵직한 충격탄으로 주변을 공격하고 상대를 밀어냅니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "넉백 세기 65는 엔진 튜닝이다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "effect": {
              "type": "knockback",
              "strength": 65
            },
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "pulse_laser",
            "name": "펄스레이저",
            "kind": "laser",
            "attack": 680,
            "radius": 70,
            "terrainRadius": 34,
            "shots": 1,
            "spread": 0,
            "delay": 300,
            "unlockRound": 3,
            "description": "중력과 바람의 영향을 받지 않는 직선 레이저를 발사합니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "유도와 레이저의 경로·관통 규칙은 원작을 완전히 복원하지 않은 구현이다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다.",
              "직선 비행, 중력·바람 미적용, 스킬별 사격각 −35~75도는 구현 모델이다. 탱크의 원래 카탈로그 각도는 바꾸지 않는다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "linear",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy",
              "aimMin": -35,
              "aimMax": 75
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "plasma_shield",
            "name": "플라즈마실드",
            "kind": "shield",
            "attack": 0,
            "radius": 0,
            "terrainRadius": 0,
            "shots": 1,
            "spread": 0,
            "delay": 180,
            "unlockRound": 2,
            "description": "자신에게 피해 360을 흡수하는 방어막을 더합니다. 사용하면 차례를 마칩니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "공격을 튕기는 방패를 360 흡수 HP로 바꾼 단순화다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다.",
              "지원기는 한 번만 처리하며 준비된 더블 효과를 사용하지 않고 유지한다. 더블 도구를 준비할 때 재고와 딜레이 비용이 적용되며, 준비 효과는 이후 반복 가능한 공격을 발사할 때 사용한다. 지원 행동은 자기 차례를 마친다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "shieldValue": 360,
            "role": "support",
            "delivery": "self",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "support",
              "repeatable": false,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "F3_KR_mixed_dated_snapshots_prototype",
          "recordIds": [
            "f3_20260527_mecha_punch_hp",
            "f3_20260527_mecha_punch_move_speed",
            "f3_20260527_mecha_punch_delay",
            "f3_20260527_mecha_punch_average_ap_pair1",
            "f3_20260527_mecha_punch_average_ap_pair2"
          ],
          "sourceRefs": [
            "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
            "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 1834,
              "status": "official_published",
              "label": "공식 신규 캐릭터 HP. 기준 성급·레벨·모드 미상",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
              ]
            },
            {
              "field": "delay",
              "value": 560,
              "status": "official_published",
              "label": "공식 신규 캐릭터 딜레이. 기준 성급·레벨·모드 미상",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
              ]
            },
            {
              "field": "movement",
              "value": 40,
              "status": "simulation_assumption",
              "label": "턴 이동 예산 모델. 원문 이동속도 1.4와 직접 환산하지 않음",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
              ],
              "sourceValue": 1.4
            },
            {
              "field": "aimMin",
              "value": 5,
              "status": "simulation_assumption",
              "label": "플레이용 최소 발사각",
              "sourceRefs": []
            },
            {
              "field": "aimMax",
              "value": 75,
              "status": "simulation_assumption",
              "label": "플레이용 최대 발사각",
              "sourceRefs": []
            }
          ],
          "sourceMovementSpeed": 1.4,
          "sourceStar": null,
          "sourceLevel": null,
          "sourceMode": null,
          "simulationAssumptions": [
            "서로 다른 날짜의 공식 소개와 패치를 조합한 프로토타입이다. 하나의 실제 라이브 빌드라고 주장하지 않는다.",
            "HP 소개표의 성급·레벨은 미상이며 무기의 0성·1레벨 기준과 같다고 확정하지 않는다.",
            "발사각·이동 예산·4스킬 해금 라운드·피해식과 맵은 구현값이다.",
            "F2 수치를 F3 스탯으로 이식하지 않았다."
          ]
        },
        "passives": []
      },
      {
        "id": "evil_bella",
        "name": "이블벨라",
        "hp": 1528,
        "delay": 575,
        "movement": 40,
        "aimMin": 10,
        "aimMax": 80,
        "color": "#C190DC",
        "body": "hover",
        "description": "공식 공개 HP·딜레이와 4스킬을 기반으로 한 턴제 플레이 모델.",
        "weapons": [
          {
            "id": "blood_orb",
            "name": "피의구슬",
            "kind": "shell",
            "attack": 580,
            "radius": 56,
            "terrainRadius": 32,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "피의 구슬 1발로 상대를 포격하고 지형을 파괴합니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 2026-08-07 패치 변경 후 공격값을 피해식 입력으로 사용한다. 현재 라이브 값 또는 실측 HP 감소량이라는 뜻은 아니다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "attackStatus": "official_patch_input",
            "sourceSnapshot": {
              "recordId": "f3_20260807_evil_bella_blood_orb_turn_s0_l1_projectile_attack",
              "mode": [
                "2BLUE4K",
                "3BLUE"
              ],
              "star": 0,
              "level": 1,
              "before": 488,
              "after": 580,
              "unit": "attack_value",
              "date": "2026-08-07",
              "currentLiveValueClaim": false
            },
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "venom_bats",
            "name": "맹독박쥐",
            "kind": "poison",
            "attack": 73,
            "radius": 38,
            "terrainRadius": 18,
            "shots": 6,
            "spread": 2.3,
            "delay": 180,
            "unlockRound": 1,
            "description": "독을 남기는 박쥐 6발을 퍼뜨려 쏩니다. 독은 이후 차례에도 피해를 줍니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 2026-08-07 패치 변경 후 공격값을 피해식 입력으로 사용한다. 현재 라이브 값 또는 실측 HP 감소량이라는 뜻은 아니다.",
              "6발은 공식 발수 변경표를 참고한다. 독 피해·지속시간의 모드 적용은 미확인으로 엔진 모델만 사용한다. 73×6을 원작의 확정 총 피해라고 부르지 않는다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "attackStatus": "official_patch_input",
            "sourceSnapshot": {
              "recordId": "f3_20260807_evil_bella_venom_bats_turn_s0_l1_projectile_attack",
              "mode": [
                "2BLUE4K",
                "3BLUE"
              ],
              "star": 0,
              "level": 1,
              "before": 84,
              "after": 73,
              "unit": "attack_value_per_projectile",
              "date": "2026-08-07",
              "currentLiveValueClaim": false
            },
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "vampire_bat_swarm",
            "name": "흡혈박쥐떼",
            "kind": "homing",
            "attack": 540,
            "radius": 68,
            "terrainRadius": 20,
            "shots": 1,
            "spread": 0,
            "delay": 300,
            "unlockRound": 3,
            "description": "적을 추적하고 실제로 준 피해의 25%만큼 자신의 HP를 회복합니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "유도와 레이저의 경로·관통 규칙은 원작을 완전히 복원하지 않은 구현이다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다.",
              "흡혈은 적에게 실제로 감소시킨 HP의 25%이며 최대 HP를 넘지 않는다. 방어막 흡수량·아군 피해·지속 피해는 회복 계산에서 제외한다. 원작의 관통과 흡혈 공식은 복원하지 않았으며 0.25는 독립적인 구현값이다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0.25,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "utility_dispel",
            "name": "유틸해제",
            "kind": "laser",
            "attack": 110,
            "radius": 52,
            "terrainRadius": 0,
            "shots": 1,
            "spread": 0,
            "delay": 160,
            "unlockRound": 2,
            "description": "명중 범위 안 적의 방어·공격 강화를 지우는 지원탄 1발입니다. 반복 발사하지 않습니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "유도와 레이저의 경로·관통 규칙은 원작을 완전히 복원하지 않은 구현이다.",
              "공식 버프 해제 설명을 사용하되 제거 가능한 효과 목록과 110 공격 입력은 모델이다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다.",
              "role=support, delivery=projectile이며 반복하지 않는다. 해제 가능한 효과 목록과 지원탄의 범위 판정은 구현 모델이다.",
              "지원기는 한 번만 처리하며 준비된 더블 효과를 사용하지 않고 유지한다. 더블 도구를 준비할 때 재고와 딜레이 비용이 적용되며, 준비 효과는 이후 반복 가능한 공격을 발사할 때 사용한다. 지원 행동은 자기 차례를 마친다.",
              "버프 해제는 적에게만 적용한다. 지원탄의 일반 폭발 피해는 아군에게도 적용될 수 있다. 대상 필터와 아군 피해 규칙은 구현 모델이다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "effect": {
              "type": "dispel"
            },
            "role": "support",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "support",
              "repeatable": false,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "F3_KR_mixed_dated_snapshots_prototype",
          "recordIds": [
            "f3_20260527_evil_bella_hp",
            "f3_20260527_evil_bella_move_speed",
            "f3_20260527_evil_bella_delay",
            "f3_20260527_evil_bella_average_ap"
          ],
          "sourceRefs": [
            "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
            "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 1528,
              "status": "official_published",
              "label": "공식 신규 캐릭터 HP. 기준 성급·레벨·모드 미상",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
              ]
            },
            {
              "field": "delay",
              "value": 575,
              "status": "official_published",
              "label": "공식 신규 캐릭터 딜레이. 기준 성급·레벨·모드 미상",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
              ]
            },
            {
              "field": "movement",
              "value": 40,
              "status": "simulation_assumption",
              "label": "턴 이동 예산 모델. 원문 이동속도 1.4와 직접 환산하지 않음",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
              ],
              "sourceValue": 1.4
            },
            {
              "field": "aimMin",
              "value": 10,
              "status": "simulation_assumption",
              "label": "플레이용 최소 발사각",
              "sourceRefs": []
            },
            {
              "field": "aimMax",
              "value": 80,
              "status": "simulation_assumption",
              "label": "플레이용 최대 발사각",
              "sourceRefs": []
            }
          ],
          "sourceMovementSpeed": 1.4,
          "sourceStar": null,
          "sourceLevel": null,
          "sourceMode": null,
          "simulationAssumptions": [
            "서로 다른 날짜의 공식 소개와 패치를 조합한 프로토타입이다. 하나의 실제 라이브 빌드라고 주장하지 않는다.",
            "HP 소개표의 성급·레벨은 미상이며 무기의 0성·1레벨 기준과 같다고 확정하지 않는다.",
            "발사각·이동 예산·4스킬 해금 라운드·피해식과 맵은 구현값이다.",
            "F2 수치를 F3 스탯으로 이식하지 않았다."
          ]
        },
        "passives": []
      },
      {
        "id": "baseball_boy",
        "name": "야구소년",
        "hp": 1528,
        "delay": 555,
        "movement": 40,
        "aimMin": 12,
        "aimMax": 78,
        "color": "#E87981",
        "body": "cannon",
        "description": "공식 공개 HP·딜레이와 4스킬을 기반으로 한 턴제 플레이 모델.",
        "weapons": [
          {
            "id": "bouncy_hit",
            "name": "퉁퉁안타",
            "kind": "shell",
            "attack": 440,
            "radius": 52,
            "terrainRadius": 32,
            "shots": 1,
            "spread": 0,
            "delay": 100,
            "unlockRound": 1,
            "description": "지형에서 한 번 반사되는 공을 쏩니다. 명중하면 피해를 주고 상대를 밀어냅니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "넉백 세기 65는 엔진 튜닝이다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다.",
              "지형 반사 1회와 반사 속도 계수 0.72는 구현값이다. 원작의 바운스 횟수·반사식·다중 명중 규칙을 확정한 것이 아니다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "effect": {
              "type": "knockback",
              "strength": 65
            },
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 1,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "flaming_ball",
            "name": "화염마구",
            "kind": "fire",
            "attack": 350,
            "radius": 64,
            "terrainRadius": 40,
            "shots": 1,
            "spread": 0,
            "delay": 180,
            "unlockRound": 1,
            "description": "착탄 지점에 불길을 남기는 공으로 지속 피해를 줍니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "homing_bounce_ball",
            "name": "통통유도볼",
            "kind": "homing",
            "attack": 304,
            "radius": 70,
            "terrainRadius": 34,
            "shots": 1,
            "spread": 0,
            "delay": 240,
            "unlockRound": 3,
            "description": "적을 추적하며 지형에서 최대 두 번 반사되는 공을 발사합니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 2026-08-07 패치 변경 후 공격값을 피해식 입력으로 사용한다. 현재 라이브 값 또는 실측 HP 감소량이라는 뜻은 아니다.",
              "유도와 레이저의 경로·관통 규칙은 원작을 완전히 복원하지 않은 구현이다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다.",
              "공식 0성·1레벨 변경 후 공격 입력 304는 유지한다. 지형 반사 2회와 반사 속도 계수 0.72는 구현값이며 원작의 확정 바운스 규칙이 아니다."
            ],
            "attackStatus": "official_patch_input",
            "sourceSnapshot": {
              "recordId": "f3_20260807_baseball_boy_homing_bounce_ball_turn_s0_l1_projectile_attack",
              "mode": [
                "2BLUE4K",
                "3BLUE"
              ],
              "star": 0,
              "level": 1,
              "before": 363,
              "after": 304,
              "unit": "attack_value",
              "date": "2026-08-07",
              "currentLiveValueClaim": false
            },
            "role": "attack",
            "delivery": "projectile",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 2,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "attack",
              "repeatable": true,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          },
          {
            "id": "amplifier_gear",
            "name": "증폭기어",
            "kind": "shield",
            "attack": 0,
            "radius": 0,
            "terrainRadius": 0,
            "shots": 1,
            "spread": 0,
            "delay": 160,
            "unlockRound": 2,
            "description": "자신의 다음 두 차례 동안 공격을 20% 강화합니다. 사용하면 차례를 마칩니다.",
            "sourceRefs": [
              "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
            ],
            "assumptions": [
              "폭발 반경·파괴 반경·탄속·지형 변형·상태 지속시간은 프로토타입 튜닝이다.",
              "스킬 추가 딜레이와 해금 라운드는 구현값이다.",
              "공식 공격 수치가 복구되지 않아 이 무기의 attack은 구현용으로 정했다. 다른 포트리스 게임의 값을 가져오지 않았다.",
              "원문 0성1레벨 20%는 REAL 인접 문맥의 모드 미명시 표다. 본 턴 모델의 자신 2턴 1.2배 적용은 튜닝이며 실제 3BLUE 상수로 확정하지 않는다.",
              "role·delivery·behavior는 이 프로토타입의 실행 규칙이다. attackStatus와 별개이며, 바운스·반사 계수·흡혈·추적 대상·반복 정책을 원작 확정값으로 표시하지 않는다.",
              "지원기는 한 번만 처리하며 준비된 더블 효과를 사용하지 않고 유지한다. 더블 도구를 준비할 때 재고와 딜레이 비용이 적용되며, 준비 효과는 이후 반복 가능한 공격을 발사할 때 사용한다. 지원 행동은 자기 차례를 마친다."
            ],
            "attackStatus": "simulation_assumption",
            "sourceSnapshot": null,
            "shieldValue": 0,
            "effect": {
              "type": "attackBuff",
              "multiplier": 1.2,
              "durationTurns": 2
            },
            "role": "support",
            "delivery": "self",
            "behavior": {
              "trajectory": "ballistic",
              "bounces": 0,
              "restitution": 0.72,
              "lifeSteal": 0,
              "role": "support",
              "repeatable": false,
              "homingTarget": "enemy"
            },
            "behaviorStatus": "simulation_assumption"
          }
        ],
        "provenance": {
          "profileId": "F3_KR_mixed_dated_snapshots_prototype",
          "recordIds": [
            "f3_20260527_baseball_boy_hp",
            "f3_20260527_baseball_boy_move_speed",
            "f3_20260527_baseball_boy_delay",
            "f3_20260527_baseball_boy_average_ap"
          ],
          "sourceRefs": [
            "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
            "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771"
          ],
          "statSources": [
            {
              "field": "hp",
              "value": 1528,
              "status": "official_published",
              "label": "공식 신규 캐릭터 HP. 기준 성급·레벨·모드 미상",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
              ]
            },
            {
              "field": "delay",
              "value": 555,
              "status": "official_published",
              "label": "공식 신규 캐릭터 딜레이. 기준 성급·레벨·모드 미상",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
              ]
            },
            {
              "field": "movement",
              "value": 40,
              "status": "simulation_assumption",
              "label": "턴 이동 예산 모델. 원문 이동속도 1.4와 직접 환산하지 않음",
              "sourceRefs": [
                "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
              ],
              "sourceValue": 1.4
            },
            {
              "field": "aimMin",
              "value": 12,
              "status": "simulation_assumption",
              "label": "플레이용 최소 발사각",
              "sourceRefs": []
            },
            {
              "field": "aimMax",
              "value": 78,
              "status": "simulation_assumption",
              "label": "플레이용 최대 발사각",
              "sourceRefs": []
            }
          ],
          "sourceMovementSpeed": 1.4,
          "sourceStar": null,
          "sourceLevel": null,
          "sourceMode": null,
          "simulationAssumptions": [
            "서로 다른 날짜의 공식 소개와 패치를 조합한 프로토타입이다. 하나의 실제 라이브 빌드라고 주장하지 않는다.",
            "HP 소개표의 성급·레벨은 미상이며 무기의 0성·1레벨 기준과 같다고 확정하지 않는다.",
            "발사각·이동 예산·4스킬 해금 라운드·피해식과 맵은 구현값이다.",
            "F2 수치를 F3 스탯으로 이식하지 않았다."
          ]
        },
        "passives": []
      }
    ]
  },
  "profiles": [
    {
      "id": "classic",
      "name": "클래식 · 13종",
      "description": "일본 서비스 2003 문헌 스탯을 바탕으로 한 2무기 턴제.",
      "teamSize": 2,
      "teamSizes": [
        1,
        2,
        4
      ],
      "turnLimit": 25,
      "suddenDeathRound": 9,
      "maxRound": 14,
      "provenance": {
        "sourceProfile": "JP_2003_literature",
        "assumptions": [
          "1대1 지원, 25초 턴, 9라운드 서든데스와 14라운드 제한은 프로토타입 규칙이다.",
          "JP2003 스피드 모드 15초 기록을 25초 기본 모드의 근거로 사용하지 않는다."
        ]
      }
    },
    {
      "id": "blue3",
      "name": "BLUE3 · 4스킬",
      "description": "공식 공개 캐릭터 4종 · 4대4 · 7+3 라운드 플레이 모델.",
      "teamSize": 4,
      "teamSizes": [
        4
      ],
      "turnLimit": 25,
      "suddenDeathRound": 8,
      "maxRound": 10,
      "provenance": {
        "sourceRefs": [
          "https://sites.google.com/view/fortress3blueguide/3blue"
        ],
        "sourceTurns": {
          "normal": 7,
          "suddenDeath": 3,
          "total": 10
        },
        "assumptions": [
          "공식 7+3 턴을 각 생존 캐릭터가 한 번 이상 행동하는 라운드로 해석했다. 원문의 턴 카운터 단위는 미확정이다.",
          "25초 행동 제한, 스킬 해금 라운드, 제한 종료 시 승부 판정은 구현 규칙이다.",
          "공식 서든데스 3회 스킬 반복 설명을 구현하되 복합 다탄과의 결합·판정은 모델이다."
        ]
      }
    }
  ],
  "maps": [
    {
      "id": "highlands",
      "name": "바람의 능선",
      "theme": "highlands",
      "description": "높낮이가 다른 산등성이. 포물선과 지형 파괴를 익히는 오리지널 맵.",
      "seed": 104729
    },
    {
      "id": "islands",
      "name": "부유 군도",
      "theme": "islands",
      "description": "떨어진 섬과 열린 낙하 공간. 이동탄으로 경로를 만드는 오리지널 맵.",
      "seed": 130363
    },
    {
      "id": "foundry",
      "name": "황혼의 주조소",
      "theme": "foundry",
      "description": "단차와 가로 보가 교차하는 산업 테마 오리지널 맵.",
      "seed": 155921
    }
  ],
  "items": [
    {
      "id": "repair",
      "name": "회복",
      "description": "클래식 최대 HP 20% · BLUE3 회복량 5% 모델. 사용 후 발사할 수 있다.",
      "value": 0.2,
      "profileValues": {
        "classic": 0.2,
        "blue3": 0.05
      },
      "delay": 200,
      "sourceRefs": [
        "https://www.4gamer.net/specials/fortress2/07.html",
        "https://www.4gamer.net/specials/fortress2/14.html",
        "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31"
      ],
      "assumptions": [
        "클래식은 JP2003 소형 회복 20%를 사용한다.",
        "BLUE3는 2026-06-05 추가된 희귀 회복약 0성1레벨 변경 후 5%를 선택했다. 원문 분모가 명시되지 않아 최대 HP 기준 적용은 모델이다.",
        "아이템 추가 딜레이는 문헌 내 100/200 충돌 중 200을 채택한 모델이다. BLUE3에도 같은 추가 비용을 쓰는 것은 튜닝이다."
      ],
      "provenanceByProfile": {
        "classic": {
          "status": "source_reported",
          "recordId": "f2jp2003_item_energy_small",
          "healPercent": 20,
          "base": "max_hp"
        },
        "blue3": {
          "status": "official_percent_with_model_base",
          "recordId": "f3_r2_item_healing_potion_rare_heal_percent_s0_l1",
          "star": 0,
          "level": 1,
          "rarity": "rare",
          "healPercent": 5,
          "sourceMode": null,
          "base": "max_hp_assumed"
        }
      }
    },
    {
      "id": "shield",
      "name": "방어막",
      "description": "다음 공격 1회를 막는다. 연속탄은 각각 판정한다.",
      "value": 1,
      "delay": 200,
      "sourceRefs": [
        "https://www.4gamer.net/specials/fortress2/07.html",
        "https://www.4gamer.net/specials/fortress2/14.html"
      ],
      "assumptions": [
        "클래식 JP2003 SHIELD의 1회 방어를 참고한다. 발사체별 판정은 구현의 선택이다.",
        "BLUE3에서는 공용 프로토타입 도구이다. F3 원작 방패 아이템의 수치가 아니다."
      ]
    },
    {
      "id": "double",
      "name": "더블",
      "description": "다음 공격을 같은 각도와 힘으로 2회 반복하도록 준비한다. 지원기·턴 넘기기 후에도 준비 효과가 남는다.",
      "value": 2,
      "delay": 200,
      "sourceRefs": [
        "https://www.4gamer.net/specials/fortress2/09.html"
      ],
      "assumptions": [
        "클래식 JP2003 DOUBLE FIRE의 2회·동일 각도·동일 힘을 참고한다.",
        "반복 간격과 서든데스 반복과의 결합은 엔진 모델이다.",
        "BLUE3에서는 프로토타입 도구이며 공식 더블파이어의 성장 공격 계수는 적용하지 않았다."
      ]
    },
    {
      "id": "teleport",
      "name": "이동탄",
      "description": "다음 발사를 이동탄으로 바꾸고 착탄 지점으로 이동한다.",
      "value": 0,
      "delay": 200,
      "sourceRefs": [
        "https://www.4gamer.net/specials/fortress2/09.html"
      ],
      "assumptions": [
        "클래식 JP2003 TELEPORT의 착탄점 자기 이동을 참고한다. 안전 착지 보정은 모델이다.",
        "BLUE3의 이동탄은 공식 수치 복원이 아닌 공용 프로토타입 행동이다."
      ]
    }
  ],
  "tuningDefaults": {
    "gravity": 320,
    "windAcceleration": 9,
    "maxLaunchSpeed": 1050,
    "minLaunchSpeed": 90,
    "damageScale": 0.75,
    "terrainScale": 1,
    "turnTime": 25
  },
  "provenance": {
    "summary": "문헌·공식 공지의 공개값과 구현용 가정을 분리한 오프라인 플레이 프로토타입.",
    "sourceBundle": {
      "version": "1.2.0",
      "records": 1208,
      "sha256": "ae45745e803d403bbe434e7903497ce1d067f5ee063fa71bb2b803b0db0bc384",
      "retrievedDate": "2026-11-18",
      "originalBinaryExtracted": false,
      "runtimeValidated": false
    },
    "sources": [
      {
        "id": "JP05",
        "title": "4Gamer 포트리스2 일본 서비스 2003 — 고전·근대 탱크",
        "url": "https://www.4gamer.net/specials/fortress2/05.html",
        "date": "2003-07-25",
        "profile": "JP_2003_literature"
      },
      {
        "id": "JP06",
        "title": "4Gamer 포트리스2 일본 서비스 2003 — 현대·미래 탱크",
        "url": "https://www.4gamer.net/specials/fortress2/06.html",
        "date": "2003-08-01",
        "profile": "JP_2003_literature"
      },
      {
        "id": "JP07",
        "title": "4Gamer 2003 — 회복·실드 아이템",
        "url": "https://www.4gamer.net/specials/fortress2/07.html",
        "date": "2003-08-08",
        "profile": "JP_2003_literature"
      },
      {
        "id": "JP09",
        "title": "4Gamer 2003 — 더블·텔레포트 아이템",
        "url": "https://www.4gamer.net/specials/fortress2/09.html",
        "date": "2003-08-08",
        "profile": "JP_2003_literature"
      },
      {
        "id": "JP12",
        "title": "4Gamer 2003 — 딜레이 규칙",
        "url": "https://www.4gamer.net/specials/fortress2/12.html",
        "date": "2003-08-22",
        "profile": "JP_2003_literature"
      },
      {
        "id": "JP14",
        "title": "4Gamer 2003 — 회복·실드 상세 설명",
        "url": "https://www.4gamer.net/specials/fortress2/14.html",
        "date": "2003-09-05",
        "profile": "JP_2003_literature"
      },
      {
        "id": "F3_31",
        "title": "포트리스3 BLUE 신규 3종·아이템 공지",
        "url": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "date": "2026-05-27",
        "profile": "F3_KR_patch_snapshot",
        "amendmentDate": "2026-06-05"
      },
      {
        "id": "F3_771",
        "title": "포트리스3 BLUE 8/7 밸런스 공지",
        "url": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771",
        "date": "2026-08-07",
        "profile": "F3_KR_patch_snapshot"
      },
      {
        "id": "F3_1173",
        "title": "포트리스3 BLUE 캐터펄트 추가 공지",
        "url": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173",
        "date": "2026-09-21",
        "profile": "F3_KR_patch_snapshot"
      },
      {
        "id": "F3_GUIDE",
        "title": "포트리스3 BLUE 공식 3BLUE 가이드",
        "url": "https://sites.google.com/view/fortress3blueguide/3blue",
        "date": null,
        "profile": "F3_KR_guide_retrieved_20261118"
      }
    ],
    "fieldStatusLegend": {
      "source_reported": "JP2003 문헌 수치 그대로",
      "source_input": "문헌 공격값을 모델 피해식 입력에 사용",
      "official_published": "공식 공지 수치 그대로; 기준 미상 항목 별도",
      "official_patch_input": "공식 패치의 지정 모드·성급·레벨 공격 입력",
      "simulation_assumption": "플레이 구현용 조정값 또는 규칙"
    },
    "assumptions": [
      {
        "id": "simulation_identity",
        "title": "플레이 가능한 복원 실험",
        "description": "공개 자료의 일부 값을 입력으로 삼은 독립 프로토타입이다. 원작 바이너리, 서버 규칙 또는 현재 밸런스의 완전 복제본이 아니다."
      },
      {
        "id": "physics",
        "title": "물리와 피해식",
        "description": "중력 320, 풍가속도 9, 발사속도 90~1050, 피해 배율 0.75, 원형 파괴·충돌·거리 감쇠는 구현값이다. 원작 물리 상수는 미복구이다."
      },
      {
        "id": "multi_attack",
        "title": "클래식 다탄 입력",
        "description": "JP2003 표의 공격 수치는 발당/총합 미확정이다. 구현은 표 값을 시각적 탄수에 균등 배분한다. 원작 공격력을 탄수로 곱해 확정하지 않는다."
      },
      {
        "id": "f3_dates",
        "title": "BLUE3 기준 날짜",
        "description": "신규 HP/딜레이 소개와 8/7 0성1레벨 공격값을 별도 출처로 기록한다. 다른 날짜·성급 기준이 같은 빌드라고 합쳐 확정하지 않는다."
      },
      {
        "id": "movement",
        "title": "이동 거리 환산",
        "description": "클래식의 원문 이동력은 그대로 저장하되 월드 예산은 2배 픽셀 모델이다. BLUE3의 이동속도 1.4/1.5는 보존만 하며 턴 예산 40/42와 별도이다."
      },
      {
        "id": "rounds",
        "title": "라운드와 해금",
        "description": "BLUE3의 7+3을 전체 생존 캐릭터 행동 묶음으로 해석했다. 2·3라운드 스킬 해금과 25초 제한은 플레이를 위한 선택이다."
      },
      {
        "id": "maps_visuals",
        "title": "새로 그린 전장과 기체",
        "description": "맵 3개, 지형 마스크, 탱크 실루엣, 색상, 소리는 독립 제작이다. 원작 이미지·지형 데이터 추출물이 아니다."
      },
      {
        "id": "items",
        "title": "간소화한 도구",
        "description": "클래식의 회복20%·방어1회·더블2회·착탄 이동을 참고한다. BLUE3 회복은 공식 희귀0성1레벨5%를 쓰되 분모·공용 도구와 딜레이는 모델이다."
      },
      {
        "id": "skill_behavior",
        "title": "고유 스킬 실행 모델",
        "description": "BLUE3 흡혈 25%, 바운스 1/2회와 반사 계수 0.72, 펄스레이저 직선과 −35~75도 조준, 지원탄 반복 제외는 simulation_assumption이다. 공개 공격 입력과 동일한 출처 상수로 합치지 않는다."
      }
    ],
    "sourceSnapshots": [
      {
        "record_id": "JP2003_T_catapult",
        "tank_id": "catapult",
        "name_ko": "캐터펄트",
        "name_source": "CATAPULT",
        "era_ko": "고전",
        "hp": 960,
        "base_delay": 560,
        "movement": 35,
        "aim_min_deg": 0,
        "aim_max_deg": 90,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "炎",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_catapult_1",
          "JP2003_W_catapult_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CATAPULT table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-07-25",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_catapult_1",
        "tank_id": "catapult",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "410",
        "attack_value_source": 410,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "小",
        "terrain_destruction_qualitative": "small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CATAPULT table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_W_catapult_2",
        "tank_id": "catapult",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "150",
        "attack_value_source": 150,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "小",
        "terrain_destruction_qualitative": "small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CATAPULT table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_T_crossbow",
        "tank_id": "crossbow",
        "name_ko": "크로스보우",
        "name_source": "CROSS BOW",
        "era_ko": "고전",
        "hp": 930,
        "base_delay": 580,
        "movement": 39.5,
        "aim_min_deg": 15,
        "aim_max_deg": 80,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "毒",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_crossbow_1",
          "JP2003_W_crossbow_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CROSS BOW table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-07-25",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_crossbow_1",
        "tank_id": "crossbow",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "450",
        "attack_value_source": 450,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "極小",
        "terrain_destruction_qualitative": "extremely_small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CROSS BOW table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_W_crossbow_2",
        "tank_id": "crossbow",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "120",
        "attack_value_source": 120,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "極小",
        "terrain_destruction_qualitative": "extremely_small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CROSS BOW table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_T_cannon",
        "tank_id": "cannon",
        "name_ko": "캐논",
        "name_source": "CANNON",
        "era_ko": "고전",
        "hp": 880,
        "base_delay": 570,
        "movement": 32,
        "aim_min_deg": 22,
        "aim_max_deg": 45,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "-",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_cannon_1",
          "JP2003_W_cannon_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CANNON table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-07-25",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_cannon_1",
        "tank_id": "cannon",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "230",
        "attack_value_source": 230,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "極大",
        "terrain_destruction_qualitative": "extremely_large",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CANNON table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_W_cannon_2",
        "tank_id": "cannon",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "700",
        "attack_value_source": 700,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "極小",
        "terrain_destruction_qualitative": "extremely_small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CANNON table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_T_carrot",
        "tank_id": "carrot",
        "name_ko": "캐롯탱크",
        "name_source": "CAROTT TANK",
        "era_ko": "근대",
        "hp": 1000,
        "base_delay": 560,
        "movement": 42.5,
        "aim_min_deg": 0,
        "aim_max_deg": 45,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "-",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_carrot_1",
          "JP2003_W_carrot_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CAROTT TANK table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-07-25",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_carrot_1",
        "tank_id": "carrot",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "350",
        "attack_value_source": 350,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "中",
        "terrain_destruction_qualitative": "medium",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CAROTT TANK table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_W_carrot_2",
        "tank_id": "carrot",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "570",
        "attack_value_source": 570,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": 3,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "小",
        "terrain_destruction_qualitative": "small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "CAROTT TANK table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_T_duke",
        "tank_id": "duke",
        "name_ko": "듀크탱크",
        "name_source": "DUKE TANK",
        "era_ko": "근대",
        "hp": 1000,
        "base_delay": 560,
        "movement": 43,
        "aim_min_deg": 0,
        "aim_max_deg": 40,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "毒",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_duke_1",
          "JP2003_W_duke_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "DUKE TANK table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-07-25",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_duke_1",
        "tank_id": "duke",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "300",
        "attack_value_source": 300,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "中",
        "terrain_destruction_qualitative": "medium",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "DUKE TANK table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_W_duke_2",
        "tank_id": "duke",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "130",
        "attack_value_source": 130,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "中",
        "terrain_destruction_qualitative": "medium",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "DUKE TANK table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_T_mine_lander",
        "tank_id": "mine_lander",
        "name_ko": "마인랜더",
        "name_source": "MINE LANDER",
        "era_ko": "근대",
        "hp": 1150,
        "base_delay": 560,
        "movement": 40,
        "aim_min_deg": 5,
        "aim_max_deg": 40,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "地雷",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_mine_lander_1",
          "JP2003_W_mine_lander_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "MINE LANDER table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-07-25",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_mine_lander_1",
        "tank_id": "mine_lander",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "290",
        "attack_value_source": 290,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "中",
        "terrain_destruction_qualitative": "medium",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "MINE LANDER table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_W_mine_lander_2",
        "tank_id": "mine_lander",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "1100",
        "attack_value_source": 1100,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "なし",
        "terrain_destruction_qualitative": "none_reported",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP05",
        "source_url": "https://www.4gamer.net/specials/fortress2/05.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "MINE LANDER table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-07-25"
      },
      {
        "record_id": "JP2003_T_missile",
        "tank_id": "missile",
        "name_ko": "미사일",
        "name_source": "MISSILE",
        "era_ko": "현대",
        "hp": 1100,
        "base_delay": 560,
        "movement": 41.5,
        "aim_min_deg": 20,
        "aim_max_deg": 40,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "-",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_missile_1",
          "JP2003_W_missile_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "MISSILE table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-08-01",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_missile_1",
        "tank_id": "missile",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "370",
        "attack_value_source": 370,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "縦方向に特大",
        "terrain_destruction_qualitative": "very_large_vertical",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "MISSILE table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_W_missile_2",
        "tank_id": "missile",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "155",
        "attack_value_source": 155,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "小",
        "terrain_destruction_qualitative": "small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "MISSILE table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_T_multi_missile",
        "tank_id": "multi_missile",
        "name_ko": "멀티미사일",
        "name_source": "MULTI MISSILE",
        "era_ko": "현대",
        "hp": 1050,
        "base_delay": 570,
        "movement": 39.5,
        "aim_min_deg": 30,
        "aim_max_deg": 45,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "-",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_multi_missile_1",
          "JP2003_W_multi_missile_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "MULTI MISSILE table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-08-01",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_multi_missile_1",
        "tank_id": "multi_missile",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "650",
        "attack_value_source": 650,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": 3,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "小",
        "terrain_destruction_qualitative": "small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "MULTI MISSILE table weapon 1",
        "notes": [
          "650이 1발당인지 전체 사격 기준인지 원문 표만으로 확정할 수 없다.",
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_W_multi_missile_2",
        "tank_id": "multi_missile",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "650",
        "attack_value_source": 650,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": 9,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "極小",
        "terrain_destruction_qualitative": "extremely_small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "MULTI MISSILE table weapon 2",
        "notes": [
          "650이 1발당인지 전체 사격 기준인지 원문 표만으로 확정할 수 없다.",
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_T_super_tank",
        "tank_id": "super_tank",
        "name_ko": "슈퍼탱크",
        "name_source": "SUPER TANK",
        "era_ko": "현대",
        "hp": 990,
        "base_delay": 550,
        "movement": 43.5,
        "aim_min_deg": 20,
        "aim_max_deg": 45,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "すべて",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_super_tank_1",
          "JP2003_W_super_tank_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "SUPER TANK table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-08-01",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_super_tank_1",
        "tank_id": "super_tank",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "900",
        "attack_value_source": 900,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": 3,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "縦方向に特大",
        "terrain_destruction_qualitative": "very_large_vertical",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "SUPER TANK table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_W_super_tank_2",
        "tank_id": "super_tank",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "850",
        "attack_value_source": 850,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": 9,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "中",
        "terrain_destruction_qualitative": "medium",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "SUPER TANK table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_T_laser",
        "tank_id": "laser",
        "name_ko": "레이저탱크",
        "name_source": "LASER TANK",
        "era_ko": "미래",
        "hp": 990,
        "base_delay": 540,
        "movement": 58,
        "aim_min_deg": 0,
        "aim_max_deg": 33,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "雷",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_laser_1",
          "JP2003_W_laser_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "LASER TANK table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-08-01",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_laser_1",
        "tank_id": "laser",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "300",
        "attack_value_source": 300,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "特大",
        "terrain_destruction_qualitative": "very_large",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "LASER TANK table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_W_laser_2",
        "tank_id": "laser",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "270",
        "attack_value_source": 270,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": 3,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "小",
        "terrain_destruction_qualitative": "small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "LASER TANK table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_T_ion_attacker",
        "tank_id": "ion_attacker",
        "name_ko": "이온어태커",
        "name_source": "ION ATTACKER",
        "era_ko": "미래",
        "hp": 930,
        "base_delay": 550,
        "movement": 50,
        "aim_min_deg": 20,
        "aim_max_deg": 55,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "雷",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_ion_attacker_1",
          "JP2003_W_ion_attacker_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "ION ATTACKER table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-08-01",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_ion_attacker_1",
        "tank_id": "ion_attacker",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "250",
        "attack_value_source": 250,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "中",
        "terrain_destruction_qualitative": "medium",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "ION ATTACKER table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_W_ion_attacker_2",
        "tank_id": "ion_attacker",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "350",
        "attack_value_source": 350,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "大",
        "terrain_destruction_qualitative": "large",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "ION ATTACKER table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_T_secwind",
        "tank_id": "secwind",
        "name_ko": "세크윈드",
        "name_source": "SECWIND",
        "era_ko": "미래",
        "hp": 950,
        "base_delay": 530,
        "movement": 58,
        "aim_min_deg": 0,
        "aim_max_deg": 40,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "雷",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_secwind_1",
          "JP2003_W_secwind_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "SECWIND table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-08-01",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_secwind_1",
        "tank_id": "secwind",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "400",
        "attack_value_source": 400,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "大",
        "terrain_destruction_qualitative": "large",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "SECWIND table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_W_secwind_2",
        "tank_id": "secwind",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "550",
        "attack_value_source": 550,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": 2,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "小",
        "terrain_destruction_qualitative": "small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "SECWIND table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_T_poseidon",
        "tank_id": "poseidon",
        "name_ko": "포세이돈",
        "name_source": "POSEIDON",
        "era_ko": "미래",
        "hp": 900,
        "base_delay": 550,
        "movement": 36.5,
        "aim_min_deg": 15,
        "aim_max_deg": 50,
        "aim_span_reported_deg": null,
        "armor": null,
        "resistance_source": "毒",
        "resistance_multiplier": null,
        "weapon_record_ids": [
          "JP2003_W_poseidon_1",
          "JP2003_W_poseidon_2"
        ],
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "POSEIDON table",
        "base_delay_crosscheck_source_id": "F2JP12",
        "field_units": {
          "movement": "unspecified_source_unit",
          "base_delay": "unspecified_delay_unit",
          "armor": null,
          "aim": "degrees"
        },
        "notes": [
          "armor는 이 표에 없으므로 null이다.",
          "내성 표기는 피해 면역 또는 배율의 확정값이 아니다."
        ],
        "movement_source_header": "移動力",
        "movement_quantity_kind": "unresolved_source_stat",
        "movement_unit_conversion_to_other_profile": null,
        "source_publication_date": "2003-08-01",
        "base_delay_crosscheck_publication_date": "2003-08-22"
      },
      {
        "record_id": "JP2003_W_poseidon_1",
        "tank_id": "poseidon",
        "slot": 1,
        "weapon_name_source": null,
        "attack_notation_source": "350",
        "attack_value_source": 350,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "中",
        "terrain_destruction_qualitative": "medium",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "POSEIDON table weapon 1",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器1（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "record_id": "JP2003_W_poseidon_2",
        "tank_id": "poseidon",
        "slot": 2,
        "weapon_name_source": null,
        "attack_notation_source": "280",
        "attack_value_source": 280,
        "attack_factor_source": null,
        "attack_multiplier_source": null,
        "attack_subtotal_source": null,
        "attack_stage_values_source": null,
        "attack_aggregation": "unspecified_in_table",
        "attack_total_derived": null,
        "projectile_count_reported": null,
        "explosion_range_notation_source": null,
        "explosion_range_value_source": null,
        "explosion_range_stage_values_source": null,
        "terrain_destruction_source": "小",
        "terrain_destruction_qualitative": "small",
        "profile_id": "JP_2003_literature",
        "source_id": "F2JP06",
        "source_url": "https://www.4gamer.net/specials/fortress2/06.html",
        "evidence": "contemporary_secondary_guide",
        "version": "2003 service-period literature; executable build unknown",
        "date": "2026-11-17",
        "date_kind": "retrieval_date",
        "validation_state": "literature_transcription_not_runtime_verified",
        "runtime_approved": false,
        "source_locator": "POSEIDON table weapon 2",
        "notes": [
          "표의 공격 수치와 실제 대상 HP 감소량의 관계는 검증하지 않았다.",
          "지형 파괴는 정성 등급이며 수치 반경으로 환산하지 않았다.",
          "표의 공격 수치에 별도 기록된 탄수를 곱하거나 나눠 총합 또는1발당 수치를 만들지 않는다."
        ],
        "source_value_header": "武器2（地形破壊）",
        "attack_per_projectile_confirmed": null,
        "attack_volley_total_confirmed": null,
        "source_publication_date": "2003-08-01"
      },
      {
        "id": "f3_catapult_intro_20260921",
        "source_id": "F3_PATCH_20260921",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/1173",
        "date": "2026-09-21",
        "effective_version": "2026-09-21 patch announcement including same-day amendments; subsequent patches not resolved",
        "mode": "not_specified",
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_snapshot_reference_star_level_and_units_unspecified",
        "character_id": "catapult",
        "name_ko": "캐터펄트",
        "rarity": "legendary",
        "hp": 1725,
        "move_speed": 1.5,
        "delay": 550,
        "average_ap": 4,
        "ambiguity_ids": [
          "A01",
          "A03"
        ]
      },
      {
        "id": "f3_20260527_mecha_punch_hp",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 1,
        "character_id": "mecha_punch",
        "character_name_ko": "메카펀치",
        "rarity": "legendary",
        "stat": "hp",
        "source_field": "체력",
        "value": 1834,
        "unit": "HP",
        "source_value_text": "1834",
        "source_row_index": 2,
        "source_column_index": 3,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_mecha_punch_move_speed",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 1,
        "character_id": "mecha_punch",
        "character_name_ko": "메카펀치",
        "rarity": "legendary",
        "stat": "move_speed",
        "source_field": "이동속도",
        "value": 1.4,
        "unit": null,
        "source_value_text": "1.4",
        "source_row_index": 2,
        "source_column_index": 4,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_mecha_punch_delay",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 1,
        "character_id": "mecha_punch",
        "character_name_ko": "메카펀치",
        "rarity": "legendary",
        "stat": "delay",
        "source_field": "딜레이",
        "value": 560,
        "unit": null,
        "source_value_text": "560",
        "source_row_index": 2,
        "source_column_index": 5,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_mecha_punch_average_ap_pair1",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 1,
        "character_id": "mecha_punch",
        "character_name_ko": "메카펀치",
        "rarity": "legendary",
        "stat": "average_ap",
        "source_field": "평균AP",
        "value": 4,
        "unit": "AP",
        "source_value_text": "4 / 4.5",
        "source_row_index": 2,
        "source_column_index": 6,
        "pair_position": 1,
        "form": null,
        "source_conflict_ids": [
          "F3_C_MECHA_AP_PAIR"
        ],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_mecha_punch_average_ap_pair2",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 1,
        "character_id": "mecha_punch",
        "character_name_ko": "메카펀치",
        "rarity": "legendary",
        "stat": "average_ap",
        "source_field": "평균AP",
        "value": 4.5,
        "unit": "AP",
        "source_value_text": "4 / 4.5",
        "source_row_index": 2,
        "source_column_index": 6,
        "pair_position": 2,
        "form": null,
        "source_conflict_ids": [
          "F3_C_MECHA_AP_PAIR"
        ],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_evil_bella_hp",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 4,
        "character_id": "evil_bella",
        "character_name_ko": "이블벨라",
        "rarity": "legendary",
        "stat": "hp",
        "source_field": "체력",
        "value": 1528,
        "unit": "HP",
        "source_value_text": "1528",
        "source_row_index": 2,
        "source_column_index": 3,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_evil_bella_move_speed",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 4,
        "character_id": "evil_bella",
        "character_name_ko": "이블벨라",
        "rarity": "legendary",
        "stat": "move_speed",
        "source_field": "이동속도",
        "value": 1.4,
        "unit": null,
        "source_value_text": "1.4",
        "source_row_index": 2,
        "source_column_index": 4,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_evil_bella_delay",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 4,
        "character_id": "evil_bella",
        "character_name_ko": "이블벨라",
        "rarity": "legendary",
        "stat": "delay",
        "source_field": "딜레이",
        "value": 575,
        "unit": null,
        "source_value_text": "575",
        "source_row_index": 2,
        "source_column_index": 5,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_evil_bella_average_ap",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 4,
        "character_id": "evil_bella",
        "character_name_ko": "이블벨라",
        "rarity": "legendary",
        "stat": "average_ap",
        "source_field": "평균AP",
        "value": 3.5,
        "unit": "AP",
        "source_value_text": "3.5",
        "source_row_index": 2,
        "source_column_index": 6,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260807_evil_bella_blood_orb_turn_s0_l1_projectile_attack",
        "source_id": "F3_PATCH_20260807",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771",
        "source_api_url": "https://3blue.squadground.com/api/posts/771",
        "date": "2026-08-07",
        "effective_version": "2026-08-07 patch; title notes 15:30 amendment",
        "retrieved_at": "2026-11-17T14:47:43.272Z",
        "mode": [
          "2BLUE4K",
          "3BLUE"
        ],
        "star": 0,
        "level": 1,
        "interpretation_status": "official_numeric_explicit_scope",
        "source_table_index": 20,
        "character_id": "evil_bella",
        "character_name_ko": "이블벨라",
        "skill_id": "blood_orb",
        "skill_name_ko": "피의구슬",
        "skill_slot": "normal",
        "stat": "projectile_attack",
        "source_field": "탄 공격력",
        "before": 488,
        "after": 580,
        "unit": "attack_value",
        "change_kind": "modified",
        "source_row_index": 2,
        "source_column_index": 2,
        "source_value_text": "488 → 580",
        "mode_mapping": "explicit_table_heading",
        "source_context_mode": null
      },
      {
        "id": "f3_20260807_evil_bella_venom_bats_turn_s0_l1_projectile_attack",
        "source_id": "F3_PATCH_20260807",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771",
        "source_api_url": "https://3blue.squadground.com/api/posts/771",
        "date": "2026-08-07",
        "effective_version": "2026-08-07 patch; title notes 15:30 amendment",
        "retrieved_at": "2026-11-17T14:47:43.272Z",
        "mode": [
          "2BLUE4K",
          "3BLUE"
        ],
        "star": 0,
        "level": 1,
        "interpretation_status": "official_numeric_explicit_scope",
        "source_table_index": 25,
        "character_id": "evil_bella",
        "character_name_ko": "이블벨라",
        "skill_id": "venom_bats",
        "skill_name_ko": "맹독박쥐",
        "skill_slot": "special",
        "stat": "projectile_attack",
        "source_field": "탄 공격력",
        "before": 84,
        "after": 73,
        "unit": "attack_value_per_projectile",
        "change_kind": "modified",
        "source_row_index": 2,
        "source_column_index": 2,
        "source_value_text": "84 → 73",
        "mode_mapping": "explicit_table_heading",
        "source_context_mode": null,
        "projectile_count_context": {
          "before": 3,
          "after": 6,
          "source_table_index": 22
        },
        "total_damage_not_calculated": true
      },
      {
        "id": "f3_20260527_baseball_boy_hp",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 6,
        "character_id": "baseball_boy",
        "character_name_ko": "야구소년",
        "rarity": "legendary",
        "stat": "hp",
        "source_field": "체력",
        "value": 1528,
        "unit": "HP",
        "source_value_text": "1528",
        "source_row_index": 2,
        "source_column_index": 3,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_baseball_boy_move_speed",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 6,
        "character_id": "baseball_boy",
        "character_name_ko": "야구소년",
        "rarity": "legendary",
        "stat": "move_speed",
        "source_field": "이동속도",
        "value": 1.4,
        "unit": null,
        "source_value_text": "1.4",
        "source_row_index": 2,
        "source_column_index": 4,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_baseball_boy_delay",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 6,
        "character_id": "baseball_boy",
        "character_name_ko": "야구소년",
        "rarity": "legendary",
        "stat": "delay",
        "source_field": "딜레이",
        "value": 555,
        "unit": null,
        "source_value_text": "555",
        "source_row_index": 2,
        "source_column_index": 5,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260527_baseball_boy_average_ap",
        "source_id": "F3_PATCH_20260527",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "date": "2026-05-27",
        "effective_version": "2026-05-27 patch; page includes amendments through 2026-06-05; only launch character stats extracted here",
        "retrieved_at": "2026-11-17T14:48:39.859Z",
        "mode": null,
        "star": null,
        "level": null,
        "interpretation_status": "official_numeric_reference_scope_unspecified",
        "source_table_index": 6,
        "character_id": "baseball_boy",
        "character_name_ko": "야구소년",
        "rarity": "legendary",
        "stat": "average_ap",
        "source_field": "평균AP",
        "value": 3.5,
        "unit": "AP",
        "source_value_text": "3.5",
        "source_row_index": 2,
        "source_column_index": 6,
        "pair_position": null,
        "form": null,
        "source_conflict_ids": [],
        "scope_note": "Source table does not specify reference star, level, or mode."
      },
      {
        "id": "f3_20260807_baseball_boy_homing_bounce_ball_turn_s0_l1_projectile_attack",
        "source_id": "F3_PATCH_20260807",
        "sourceUrl": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/771",
        "source_api_url": "https://3blue.squadground.com/api/posts/771",
        "date": "2026-08-07",
        "effective_version": "2026-08-07 patch; title notes 15:30 amendment",
        "retrieved_at": "2026-11-17T14:47:43.272Z",
        "mode": [
          "2BLUE4K",
          "3BLUE"
        ],
        "star": 0,
        "level": 1,
        "interpretation_status": "official_numeric_explicit_scope",
        "source_table_index": 40,
        "character_id": "baseball_boy",
        "character_name_ko": "야구소년",
        "skill_id": "homing_bounce_ball",
        "skill_name_ko": "통통유도볼",
        "skill_slot": "ultimate",
        "stat": "projectile_attack",
        "source_field": "탄 공격력",
        "before": 363,
        "after": 304,
        "unit": "attack_value",
        "change_kind": "modified",
        "source_row_index": 2,
        "source_column_index": 2,
        "source_value_text": "363 → 304",
        "mode_mapping": "explicit_table_heading",
        "source_context_mode": null
      },
      {
        "source_id": "R2_F3_PATCH_20260527_ITEMS",
        "source_url": "https://3blue.squadground.com/projects/fortress3blue/community/news/updates/31",
        "source_api_url": "https://3blue.squadground.com/api/posts/31",
        "source_date": "2026-05-27",
        "runtime_verified": false,
        "evidence_status": "official_patch_transcription",
        "profile_id": "F3_KR_20260527_AMENDED_20260605",
        "source_table_index_base": 0,
        "source_row_index_base": 0,
        "record_id": "f3_r2_item_healing_potion_rare_heal_percent_s0_l1",
        "item_id": "healing_potion",
        "item_name_source": "회복약(액티브)",
        "rarity": "rare",
        "stat": "heal_percent",
        "stat_label_source": "체력회복",
        "star": 0,
        "level": 1,
        "mode": null,
        "before": 10,
        "after": 5,
        "before_raw": "10.0%",
        "after_raw": "5.0%",
        "before_numeric_candidate": null,
        "after_numeric_candidate": null,
        "unit": "percent",
        "before_interval_seconds": null,
        "after_interval_seconds": null,
        "percentage_base": null,
        "section_added_date": "2026-06-05",
        "effective_date": null,
        "effective_version": "5/27 공지의 6/5 추가 아이템 밸런스 표; 실제 적용일 별도 미명시",
        "source_table_index": 18,
        "source_row_index": 3,
        "interpretation_status": "source_numeric",
        "notes": null
      },
      {
        "record_id": "f2jp2003_item_energy_small",
        "original_numeric_id": null,
        "name_source": "ADDTIONAL ENERGY 1",
        "name_ko_translation": "소형 회복 캡슐",
        "ko_name_is_official": false,
        "source_category": "recovery",
        "price": 2500,
        "price_currency_name": null,
        "effect_trigger": "use",
        "consumes_turn": false,
        "duration_turns": null,
        "duration_turn_counter_owner": null,
        "effects": {
          "heal_percent": 20,
          "healing_base": "max_hp_reported_by_S_JP_14"
        },
        "region": "JP",
        "version_scope": "Bandai GV 일본 서비스 2003년 자료",
        "source_url": "https://www.4gamer.net/specials/fortress2/07.html",
        "source_date": "2003-08-08",
        "source_id": "S_JP_07",
        "retrieved_date": "2026-11-17",
        "evidence_status": "source_reported_not_binary_extracted",
        "target_scope": "self",
        "support_source_ids": [
          "S_JP_14"
        ]
      },
      {
        "record_id": "f2jp2003_item_shield",
        "original_numeric_id": null,
        "name_source": "SHIELD",
        "name_ko_translation": "방어막 캡슐",
        "ko_name_is_official": false,
        "source_category": "recovery",
        "price": 15000,
        "price_currency_name": null,
        "effect_trigger": "use",
        "consumes_turn": false,
        "duration_turns": null,
        "duration_turn_counter_owner": null,
        "effects": {
          "blocked_attack_count": 1
        },
        "region": "JP",
        "version_scope": "Bandai GV 일본 서비스 2003년 자료",
        "source_url": "https://www.4gamer.net/specials/fortress2/07.html",
        "source_date": "2003-08-08",
        "source_id": "S_JP_07",
        "retrieved_date": "2026-11-17",
        "evidence_status": "source_reported_not_binary_extracted",
        "target_scope": "self",
        "support_source_ids": [
          "S_JP_14"
        ]
      },
      {
        "record_id": "f2jp2003_item_double_fire",
        "original_numeric_id": null,
        "name_source": "DOUBLE FIRE",
        "name_ko_translation": "더블 공격 캡슐",
        "ko_name_is_official": false,
        "source_category": "attack",
        "price": 20000,
        "price_currency_name": null,
        "effect_trigger": null,
        "consumes_turn": null,
        "duration_turns": null,
        "duration_turn_counter_owner": null,
        "effects": {
          "shot_count": 2,
          "same_angle": true,
          "same_power": true,
          "can_carry_through_pass_to_next_turn": true
        },
        "region": "JP",
        "version_scope": "Bandai GV 일본 서비스 2003년 자료",
        "source_url": "https://www.4gamer.net/specials/fortress2/09.html",
        "source_date": "2003-08-08",
        "source_id": "S_JP_09",
        "retrieved_date": "2026-11-17",
        "evidence_status": "source_reported_not_binary_extracted",
        "allowed_in_power_battle": true
      },
      {
        "record_id": "f2jp2003_item_teleport",
        "original_numeric_id": null,
        "name_source": "TELEPORT",
        "name_ko_translation": "텔레포트 미사일",
        "ko_name_is_official": false,
        "source_category": "attack",
        "price": 20000,
        "price_currency_name": null,
        "effect_trigger": "impact",
        "consumes_turn": null,
        "duration_turns": null,
        "duration_turn_counter_owner": null,
        "effects": {
          "teleport_target": "user_to_impact_point"
        },
        "region": "JP",
        "version_scope": "Bandai GV 일본 서비스 2003년 자료",
        "source_url": "https://www.4gamer.net/specials/fortress2/09.html",
        "source_date": "2003-08-08",
        "source_id": "S_JP_09",
        "retrieved_date": "2026-11-17",
        "evidence_status": "source_reported_not_binary_extracted",
        "target_scope": "self"
      }
    ],
    "preservedSnapshotCount": 61,
    "behaviorSchema": {
      "version": 1,
      "roleValues": [
        "attack",
        "support"
      ],
      "deliveryValues": [
        "projectile",
        "self"
      ],
      "trajectoryValues": [
        "ballistic",
        "linear"
      ],
      "status": "simulation_assumption",
      "note": "실행 behavior와 원문 sourceSnapshots를 분리한다. shots는 기본 1회 공격의 발사체 입력이며 지원 self 행동의 실제 발사체 수는 0이다. 실제 반복·탄수·해금은 엔진의 action preview에서 계산한다.",
      "passiveEffectIds": [
        "low_hp_attack_boost",
        "mine_trigger_exemption"
      ]
    }
  },
  "aiming": {
    "schemaVersion": 1,
    "defaultAngleProfile": "jp2003",
    "powerDefaults": {
      "min": 0,
      "max": 100,
      "step": 1,
      "chargeRate": 72,
      "cycle": "ping_pong",
      "status": "simulation_assumption"
    },
    "angleProfiles": {
      "jp2003": {
        "id": "jp2003",
        "label": "일본 2003 문헌",
        "status": "source_reported",
        "bounds": {
          "catapult": {
            "min": 0,
            "max": 90,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html"
            ],
            "recordId": "JP2003_T_catapult",
            "reportedSpan": null,
            "arithmeticSpan": 90,
            "spanConsistent": null,
            "conflictIds": []
          },
          "crossbow": {
            "min": 15,
            "max": 80,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html"
            ],
            "recordId": "JP2003_T_crossbow",
            "reportedSpan": null,
            "arithmeticSpan": 65,
            "spanConsistent": null,
            "conflictIds": []
          },
          "cannon": {
            "min": 22,
            "max": 45,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html"
            ],
            "recordId": "JP2003_T_cannon",
            "reportedSpan": null,
            "arithmeticSpan": 23,
            "spanConsistent": null,
            "conflictIds": []
          },
          "carrot": {
            "min": 0,
            "max": 45,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html"
            ],
            "recordId": "JP2003_T_carrot",
            "reportedSpan": null,
            "arithmeticSpan": 45,
            "spanConsistent": null,
            "conflictIds": []
          },
          "duke": {
            "min": 0,
            "max": 40,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html"
            ],
            "recordId": "JP2003_T_duke",
            "reportedSpan": null,
            "arithmeticSpan": 40,
            "spanConsistent": null,
            "conflictIds": []
          },
          "mine_lander": {
            "min": 5,
            "max": 40,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/05.html"
            ],
            "recordId": "JP2003_T_mine_lander",
            "reportedSpan": null,
            "arithmeticSpan": 35,
            "spanConsistent": null,
            "conflictIds": []
          },
          "missile": {
            "min": 20,
            "max": 40,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html"
            ],
            "recordId": "JP2003_T_missile",
            "reportedSpan": null,
            "arithmeticSpan": 20,
            "spanConsistent": null,
            "conflictIds": []
          },
          "multi_missile": {
            "min": 30,
            "max": 45,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html"
            ],
            "recordId": "JP2003_T_multi_missile",
            "reportedSpan": null,
            "arithmeticSpan": 15,
            "spanConsistent": null,
            "conflictIds": []
          },
          "super_tank": {
            "min": 20,
            "max": 45,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html"
            ],
            "recordId": "JP2003_T_super_tank",
            "reportedSpan": null,
            "arithmeticSpan": 25,
            "spanConsistent": null,
            "conflictIds": []
          },
          "laser": {
            "min": 0,
            "max": 33,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html"
            ],
            "recordId": "JP2003_T_laser",
            "reportedSpan": null,
            "arithmeticSpan": 33,
            "spanConsistent": null,
            "conflictIds": []
          },
          "ion_attacker": {
            "min": 20,
            "max": 55,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html"
            ],
            "recordId": "JP2003_T_ion_attacker",
            "reportedSpan": null,
            "arithmeticSpan": 35,
            "spanConsistent": null,
            "conflictIds": []
          },
          "secwind": {
            "min": 0,
            "max": 40,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html"
            ],
            "recordId": "JP2003_T_secwind",
            "reportedSpan": null,
            "arithmeticSpan": 40,
            "spanConsistent": null,
            "conflictIds": []
          },
          "poseidon": {
            "min": 15,
            "max": 50,
            "status": "source_reported",
            "sourceRefs": [
              "https://www.4gamer.net/specials/fortress2/06.html"
            ],
            "recordId": "JP2003_T_poseidon",
            "reportedSpan": null,
            "arithmeticSpan": 35,
            "spanConsistent": null,
            "conflictIds": []
          }
        }
      },
      "kr_reference": {
        "id": "kr_reference",
        "label": "한국판 참고 · 빌드 미확정",
        "status": "community_claim_not_runtime_verified",
        "bounds": {
          "catapult": {
            "min": 0,
            "max": 90,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EC%BA%90%ED%84%B0%ED%8E%84%ED%8A%B8(%ED%8F%AC%ED%8A%B8%EB%A6%AC%EC%8A%A4%20%EC%8B%9C%EB%A6%AC%EC%A6%88)"
            ],
            "recordId": "KR_UNSPEC_T_catapult",
            "reportedSpan": 90,
            "arithmeticSpan": 90,
            "spanConsistent": true,
            "conflictIds": []
          },
          "crossbow": {
            "min": 15,
            "max": 80,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%ED%81%AC%EB%A1%9C%EC%8A%A4%EB%B3%B4%EC%9A%B0(%ED%8F%AC%ED%8A%B8%EB%A6%AC%EC%8A%A4%20%EC%8B%9C%EB%A6%AC%EC%A6%88)"
            ],
            "recordId": "KR_UNSPEC_T_crossbow",
            "reportedSpan": 65,
            "arithmeticSpan": 65,
            "spanConsistent": true,
            "conflictIds": []
          },
          "cannon": {
            "min": 25,
            "max": 45,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EC%BA%90%EB%85%BC(%ED%8F%AC%ED%8A%B8%EB%A6%AC%EC%8A%A4%20%EC%8B%9C%EB%A6%AC%EC%A6%88)"
            ],
            "recordId": "KR_UNSPEC_T_cannon",
            "reportedSpan": 25,
            "arithmeticSpan": 20,
            "spanConsistent": false,
            "conflictIds": [
              "KR_CANNON_ANGLE_SPAN"
            ]
          },
          "carrot": {
            "min": 0,
            "max": 40,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EC%BA%90%EB%A1%AF%20%ED%83%B1%ED%81%AC"
            ],
            "recordId": "KR_UNSPEC_T_carrot",
            "reportedSpan": 40,
            "arithmeticSpan": 40,
            "spanConsistent": true,
            "conflictIds": []
          },
          "duke": {
            "min": 0,
            "max": 40,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EB%93%80%ED%81%AC%20%ED%83%B1%ED%81%AC"
            ],
            "recordId": "KR_UNSPEC_T_duke",
            "reportedSpan": 40,
            "arithmeticSpan": 40,
            "spanConsistent": true,
            "conflictIds": []
          },
          "mine_lander": {
            "min": 5,
            "max": 40,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EB%A7%88%EC%9D%B8%EB%9E%9C%EB%8D%94"
            ],
            "recordId": "KR_UNSPEC_T_mine_lander",
            "reportedSpan": 35,
            "arithmeticSpan": 35,
            "spanConsistent": true,
            "conflictIds": []
          },
          "missile": {
            "min": 20,
            "max": 45,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EB%AF%B8%EC%82%AC%EC%9D%BC(%ED%8F%AC%ED%8A%B8%EB%A6%AC%EC%8A%A4%20%EC%8B%9C%EB%A6%AC%EC%A6%88)"
            ],
            "recordId": "KR_UNSPEC_T_missile",
            "reportedSpan": 25,
            "arithmeticSpan": 25,
            "spanConsistent": true,
            "conflictIds": []
          },
          "multi_missile": {
            "min": 25,
            "max": 50,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EB%A9%80%ED%8B%B0%20%EB%AF%B8%EC%82%AC%EC%9D%BC"
            ],
            "recordId": "KR_UNSPEC_T_multi_missile",
            "reportedSpan": 25,
            "arithmeticSpan": 25,
            "spanConsistent": true,
            "conflictIds": []
          },
          "super_tank": {
            "min": 20,
            "max": 45,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EC%8A%88%ED%8D%BC%ED%83%B1%ED%81%AC"
            ],
            "recordId": "KR_UNSPEC_T_super_tank",
            "reportedSpan": 25,
            "arithmeticSpan": 25,
            "spanConsistent": true,
            "conflictIds": []
          },
          "laser": {
            "min": 5,
            "max": 36,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EB%A0%88%EC%9D%B4%EC%A0%80%20%ED%83%B1%ED%81%AC"
            ],
            "recordId": "KR_UNSPEC_T_laser",
            "reportedSpan": 31,
            "arithmeticSpan": 31,
            "spanConsistent": true,
            "conflictIds": []
          },
          "ion_attacker": {
            "min": 20,
            "max": 55,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EC%9D%B4%EC%98%A8%20%EC%96%B4%ED%83%9C%EC%BB%A4"
            ],
            "recordId": "KR_UNSPEC_T_ion_attacker",
            "reportedSpan": 35,
            "arithmeticSpan": 35,
            "spanConsistent": true,
            "conflictIds": []
          },
          "secwind": {
            "min": 0,
            "max": 40,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%EC%84%B8%ED%81%AC%EC%9C%88%EB%93%9C"
            ],
            "recordId": "KR_UNSPEC_T_secwind",
            "reportedSpan": 40,
            "arithmeticSpan": 40,
            "spanConsistent": true,
            "conflictIds": []
          },
          "poseidon": {
            "min": 15,
            "max": 50,
            "status": "community_claim_not_runtime_verified",
            "sourceRefs": [
              "https://seore.org/raw/%ED%8F%AC%EC%84%B8%EC%9D%B4%EB%8F%88(%ED%8F%AC%ED%8A%B8%EB%A6%AC%EC%8A%A4%20%EC%8B%9C%EB%A6%AC%EC%A6%88)"
            ],
            "recordId": "KR_UNSPEC_T_poseidon",
            "reportedSpan": 35,
            "arithmeticSpan": 35,
            "spanConsistent": true,
            "conflictIds": []
          }
        }
      }
    },
    "sourcePower": {
      "gaugeMin": null,
      "gaugeMax": null,
      "chargeRate": null,
      "fullChargeSeconds": null,
      "overflowBehavior": null,
      "velocityCurve": null,
      "gravity": null,
      "windAcceleration": null,
      "projectileMass": null
    },
    "runtimeFallback": {
      "name": "prototype_ballistic_v1",
      "minSpeed": 90,
      "maxSpeed": 1050,
      "gravity": 320,
      "wind": 9,
      "power": {
        "min": 0,
        "max": 100,
        "step": 1
      },
      "chargeRate": 72,
      "chargeRateUnit": "gauge_points_per_second",
      "cycle": "ping_pong",
      "status": "simulation_assumption",
      "velocityCurve": {
        "kind": "linear",
        "formula": "minSpeed + (maxSpeed - minSpeed) * power / 100"
      },
      "scope": "Shared runtime fallback; not character-specific original constants."
    },
    "blue3SourceBounds": {
      "catapult": {
        "min": null,
        "max": null,
        "status": "not_recovered",
        "sourceRefs": [],
        "examinedSourceRefs": [
          "https://3blue.squadground.com/api/characters?projectId=1",
          "https://sites.google.com/view/fortress3blueguide/3blue",
          "https://sites.google.com/view/fortress3blueguide/%EC%B4%88%EB%B3%B4%EC%9E%90-%EA%B8%B0%EB%B3%B8-%EA%B0%80%EC%9D%B4%EB%93%9C"
        ]
      },
      "mecha_punch": {
        "min": null,
        "max": null,
        "status": "not_recovered",
        "sourceRefs": [],
        "examinedSourceRefs": [
          "https://3blue.squadground.com/api/characters?projectId=1",
          "https://sites.google.com/view/fortress3blueguide/3blue",
          "https://sites.google.com/view/fortress3blueguide/%EC%B4%88%EB%B3%B4%EC%9E%90-%EA%B8%B0%EB%B3%B8-%EA%B0%80%EC%9D%B4%EB%93%9C"
        ]
      },
      "evil_bella": {
        "min": null,
        "max": null,
        "status": "not_recovered",
        "sourceRefs": [],
        "examinedSourceRefs": [
          "https://3blue.squadground.com/api/characters?projectId=1",
          "https://sites.google.com/view/fortress3blueguide/3blue",
          "https://sites.google.com/view/fortress3blueguide/%EC%B4%88%EB%B3%B4%EC%9E%90-%EA%B8%B0%EB%B3%B8-%EA%B0%80%EC%9D%B4%EB%93%9C"
        ]
      },
      "baseball_boy": {
        "min": null,
        "max": null,
        "status": "not_recovered",
        "sourceRefs": [],
        "examinedSourceRefs": [
          "https://3blue.squadground.com/api/characters?projectId=1",
          "https://sites.google.com/view/fortress3blueguide/3blue",
          "https://sites.google.com/view/fortress3blueguide/%EC%B4%88%EB%B3%B4%EC%9E%90-%EA%B8%B0%EB%B3%B8-%EA%B0%80%EC%9D%B4%EB%93%9C"
        ]
      }
    },
    "blue3RuntimeFallbacks": {
      "catapult": {
        "min": 8,
        "max": 82,
        "status": "simulation_assumption",
        "weaponOverrides": {}
      },
      "mecha_punch": {
        "min": 5,
        "max": 75,
        "status": "simulation_assumption",
        "weaponOverrides": {
          "pulse_laser": {
            "min": -35,
            "max": 75,
            "trajectory": "linear",
            "status": "simulation_assumption"
          }
        }
      },
      "evil_bella": {
        "min": 10,
        "max": 80,
        "status": "simulation_assumption",
        "weaponOverrides": {}
      },
      "baseball_boy": {
        "min": 12,
        "max": 78,
        "status": "simulation_assumption",
        "weaponOverrides": {}
      }
    },
    "recoveryDataset": "datasets/Fortress_AnglePower_Recovery.json"
  }
};
  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { freeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }
  freeze(data.provenance.sourceSnapshots);
  root.FortData = data;
})(typeof window !== "undefined" ? window : globalThis);
