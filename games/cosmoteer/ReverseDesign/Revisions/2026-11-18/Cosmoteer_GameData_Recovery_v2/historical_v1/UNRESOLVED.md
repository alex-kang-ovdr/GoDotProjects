# 미확정 항목과 대조 이력

여기에는 해결되지 않은 충돌, 구형 원문과의 차이, 자료 부족이 포함된다. `adopted_value`가 null인지와 `resolution`을 확인한다.

## SUP-CONFLICT-01

- 레코드: `small_reactor_core`
- 필드: `battery_charge_s`
- 처리: `unresolved`
- 사유: 소형 원자로 인포박스는 충전 0.5초, Batteries 표는 0초로 충돌. 원본 .rules 확인 전 null.

```json
{
  "id": "SUP-CONFLICT-01",
  "record_id": "small_reactor_core",
  "field": "battery_charge_s",
  "observations": [
    {
      "value": 0.5,
      "source_id": "SUP-REACTOR-S"
    },
    {
      "value": 0,
      "source_id": "SUP-BATTERIES"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "소형 원자로 인포박스는 충전 0.5초, Batteries 표는 0초로 충돌. 원본 .rules 확인 전 null."
}
```

## SUP-CONFLICT-02

- 레코드: `medium_hyperdrive`
- 필드: `blueprint_cost_credits`
- 처리: `unresolved`
- 사유: 개별 부품 표와 Blueprints 총표의 해금 비용이 다름. 동일 버전임을 확인할 수 없어 null.

```json
{
  "id": "SUP-CONFLICT-02",
  "record_id": "medium_hyperdrive",
  "field": "blueprint_cost_credits",
  "observations": [
    {
      "value": 8000,
      "source_id": "SUP-HYPERDRIVES"
    },
    {
      "value": 10000,
      "source_id": "SUP-BLUEPRINTS"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "개별 부품 표와 Blueprints 총표의 해금 비용이 다름. 동일 버전임을 확인할 수 없어 null."
}
```

## SUP-CONFLICT-03

- 레코드: `large_hyperdrive`
- 필드: `blueprint_cost_credits`
- 처리: `unresolved`
- 사유: 개별 부품 표와 Blueprints 총표의 해금 비용이 다름. 동일 버전임을 확인할 수 없어 null.

```json
{
  "id": "SUP-CONFLICT-03",
  "record_id": "large_hyperdrive",
  "field": "blueprint_cost_credits",
  "observations": [
    {
      "value": 16000,
      "source_id": "SUP-HYPERDRIVES"
    },
    {
      "value": 20000,
      "source_id": "SUP-BLUEPRINTS"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "개별 부품 표와 Blueprints 총표의 해금 비용이 다름. 동일 버전임을 확인할 수 없어 null."
}
```

## SUP-CONFLICT-04

- 레코드: `sensor_array`
- 필드: `blueprint_cost_credits`
- 처리: `unresolved`
- 사유: Sensor Array 해금 비용 9,000/10,000 충돌. 원본 .rules 또는 현행 툴팁 확인 필요.

```json
{
  "id": "SUP-CONFLICT-04",
  "record_id": "sensor_array",
  "field": "blueprint_cost_credits",
  "observations": [
    {
      "value": 9000,
      "source_id": "SUP-SENSOR"
    },
    {
      "value": 10000,
      "source_id": "SUP-BLUEPRINTS"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "Sensor Array 해금 비용 9,000/10,000 충돌. 원본 .rules 또는 현행 툴팁 확인 필요."
}
```

## SUP-CONFLICT-05

- 레코드: `manipulator_beam_emitter`
- 필드: `range_m`
- 처리: `resolved_by_wiki_history`
- 사유: 본문의 구형 200m와 표·0.27.1 이력의 450m가 충돌. 명시적 변경 이력에 따라 450m 채택.

```json
{
  "id": "SUP-CONFLICT-05",
  "record_id": "manipulator_beam_emitter",
  "field": "range_m",
  "observations": [
    {
      "value": 450,
      "source_id": "SUP-MANIPULATOR",
      "location": "infobox / history 0.27.1"
    },
    {
      "value": 200,
      "source_id": "SUP-MANIPULATOR",
      "location": "outdated body"
    }
  ],
  "resolution": "resolved_by_wiki_history",
  "adopted_value": 450,
  "reason": "본문의 구형 200m와 표·0.27.1 이력의 450m가 충돌. 명시적 변경 이력에 따라 450m 채택."
}
```

## SUP-CONFLICT-06

- 레코드: `mining_laser`
- 필드: `damage_per_s`
- 처리: `resolved_by_wiki_history`
- 사유: 무기 표 1,000/s와 하위 빔 표 1,200/s 충돌. 0.27.1 이력이 적 함선 피해를 1,000/s로 명시하므로 채택.

```json
{
  "id": "SUP-CONFLICT-06",
  "record_id": "mining_laser",
  "field": "damage_per_s",
  "observations": [
    {
      "value": 1000,
      "source_id": "SUP-MINING",
      "location": "infobox / history 0.27.1"
    },
    {
      "value": 1200,
      "source_id": "SUP-MINING",
      "location": "Double Mining Beams box"
    }
  ],
  "resolution": "resolved_by_wiki_history",
  "adopted_value": 1000,
  "reason": "무기 표 1,000/s와 하위 빔 표 1,200/s 충돌. 0.27.1 이력이 적 함선 피해를 1,000/s로 명시하므로 채택."
}
```

## SUP-CONFLICT-07

- 레코드: `tractor_beam_emitter`
- 필드: `blueprint_cost_credits`
- 처리: `unresolved`
- 사유: Tractor Beam 해금 비용 9,000/10,000 충돌. 원본 .rules 또는 현행 툴팁 확인 필요.

```json
{
  "id": "SUP-CONFLICT-07",
  "record_id": "tractor_beam_emitter",
  "field": "blueprint_cost_credits",
  "observations": [
    {
      "value": 9000,
      "source_id": "SUP-TRACTOR"
    },
    {
      "value": 10000,
      "source_id": "SUP-BLUEPRINTS"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "Tractor Beam 해금 비용 9,000/10,000 충돌. 원본 .rules 또는 현행 툴팁 확인 필요."
}
```

## SUP-CONFLICT-08

- 레코드: `boost_thruster_overclock`
- 필드: `boost_thrust_kn`
- 처리: `unresolved`
- 사유: 공지의 14kN 표기가 기본 부스트 9,600kN과 단위 규모가 맞지 않음. 14,000kN로 추정 변환하지 않고 null로 보존.

```json
{
  "id": "SUP-CONFLICT-08",
  "record_id": "boost_thruster_overclock",
  "field": "boost_thrust_kn",
  "observations": [
    {
      "value": "14kN",
      "source_id": "SUP-PATCH-0305",
      "location": "24kN->14kN"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "공지의 14kN 표기가 기본 부스트 9,600kN과 단위 규모가 맞지 않음. 14,000kN로 추정 변환하지 않고 null로 보존."
}
```

## ECON-CONFLICT-01

- 레코드: `recipe_steel`
- 필드: `inputs`
- 처리: `unresolved`
- 사유: 강철 자원 인포박스는 철2, 공장과 제작표는 철1. 현행 원본을 대조하지 못해 확정 입력량을 null로 보류.

```json
{
  "id": "ECON-CONFLICT-01",
  "record_id": "recipe_steel",
  "field": "inputs",
  "observations": [
    {
      "value": [
        {
          "resource_id": "iron",
          "quantity": 1
        }
      ],
      "source_id": "ECON-F-STEEL-SMELTER",
      "location": "crafting table / Resource Use"
    },
    {
      "value": [
        {
          "resource_id": "iron",
          "quantity": 2
        }
      ],
      "source_id": "ECON-R-STEEL",
      "location": "resource infobox"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "강철 자원 인포박스는 철2, 공장과 제작표는 철1. 현행 원본을 대조하지 못해 확정 입력량을 null로 보류."
}
```

## ECON-CONFLICT-02

- 레코드: `recipe_tri_steel`
- 필드: `inputs`
- 처리: `unresolved`
- 사유: 트리 스틸 자원 인포박스는 자기 자신을 입력으로, 공장·본문은 트리타늄을 입력으로 표시. 오기 가능성이 있으나 확정하지 않음.

```json
{
  "id": "ECON-CONFLICT-02",
  "record_id": "recipe_tri_steel",
  "field": "inputs",
  "observations": [
    {
      "value": [
        {
          "resource_id": "tritanium",
          "quantity": 1
        }
      ],
      "source_id": "ECON-F-TRI-STEEL-SMELTER",
      "location": "crafting table"
    },
    {
      "value": [
        {
          "resource_id": "tri_steel",
          "quantity": 1
        }
      ],
      "source_id": "ECON-R-TRI-STEEL",
      "location": "resource infobox"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "트리 스틸 자원 인포박스는 자기 자신을 입력으로, 공장·본문은 트리타늄을 입력으로 표시. 오기 가능성이 있으나 확정하지 않음."
}
```

## ECON-CONFLICT-03

- 레코드: `recipe_emp_missile_parts`
- 필드: `inputs`
- 처리: `unresolved`
- 사유: 제작표는 부품1개당 각0.45, 본문 비율은 각0.05. 완성 미사일 기준 혼재 가능성이 있으나 입력을 확정하지 않음.

```json
{
  "id": "ECON-CONFLICT-03",
  "record_id": "recipe_emp_missile_parts",
  "field": "inputs",
  "observations": [
    {
      "value": [
        {
          "resource_id": "iron",
          "quantity": 0.45
        },
        {
          "resource_id": "copper",
          "quantity": 0.45
        }
      ],
      "source_id": "ECON-F-EMP-MISSILE-FACTORY",
      "location": "crafting table per part"
    },
    {
      "value": [
        {
          "resource_id": "iron",
          "quantity": 0.05
        },
        {
          "resource_id": "copper",
          "quantity": 0.05
        }
      ],
      "source_id": "ECON-F-EMP-MISSILE-FACTORY",
      "location": "normalized from body ratio 1:1:20"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "제작표는 부품1개당 각0.45, 본문 비율은 각0.05. 완성 미사일 기준 혼재 가능성이 있으나 입력을 확정하지 않음."
}
```

## ECON-CONFLICT-04

- 레코드: `recipe_mine_parts`
- 필드: `inputs`
- 처리: `unresolved`
- 사유: 기뢰 공장 제작표와 인포박스 입력량이 두 배 차이. 완성 기뢰/부품 단위를 단정하지 않음.

```json
{
  "id": "ECON-CONFLICT-04",
  "record_id": "recipe_mine_parts",
  "field": "inputs",
  "observations": [
    {
      "value": [
        {
          "resource_id": "iron",
          "quantity": 0.1
        },
        {
          "resource_id": "ammo",
          "quantity": 4
        }
      ],
      "source_id": "ECON-F-MINE-FACTORY",
      "location": "crafting table"
    },
    {
      "value": [
        {
          "resource_id": "iron",
          "quantity": 0.2
        },
        {
          "resource_id": "ammo",
          "quantity": 8
        }
      ],
      "source_id": "ECON-F-MINE-FACTORY",
      "location": "infobox Resource Use"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "기뢰 공장 제작표와 인포박스 입력량이 두 배 차이. 완성 기뢰/부품 단위를 단정하지 않음."
}
```

## ECON-CONFLICT-05

- 레코드: `uranium_enricher`
- 필드: `blueprint_cost_credits`
- 처리: `unresolved`
- 사유: 우라늄 농축기 해금비가 개별 페이지와 전체 청사진표에서 상이함.

```json
{
  "id": "ECON-CONFLICT-05",
  "record_id": "uranium_enricher",
  "field": "blueprint_cost_credits",
  "observations": [
    {
      "value": 40500,
      "source_id": "ECON-F-URANIUM-ENRICHER"
    },
    {
      "value": 45000,
      "source_id": "ECON-BP"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "우라늄 농축기 해금비가 개별 페이지와 전체 청사진표에서 상이함."
}
```

## ECON-CONFLICT-06

- 레코드: `he_missile_factory`
- 필드: `required_blueprints`
- 처리: `unresolved`
- 사유: 개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님.

```json
{
  "id": "ECON-CONFLICT-06",
  "record_id": "he_missile_factory",
  "field": "required_blueprints",
  "observations": [
    {
      "value": [
        "missile_mine_launcher"
      ],
      "source_id": "ECON-F-HE-MISSILE-FACTORY"
    },
    {
      "value": [
        "he_missiles"
      ],
      "source_id": "ECON-BP"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님."
}
```

## ECON-CONFLICT-07

- 레코드: `emp_missile_factory`
- 필드: `required_blueprints`
- 처리: `unresolved`
- 사유: 개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님.

```json
{
  "id": "ECON-CONFLICT-07",
  "record_id": "emp_missile_factory",
  "field": "required_blueprints",
  "observations": [
    {
      "value": [
        "he_missile_factory"
      ],
      "source_id": "ECON-F-EMP-MISSILE-FACTORY"
    },
    {
      "value": [
        "emp_missile"
      ],
      "source_id": "ECON-BP"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님."
}
```

## ECON-CONFLICT-08

- 레코드: `mine_factory`
- 필드: `required_blueprints`
- 처리: `unresolved`
- 사유: 개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님.

```json
{
  "id": "ECON-CONFLICT-08",
  "record_id": "mine_factory",
  "field": "required_blueprints",
  "observations": [
    {
      "value": [
        "cannon_ammo_factory",
        "he_missile_factory"
      ],
      "source_id": "ECON-F-MINE-FACTORY"
    },
    {
      "value": [
        "cannon_ammo_factory",
        "proximity_mines"
      ],
      "source_id": "ECON-BP"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님."
}
```

## ECON-CONFLICT-09

- 레코드: `nuclear_missile_factory`
- 필드: `required_blueprints`
- 처리: `unresolved`
- 사유: 개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님.

```json
{
  "id": "ECON-CONFLICT-09",
  "record_id": "nuclear_missile_factory",
  "field": "required_blueprints",
  "observations": [
    {
      "value": [
        "he_missile_factory",
        "uranium_enricher"
      ],
      "source_id": "ECON-F-NUCLEAR-MISSILE-FACTORY"
    },
    {
      "value": [
        "tactical_nuclear_missile",
        "uranium_enricher"
      ],
      "source_id": "ECON-BP"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님."
}
```

## ECON-CONFLICT-10

- 레코드: `emp_missile_factory`
- 필드: `value_credits`
- 처리: `unresolved`
- 사유: 원문에 게시된 부품 가격과 원문 건조 재료×자원 단가 총액이 불일치. 전사 오류가 아니며 합성 금액을 게임값으로 채택하지 않음. 관측된 원재료 표는 observations에만 보존하고 현행 건조비 재현에 쓰지 말 것.

```json
{
  "id": "ECON-CONFLICT-10",
  "record_id": "emp_missile_factory",
  "field": "value_credits",
  "observations": [
    {
      "value": 20000,
      "source_id": "ECON-F-EMP-MISSILE-FACTORY",
      "location": "infobox Value"
    },
    {
      "value": 17600,
      "source_id": [
        "ECON-F-EMP-MISSILE-FACTORY",
        "ECON-CREDITS",
        "ECON-R-STEEL",
        "ECON-R-HYPER-COILS",
        "ECON-R-DIAMONDS"
      ],
      "location": "derived sum of published construction resources times base unit prices; not a second quoted game value"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "원문에 게시된 부품 가격과 원문 건조 재료×자원 단가 총액이 불일치. 전사 오류가 아니며 합성 금액을 게임값으로 채택하지 않음. 관측된 원재료 표는 observations에만 보존하고 현행 건조비 재현에 쓰지 말 것."
}
```

## ECON-CONFLICT-11

- 레코드: `nuclear_missile_factory`
- 필드: `value_credits`
- 처리: `unresolved`
- 사유: 원문에 게시된 부품 가격과 원문 건조 재료×자원 단가 총액이 불일치. 전사 오류가 아니며 합성 금액을 게임값으로 채택하지 않음. 관측된 원재료 표는 observations에만 보존하고 현행 건조비 재현에 쓰지 말 것.

```json
{
  "id": "ECON-CONFLICT-11",
  "record_id": "nuclear_missile_factory",
  "field": "value_credits",
  "observations": [
    {
      "value": 25000,
      "source_id": "ECON-F-NUCLEAR-MISSILE-FACTORY",
      "location": "infobox Value"
    },
    {
      "value": 30000,
      "source_id": [
        "ECON-F-NUCLEAR-MISSILE-FACTORY",
        "ECON-CREDITS",
        "ECON-R-STEEL",
        "ECON-R-HYPER-COILS",
        "ECON-R-ENRICHED-URANIUM"
      ],
      "location": "derived sum of published construction resources times base unit prices; not a second quoted game value"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "원문에 게시된 부품 가격과 원문 건조 재료×자원 단가 총액이 불일치. 전사 오류가 아니며 합성 금액을 게임값으로 채택하지 않음. 관측된 원재료 표는 observations에만 보존하고 현행 건조비 재현에 쓰지 말 것."
}
```

## ECON-CONFLICT-12

- 레코드: `processor_fabricator`
- 필드: `value_credits`
- 처리: `unresolved`
- 사유: 원문에 게시된 부품 가격과 원문 건조 재료×자원 단가 총액이 불일치. 전사 오류가 아니며 합성 금액을 게임값으로 채택하지 않음. 관측된 원재료 표는 observations에만 보존하고 현행 건조비 재현에 쓰지 말 것.

```json
{
  "id": "ECON-CONFLICT-12",
  "record_id": "processor_fabricator",
  "field": "value_credits",
  "observations": [
    {
      "value": 60000,
      "source_id": "ECON-F-PROCESSOR-FABRICATOR",
      "location": "infobox Value"
    },
    {
      "value": 80000,
      "source_id": [
        "ECON-F-PROCESSOR-FABRICATOR",
        "ECON-CREDITS",
        "ECON-R-STEEL",
        "ECON-R-HYPER-COILS",
        "ECON-R-DIAMONDS"
      ],
      "location": "derived sum of published construction resources times base unit prices; not a second quoted game value"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "원문에 게시된 부품 가격과 원문 건조 재료×자원 단가 총액이 불일치. 전사 오류가 아니며 합성 금액을 게임값으로 채택하지 않음. 관측된 원재료 표는 observations에만 보존하고 현행 건조비 재현에 쓰지 말 것."
}
```

## ECON-CONFLICT-13

- 레코드: `crew_bunk`
- 필드: `value_credits`
- 처리: `unresolved`
- 사유: 게시된 Value2000이 강철24×단가25=600 및 부품값=구성 자원값 규칙과 맞지 않음. 600을 게임 확인값으로 채택하지 않음.

```json
{
  "id": "ECON-CONFLICT-13",
  "record_id": "crew_bunk",
  "field": "value_credits",
  "observations": [
    {
      "value": 2000,
      "source_id": "ECON-CREW-BUNK",
      "location": "infobox Value"
    },
    {
      "value": 600,
      "source_id": [
        "ECON-CREW-BUNK",
        "ECON-R-STEEL",
        "ECON-CREDITS"
      ],
      "location": "derived material value, 24 * 25, not a second quoted game value"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "게시된 Value2000이 강철24×단가25=600 및 부품값=구성 자원값 규칙과 맞지 않음. 600을 게임 확인값으로 채택하지 않음."
}
```

## ECON-CONFLICT-14

- 레코드: `processor_fabricator`
- 필드: `construction_resources`
- 처리: `unresolved`
- 사유: 가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류.

```json
{
  "id": "ECON-CONFLICT-14",
  "record_id": "processor_fabricator",
  "field": "construction_resources",
  "observations": [
    {
      "value": [
        {
          "resource_id": "steel",
          "quantity": 80
        },
        {
          "resource_id": "hyper_coils",
          "quantity": 100
        },
        {
          "resource_id": "diamonds",
          "quantity": 12
        }
      ],
      "source_id": "ECON-F-PROCESSOR-FABRICATOR",
      "location": "published material list; conflicts with the same part value and resource price sum"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류."
}
```

## ECON-CONFLICT-15

- 레코드: `emp_missile_factory`
- 필드: `construction_resources`
- 처리: `unresolved`
- 사유: 가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류.

```json
{
  "id": "ECON-CONFLICT-15",
  "record_id": "emp_missile_factory",
  "field": "construction_resources",
  "observations": [
    {
      "value": [
        {
          "resource_id": "steel",
          "quantity": 96
        },
        {
          "resource_id": "hyper_coils",
          "quantity": 24
        },
        {
          "resource_id": "diamonds",
          "quantity": 2
        }
      ],
      "source_id": "ECON-F-EMP-MISSILE-FACTORY",
      "location": "published material list; conflicts with the same part value and resource price sum"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류."
}
```

## ECON-CONFLICT-16

- 레코드: `nuclear_missile_factory`
- 필드: `construction_resources`
- 처리: `unresolved`
- 사유: 가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류.

```json
{
  "id": "ECON-CONFLICT-16",
  "record_id": "nuclear_missile_factory",
  "field": "construction_resources",
  "observations": [
    {
      "value": [
        {
          "resource_id": "steel",
          "quantity": 136
        },
        {
          "resource_id": "hyper_coils",
          "quantity": 62
        },
        {
          "resource_id": "enriched_uranium",
          "quantity": 4
        }
      ],
      "source_id": "ECON-F-NUCLEAR-MISSILE-FACTORY",
      "location": "published material list; conflicts with the same part value and resource price sum"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류."
}
```

## ECON-CONFLICT-17

- 레코드: `crew_bunk`
- 필드: `construction_resources`
- 처리: `unresolved`
- 사유: 가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류.

```json
{
  "id": "ECON-CONFLICT-17",
  "record_id": "crew_bunk",
  "field": "construction_resources",
  "observations": [
    {
      "value": [
        {
          "resource_id": "steel",
          "quantity": 24
        }
      ],
      "source_id": "ECON-CREW-BUNK",
      "location": "published material list; conflicts with the same part value and resource price sum"
    }
  ],
  "resolution": "unresolved",
  "adopted_value": null,
  "reason": "가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류."
}
```

## OBS-laser_blaster-projectile_speed_m_per_s

- 레코드: `laser_blaster`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-laser_blaster-projectile_speed_m_per_s",
  "record_id": "laser_blaster",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 408,
      "unit": "meters/sec",
      "source_id": "CMB-S001",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-laser_blaster_overclock-damage_per_shot

- 레코드: `laser_blaster_overclock`
- 필드: `damage_per_shot`
- 처리: `adopted_patch_confirmed`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-laser_blaster_overclock-damage_per_shot",
  "record_id": "laser_blaster_overclock",
  "field": "damage_per_shot",
  "observations": [
    {
      "field": "damage_per_shot",
      "value": 350,
      "unit": "damage/shot",
      "source_id": "CMB-S001",
      "status": "superseded_wiki_snapshot",
      "reason": "0.30.5 정식 변경 350→200."
    }
  ],
  "adopted_value": 200,
  "resolution": "adopted_patch_confirmed",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-laser_blaster_overclock-power_per_shot

- 레코드: `laser_blaster_overclock`
- 필드: `power_per_shot`
- 처리: `adopted_patch_confirmed`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-laser_blaster_overclock-power_per_shot",
  "record_id": "laser_blaster_overclock",
  "field": "power_per_shot",
  "observations": [
    {
      "field": "power_per_shot",
      "value": 0.14,
      "unit": "power/shot",
      "source_id": "CMB-S001",
      "status": "superseded_wiki_snapshot",
      "reason": "0.30.5 정식 변경 0.14→0.08."
    }
  ],
  "adopted_value": 0.08,
  "resolution": "adopted_patch_confirmed",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-heavy_laser_blaster-projectile_speed_m_per_s

- 레코드: `heavy_laser_blaster`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-heavy_laser_blaster-projectile_speed_m_per_s",
  "record_id": "heavy_laser_blaster",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 360,
      "unit": "meters/sec",
      "source_id": "CMB-S002",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-heavy_laser_blaster_overclock-projectile_speed_m_per_s

- 레코드: `heavy_laser_blaster_overclock`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-heavy_laser_blaster_overclock-projectile_speed_m_per_s",
  "record_id": "heavy_laser_blaster_overclock",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 360,
      "unit": "meters/sec",
      "source_id": "CMB-S002",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-heavy_laser_blaster_overclock-damage_vs_shields_per_shot

- 레코드: `heavy_laser_blaster_overclock`
- 필드: `damage_vs_shields_per_shot`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-heavy_laser_blaster_overclock-damage_vs_shields_per_shot",
  "record_id": "heavy_laser_blaster_overclock",
  "field": "damage_vs_shields_per_shot",
  "observations": [
    {
      "field": "damage_vs_shields_per_shot",
      "value": 700,
      "unit": "damage/shot",
      "source_id": "CMB-S002",
      "status": "conflicting_observation",
      "reason": "표의 700/shot이 총 실드 피해인지 추가 피해인지 불분명. 본문은 extra damage라고 설명하며 일반 피해 1500과 충돌 가능."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-disruptor-projectile_speed_m_per_s

- 레코드: `disruptor`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-disruptor-projectile_speed_m_per_s",
  "record_id": "disruptor",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 216,
      "unit": "meters/sec",
      "source_id": "CMB-S003",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-disruptor_overclock-projectile_speed_m_per_s

- 레코드: `disruptor_overclock`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-disruptor_overclock-projectile_speed_m_per_s",
  "record_id": "disruptor_overclock",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 216,
      "unit": "meters/sec",
      "source_id": "CMB-S003",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-standard_cannon-projectile_speed_m_per_s

- 레코드: `standard_cannon`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-standard_cannon-projectile_speed_m_per_s",
  "record_id": "standard_cannon",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 240,
      "unit": "meters/sec",
      "source_id": "CMB-S004",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-standard_cannon_overclock-range_m

- 레코드: `standard_cannon_overclock`
- 필드: `range_m`
- 처리: `adopted_derived`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-standard_cannon_overclock-range_m",
  "record_id": "standard_cannon_overclock",
  "field": "range_m",
  "observations": [
    {
      "field": "range_m",
      "value": 240,
      "unit": "meters",
      "source_id": "CMB-S004",
      "status": "superseded_wiki_snapshot",
      "reason": "패치에서 일반판과 동일 사거리로 변경. 190m는 일반판 위키값과 결합한 값."
    }
  ],
  "adopted_value": 190,
  "resolution": "adopted_derived",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-standard_cannon_overclock-projectile_speed_m_per_s

- 레코드: `standard_cannon_overclock`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-standard_cannon_overclock-projectile_speed_m_per_s",
  "record_id": "standard_cannon_overclock",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 300,
      "unit": "meters/sec",
      "source_id": "CMB-S004",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-standard_cannon_overclock-damage_per_second

- 레코드: `standard_cannon_overclock`
- 필드: `damage_per_second`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-standard_cannon_overclock-damage_per_second",
  "record_id": "standard_cannon_overclock",
  "field": "damage_per_second",
  "observations": [
    {
      "field": "damage_per_second",
      "value": 833,
      "unit": "damage/sec",
      "source_id": "CMB-S004",
      "status": "conflicting_observation",
      "reason": "동일 표의 1.67 shots/sec와 일치하지 않음. 연사/살보의 평균 여부도 불명."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-standard_cannon_overclock-ammo_per_second

- 레코드: `standard_cannon_overclock`
- 필드: `ammo_per_second`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-standard_cannon_overclock-ammo_per_second",
  "record_id": "standard_cannon_overclock",
  "field": "ammo_per_second",
  "observations": [
    {
      "field": "ammo_per_second",
      "value": 1.11,
      "unit": "ammo/sec",
      "source_id": "CMB-S004",
      "status": "conflicting_observation",
      "reason": "동일 표의 1.67 shots/sec와 일치하지 않음. 연사/살보의 평균 여부도 불명."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-standard_cannon_overclock-heat_per_s

- 레코드: `standard_cannon_overclock`
- 필드: `heat_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-standard_cannon_overclock-heat_per_s",
  "record_id": "standard_cannon_overclock",
  "field": "heat_per_s",
  "observations": [
    {
      "field": "heat_per_s",
      "value": 388.5,
      "unit": "MJ/sec",
      "source_id": "CMB-S004",
      "status": "conflicting_observation",
      "reason": "동일 표의 1.67 shots/sec와 일치하지 않음. 연사/살보의 평균 여부도 불명."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-large_cannon-projectile_speed_m_per_s

- 레코드: `large_cannon`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-large_cannon-projectile_speed_m_per_s",
  "record_id": "large_cannon",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 150,
      "unit": "meters/sec",
      "source_id": "CMB-S005",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-large_cannon_overclock-projectile_speed_m_per_s

- 레코드: `large_cannon_overclock`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-large_cannon_overclock-projectile_speed_m_per_s",
  "record_id": "large_cannon_overclock",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 195,
      "unit": "meters/sec",
      "source_id": "CMB-S005",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-deck_cannon-projectile_speed_m_per_s

- 레코드: `deck_cannon`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-deck_cannon-projectile_speed_m_per_s",
  "record_id": "deck_cannon",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 120,
      "unit": "meters/sec",
      "source_id": "CMB-S006",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-deck_cannon_overclock-projectile_speed_m_per_s

- 레코드: `deck_cannon_overclock`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-deck_cannon_overclock-projectile_speed_m_per_s",
  "record_id": "deck_cannon_overclock",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 360,
      "unit": "meters/sec",
      "source_id": "CMB-S006",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-deck_cannon_overclock-ammo_per_second

- 레코드: `deck_cannon_overclock`
- 필드: `ammo_per_second`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-deck_cannon_overclock-ammo_per_second",
  "record_id": "deck_cannon_overclock",
  "field": "ammo_per_second",
  "observations": [
    {
      "field": "ammo_per_second",
      "value": 8,
      "unit": "ammo/sec",
      "source_id": "CMB-S006",
      "status": "conflicting_observation",
      "reason": "10 ammo/shot × 0.4 shots/sec와 불일치. 4로 임의 교정하지 않았다."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-chaingun-construction_resources

- 레코드: `chaingun`
- 필드: `construction_resources`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-chaingun-construction_resources",
  "record_id": "chaingun",
  "field": "construction_resources",
  "observations": [
    {
      "field": "construction_resources",
      "value": {
        "steel": 114,
        "hyper_coils": 38,
        "tri_steel": 45
      },
      "unit": "items",
      "source_id": "CMB-S007",
      "status": "conflicting_wiki_snapshot",
      "reason": "기재 재료의 기준 단가 합계가 같은 인포박스 Value와 불일치. 어느 항목이 오기인지 결정하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-chaingun-value_credits

- 레코드: `chaingun`
- 필드: `value_credits`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-chaingun-value_credits",
  "record_id": "chaingun",
  "field": "value_credits",
  "observations": [
    {
      "field": "value_credits",
      "value": 24000,
      "unit": "credits",
      "source_id": "CMB-S007",
      "status": "conflicting_wiki_snapshot",
      "reason": "기재 재료의 기준 단가 합계와 불일치."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-chaingun_overclock-shots_per_second

- 레코드: `chaingun_overclock`
- 필드: `shots_per_second`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-chaingun_overclock-shots_per_second",
  "record_id": "chaingun_overclock",
  "field": "shots_per_second",
  "observations": [
    {
      "field": "shots_per_second",
      "value": [
        2.86,
        30
      ],
      "unit": "shots/sec",
      "source_id": "CMB-S007",
      "status": "conflicting_observation",
      "reason": "OC 네 발 살보와 휴지시간을 포함한 실효 발사율인지 불명. 초당 피해 최대값은 30×1800과 다르다."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-chaingun_overclock-damage_per_second

- 레코드: `chaingun_overclock`
- 필드: `damage_per_second`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-chaingun_overclock-damage_per_second",
  "record_id": "chaingun_overclock",
  "field": "damage_per_second",
  "observations": [
    {
      "field": "damage_per_second",
      "value": [
        5143,
        13500
      ],
      "unit": "damage/sec",
      "source_id": "CMB-S007",
      "status": "conflicting_observation",
      "reason": "OC 네 발 살보와 휴지시간을 포함한 실효 발사율인지 불명. 초당 피해 최대값은 30×1800과 다르다."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-chaingun_overclock-heat_per_s

- 레코드: `chaingun_overclock`
- 필드: `heat_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-chaingun_overclock-heat_per_s",
  "record_id": "chaingun_overclock",
  "field": "heat_per_s",
  "observations": [
    {
      "field": "heat_per_s",
      "value": [
        1716,
        18000
      ],
      "unit": "MJ/sec",
      "source_id": "CMB-S007",
      "status": "conflicting_observation",
      "reason": "OC 네 발 살보와 휴지시간을 포함한 실효 발사율인지 불명. 초당 피해 최대값은 30×1800과 다르다."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-chaingun_overclock-construction_resources

- 레코드: `chaingun_overclock`
- 필드: `construction_resources`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-chaingun_overclock-construction_resources",
  "record_id": "chaingun_overclock",
  "field": "construction_resources",
  "observations": [
    {
      "field": "construction_resources",
      "value": {
        "steel": 114,
        "hyper_coils": 38,
        "tri_steel": 45
      },
      "unit": "items",
      "source_id": "CMB-S007",
      "status": "conflicting_wiki_snapshot",
      "reason": "기재 재료의 기준 단가 합계가 같은 인포박스 Value와 불일치. 어느 항목이 오기인지 결정하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-chaingun_overclock-value_credits

- 레코드: `chaingun_overclock`
- 필드: `value_credits`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-chaingun_overclock-value_credits",
  "record_id": "chaingun_overclock",
  "field": "value_credits",
  "observations": [
    {
      "field": "value_credits",
      "value": 24000,
      "unit": "credits",
      "source_id": "CMB-S007",
      "status": "conflicting_wiki_snapshot",
      "reason": "기재 재료의 기준 단가 합계와 불일치."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-railgun_launcher_overclock-projectile_speed_m_per_s

- 레코드: `railgun_launcher_overclock`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-railgun_launcher_overclock-projectile_speed_m_per_s",
  "record_id": "railgun_launcher_overclock",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 864,
      "unit": "meters/sec",
      "source_id": "CMB-S012",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-railgun_accelerator-construction_resources

- 레코드: `railgun_accelerator`
- 필드: `construction_resources`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-railgun_accelerator-construction_resources",
  "record_id": "railgun_accelerator",
  "field": "construction_resources",
  "observations": [
    {
      "field": "construction_resources",
      "value": {
        "steel": 76,
        "hyper_coils": 10,
        "tri_steel": 10
      },
      "unit": "items",
      "source_id": "CMB-S013",
      "status": "conflicting_wiki_snapshot",
      "reason": "기재 재료의 기준 단가 합계가 같은 인포박스 Value와 불일치. 어느 항목이 오기인지 결정하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-railgun_accelerator-value_credits

- 레코드: `railgun_accelerator`
- 필드: `value_credits`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-railgun_accelerator-value_credits",
  "record_id": "railgun_accelerator",
  "field": "value_credits",
  "observations": [
    {
      "field": "value_credits",
      "value": 7500,
      "unit": "credits",
      "source_id": "CMB-S013",
      "status": "conflicting_wiki_snapshot",
      "reason": "기재 재료의 기준 단가 합계와 불일치."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-railgun_accelerator_overclock-construction_resources

- 레코드: `railgun_accelerator_overclock`
- 필드: `construction_resources`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-railgun_accelerator_overclock-construction_resources",
  "record_id": "railgun_accelerator_overclock",
  "field": "construction_resources",
  "observations": [
    {
      "field": "construction_resources",
      "value": {
        "steel": 76,
        "hyper_coils": 10,
        "tri_steel": 10
      },
      "unit": "items",
      "source_id": "CMB-S013",
      "status": "conflicting_wiki_snapshot",
      "reason": "기재 재료의 기준 단가 합계가 같은 인포박스 Value와 불일치. 어느 항목이 오기인지 결정하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-railgun_accelerator_overclock-value_credits

- 레코드: `railgun_accelerator_overclock`
- 필드: `value_credits`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-railgun_accelerator_overclock-value_credits",
  "record_id": "railgun_accelerator_overclock",
  "field": "value_credits",
  "observations": [
    {
      "field": "value_credits",
      "value": 7500,
      "unit": "credits",
      "source_id": "CMB-S013",
      "status": "conflicting_wiki_snapshot",
      "reason": "기재 재료의 기준 단가 합계와 불일치."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-missile_emp-shots_per_second

- 레코드: `missile_emp`
- 필드: `shots_per_second`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-missile_emp-shots_per_second",
  "record_id": "missile_emp",
  "field": "shots_per_second",
  "observations": [
    {
      "field": "shots_per_second",
      "value": 0.167,
      "unit": "shots/sec",
      "source_id": "CMB-S014",
      "status": "superseded_wiki_snapshot",
      "reason": "0.28.1 공식 4초 발사 쿨다운과 불일치. 옛 6초 주기 표로 보인다."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-mine-shots_per_second

- 레코드: `mine`
- 필드: `shots_per_second`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-mine-shots_per_second",
  "record_id": "mine",
  "field": "shots_per_second",
  "observations": [
    {
      "field": "shots_per_second",
      "value": 0.33,
      "unit": "shots/sec",
      "source_id": "CMB-S014",
      "status": "ambiguous_rate",
      "reason": "Salvo 2 shots (0.16/sec) 표기도 있어 평균 살보율인지 단발율인지 불명."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-mine_shrapnel-projectile_durability

- 레코드: `mine_shrapnel`
- 필드: `projectile_durability`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-mine_shrapnel-projectile_durability",
  "record_id": "mine_shrapnel",
  "field": "projectile_durability",
  "observations": [
    {
      "field": "projectile_durability",
      "value": "∞",
      "unit": "durability",
      "source_id": "CMB-S014",
      "status": "superseded_or_ambiguous",
      "reason": "0.30.5에서 요격 가능해졌으므로 무한 내구도를 현재값으로 채택하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-point_defense_system-damage_vs_shots_per_shot

- 레코드: `point_defense_system`
- 필드: `damage_vs_shots_per_shot`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-point_defense_system-damage_vs_shots_per_shot",
  "record_id": "point_defense_system",
  "field": "damage_vs_shots_per_shot",
  "observations": [
    {
      "field": "damage_vs_shots_per_shot",
      "value": 150,
      "unit": "damage/shot",
      "source_id": "CMB-S015",
      "status": "version_uncertain",
      "reason": "0.30.0의 요격 피해 +20%가 반영된 값인지 확인하지 못함."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-point_defense_system-projectile_speed_m_per_s

- 레코드: `point_defense_system`
- 필드: `projectile_speed_m_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-point_defense_system-projectile_speed_m_per_s",
  "record_id": "point_defense_system",
  "field": "projectile_speed_m_per_s",
  "observations": [
    {
      "field": "projectile_speed_m_per_s",
      "value": 350,
      "unit": "meters/sec",
      "source_id": "CMB-S015",
      "status": "version_uncertain",
      "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-flak_array-damage_vs_shots_per_shot

- 레코드: `flak_array`
- 필드: `damage_vs_shots_per_shot`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-flak_array-damage_vs_shots_per_shot",
  "record_id": "flak_array",
  "field": "damage_vs_shots_per_shot",
  "observations": [
    {
      "field": "damage_vs_shots_per_shot",
      "value": 2250,
      "unit": "damage/shot",
      "source_id": "CMB-S016",
      "status": "version_uncertain",
      "reason": "0.30.0 요격 피해 +20% 패치가 기록돼 있지만 표는 일반 피해와 동일값. 2700으로 자동 보정하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-large_shield_generator-construction_resources

- 레코드: `large_shield_generator`
- 필드: `construction_resources`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-large_shield_generator-construction_resources",
  "record_id": "large_shield_generator",
  "field": "construction_resources",
  "observations": [
    {
      "field": "construction_resources",
      "value": {
        "steel": 120,
        "coils": 30,
        "diamonds": 2
      },
      "unit": "items",
      "source_id": "CMB-S018",
      "status": "conflicting_wiki_snapshot",
      "reason": "기재 재료의 기준 단가 합계가 같은 인포박스 Value와 불일치. 어느 항목이 오기인지 결정하지 않음."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-large_shield_generator-value_credits

- 레코드: `large_shield_generator`
- 필드: `value_credits`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-large_shield_generator-value_credits",
  "record_id": "large_shield_generator",
  "field": "value_credits",
  "observations": [
    {
      "field": "value_credits",
      "value": 20000,
      "unit": "credits",
      "source_id": "CMB-S018",
      "status": "conflicting_wiki_snapshot",
      "reason": "기재 재료의 기준 단가 합계와 불일치."
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-radiator-hp

- 레코드: `radiator`
- 필드: `hp`
- 처리: `adopted_patch_confirmed`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-radiator-hp",
  "record_id": "radiator",
  "field": "hp",
  "observations": [
    {
      "field": "hp",
      "value": 4000,
      "unit": "HP",
      "source_id": "CMB-S022",
      "status": "superseded_wiki_snapshot",
      "reason": "0.30.5 공식 HP 4000→3000."
    }
  ],
  "adopted_value": 3000,
  "resolution": "adopted_patch_confirmed",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## OBS-recipe_he_missile_parts-input_rates_per_s

- 레코드: `recipe_he_missile_parts`
- 필드: `input_rates_per_s`
- 처리: `unresolved`
- 사유: 관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.

```json
{
  "id": "OBS-recipe_he_missile_parts-input_rates_per_s",
  "record_id": "recipe_he_missile_parts",
  "field": "input_rates_per_s",
  "observations": [
    {
      "field": "input_rates_per_s",
      "value": [
        {
          "resource_id": "iron",
          "quantity": 0.17
        }
      ],
      "unit": "item[]/s",
      "source_id": "ECON-F-HE-MISSILE-FACTORY",
      "status": "partial_table",
      "location": "infobox Resource Use shows iron 0.17/sec only; sulfur rate is absent"
    }
  ],
  "adopted_value": null,
  "resolution": "unresolved",
  "reason": "관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조."
}
```

## 분야별 추가 조사 항목

- 원본 .rules 미제공으로 포트·문 좌표·충돌 폴리곤·부품 상속·전체 ID·OC 전체 프로필·추력 확장식·도약 연료식은 미복구.

```json
{
  "id": "CMB-U001",
  "record_ids": [
    "laser_blaster_overclock"
  ],
  "fields": [
    "blueprint_cost"
  ],
  "issue": "위키 OC 표에 10000, 일반판에는 1000. 서로 다른 해금 비용일 수 있어 숫자는 관측값만 보존하고 최신 비용으로 인증하지 않는다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S001"
  ]
}
```

```json
{
  "id": "CMB-U002",
  "record_ids": [
    "heavy_laser_blaster_overclock"
  ],
  "fields": [
    "damage_vs_shields_per_shot"
  ],
  "issue": "실드 700/발의 총량·추가량 의미를 확인하지 못해 정규화 값을 null로 두었다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S002"
  ]
}
```

```json
{
  "id": "CMB-U003",
  "record_ids": [
    "disruptor_overclock"
  ],
  "fields": [
    "shield_damage_total",
    "power_drain_total"
  ],
  "issue": "총량의 적용 단위·지속시간·중첩 방식이 미확인이다. 표의 총량을 발당/초당으로 치환하지 않았다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S003"
  ]
}
```

```json
{
  "id": "CMB-U004",
  "record_ids": [
    "ion_beam_emitter_overclock"
  ],
  "fields": [
    "heat_per_second",
    "damage_per_second",
    "range"
  ],
  "issue": "OC 개별 툴팁을 확보하지 못했다. 패치의 150/120은 번개 사건 단위가 명시되지 않아 발당 피해나 DPS로 쓰지 않는다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S009",
    "CMB-S030",
    "CMB-S029"
  ]
}
```

```json
{
  "id": "CMB-U005",
  "record_ids": [
    "ion_beam_prism"
  ],
  "fields": [
    "arbitrary_input_combine_formula"
  ],
  "issue": "원문 nth 식 0.75^n은 첫 입력100% 표 및 i−1 합식과 인덱스가 다르다. 동등 세기 예시 가중치만 복구하고 일반 합성 함수를 단정하지 않았다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S010"
  ]
}
```

```json
{
  "id": "CMB-U006",
  "record_ids": [
    "standard_cannon_overclock"
  ],
  "fields": [
    "shots_per_second",
    "damage_per_second",
    "ammo_per_second",
    "heat_per_second",
    "firing_interval"
  ],
  "issue": "OC 표의 연사율1.67과 초당값들은 서로 불일치한다. 1.67은 표 관측값으로만 보존하고 모순되는 평균값은 null.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S004"
  ]
}
```

```json
{
  "id": "CMB-U007",
  "record_ids": [
    "deck_cannon_overclock"
  ],
  "fields": [
    "ammo_per_second"
  ],
  "issue": "OC 표의 8 ammo/sec는 일반판 잔존값일 수 있다. 실제 양포/교대 사격 주기를 실행 확인해야 한다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S006"
  ]
}
```

```json
{
  "id": "CMB-U008",
  "record_ids": [
    "chaingun_overclock"
  ],
  "fields": [
    "shots_per_second",
    "damage_per_second",
    "heat_per_second"
  ],
  "issue": "살보 내부 순간 연사율과 휴지시간을 포함한 평균값이 혼재한다. 원문 숫자를 임의로 평균 DPS로 확정하지 않았다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S007"
  ]
}
```

```json
{
  "id": "CMB-U009",
  "record_ids": [
    "chaingun"
  ],
  "fields": [
    "game_id"
  ],
  "issue": "차량 부품 인포박스에 Technical ID가 노출되지 않았다. 이름과 같은 chaingun을 실제 ID라고 추정하지 않았다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S007"
  ]
}
```

```json
{
  "id": "CMB-U010",
  "record_ids": [
    "railgun_launcher_overclock"
  ],
  "fields": [
    "thermal_connection_requirement"
  ],
  "issue": "장전기 문서는 모든 모듈 연결, 발사기·가속기 문서는 한 모듈 연결로 충분하다고 충돌한다. 숫자 및 조건 확정 불가.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S011",
    "CMB-S012",
    "CMB-S013"
  ]
}
```

```json
{
  "id": "CMB-U011",
  "record_ids": [
    "missile_emp"
  ],
  "fields": [
    "shots_per_second"
  ],
  "issue": "4초 쿨다운은 버전 지정 공식값이다. 이후 발사 준비·장전시간을 포함한 실효 발사율은 별도 검증 없이 0.25로 채우지 않았다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S014",
    "CMB-S031"
  ]
}
```

```json
{
  "id": "CMB-U012",
  "record_ids": [
    "mine"
  ],
  "fields": [
    "shots_per_second",
    "firing_interval",
    "projectile_speed",
    "assembly_parts"
  ],
  "issue": "기뢰 살보·평균 발사율 구분과 탄체 조립 원가를 확보하지 못함. 미사일류 초기속도도 0.30.5 대상 여부가 불명확하여 생략.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S014",
    "CMB-S029"
  ]
}
```

```json
{
  "id": "CMB-U013",
  "record_ids": [
    "flak_array"
  ],
  "fields": [
    "damage_vs_shots_per_shot"
  ],
  "issue": "PD/Flak의 요격 피해 증가는 0.30.0 공식 패치로 확인했으나 최신 절대값을 검증하지 못함. 일반 선체 피해와 요격 피해를 분리했다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S015",
    "CMB-S016",
    "CMB-S030"
  ]
}
```

```json
{
  "id": "CMB-U014",
  "record_ids": [],
  "fields": [
    "OC shield statistics",
    "OC point defense power/heat",
    "OC flak cloud statistics"
  ],
  "issue": "방어 OC 모드의 정확한 실드 강도·범위·피해당 열량, PD 발전량, Flak 구름 수명·피해를 공식 정량 자료에서 확보하지 못함. 비개발자 게시글의 미검증 숫자는 채택하지 않았다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S030",
    "CMB-S017",
    "CMB-S018",
    "CMB-S015",
    "CMB-S016"
  ]
}
```

```json
{
  "id": "CMB-U015",
  "record_ids": [
    "large_shield_generator"
  ],
  "fields": [
    "materials"
  ],
  "issue": "인포박스의 Coils 30 표기는 observations에 보존했다. 기준 단가 합계와 Value가 맞지 않아 정규화 재료·가치는 null이며 Hyper-Coils로 임의 변경하지 않았다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S018"
  ]
}
```

```json
{
  "id": "CMB-U016",
  "record_ids": [
    "radiator"
  ],
  "fields": [
    "game_id"
  ],
  "issue": "Radiator 인포박스의 Technical ID가 thermal_battery로 중복된다. game_id=null, 관측 문자열은 별도 보존.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S022",
    "CMB-S023"
  ]
}
```

```json
{
  "id": "CMB-U017",
  "record_ids": [
    "thermal_resonance_lance"
  ],
  "fields": [
    "heat_per_second",
    "heat_applied_per_second",
    "heat_capacity"
  ],
  "issue": "열 무기 핵심 열량과 저장량이 인포박스에 없다. 펌프의 추가200MJ/sec와 랜스 기본 발열을 혼동하지 않는다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S025",
    "CMB-S026",
    "CMB-S027"
  ]
}
```

```json
{
  "id": "CMB-U018",
  "record_ids": [
    "global_heat_fire"
  ],
  "fields": [
    "heat thresholds",
    "decay",
    "fire DPS",
    "spread",
    "foam duration"
  ],
  "issue": "현대 열·화재의 세부 상수는 공개 공지에 없다. 0.26.x 모딩 Fire 문서나 STARFORGE 프로토타입의 임계값을 가져오지 않았다.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S030",
    "CMB-S029"
  ]
}
```

```json
{
  "id": "CMB-U019",
  "record_ids": [],
  "fields": [
    "all unversioned wiki fields"
  ],
  "issue": "최신 수집일은 최신 빌드 검증일이 아니다. 위키·RC·정식패치가 섞인 원자료로 원작의 완전한 0.30.5a 데이터베이스를 선언할 수 없다.",
  "recommended_resolution": "0.30.5a 설치의 비이미지 규칙 파일 또는 Alt 툴팁 캡처를 제공받아 빈칸과 충돌부터 검증한다.",
  "source_ids": [
    "CMB-S029",
    "CMB-S034"
  ]
}
```

```json
{
  "id": "CMB-U020",
  "record_ids": [
    "chaingun"
  ],
  "fields": [
    "materials",
    "value"
  ],
  "issue": "같은 자료의 Value 24,000와 재료 단가 합계 23,250가 맞지 않는다. 두 필드 모두 null, 관측 재료·Value 및 계산 근거는 observations에 보존.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S007",
    "ECON-CREDITS",
    "ECON-R-STEEL",
    "ECON-R-HYPER-COILS",
    "ECON-R-TRI-STEEL"
  ]
}
```

```json
{
  "id": "CMB-U021",
  "record_ids": [
    "chaingun_overclock"
  ],
  "fields": [
    "materials",
    "value"
  ],
  "issue": "같은 자료의 Value 24,000와 재료 단가 합계 23,250가 맞지 않는다. 두 필드 모두 null, 관측 재료·Value 및 계산 근거는 observations에 보존.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S007",
    "ECON-CREDITS",
    "ECON-R-STEEL",
    "ECON-R-HYPER-COILS",
    "ECON-R-TRI-STEEL"
  ]
}
```

```json
{
  "id": "CMB-U022",
  "record_ids": [
    "railgun_accelerator"
  ],
  "fields": [
    "materials",
    "value"
  ],
  "issue": "같은 자료의 Value 7,500와 재료 단가 합계 6,900가 맞지 않는다. 두 필드 모두 null, 관측 재료·Value 및 계산 근거는 observations에 보존.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S013",
    "ECON-CREDITS",
    "ECON-R-STEEL",
    "ECON-R-HYPER-COILS",
    "ECON-R-TRI-STEEL"
  ]
}
```

```json
{
  "id": "CMB-U023",
  "record_ids": [
    "railgun_accelerator_overclock"
  ],
  "fields": [
    "materials",
    "value"
  ],
  "issue": "같은 자료의 Value 7,500와 재료 단가 합계 6,900가 맞지 않는다. 두 필드 모두 null, 관측 재료·Value 및 계산 근거는 observations에 보존.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S013",
    "ECON-CREDITS",
    "ECON-R-STEEL",
    "ECON-R-HYPER-COILS",
    "ECON-R-TRI-STEEL"
  ]
}
```

```json
{
  "id": "CMB-U024",
  "record_ids": [
    "large_shield_generator"
  ],
  "fields": [
    "materials",
    "value"
  ],
  "issue": "같은 자료의 Value 20,000와 재료 단가 합계 14,000가 맞지 않는다. 두 필드 모두 null, 관측 재료·Value 및 계산 근거는 observations에 보존.",
  "recommended_resolution": "게임 0.30.5a 실행 또는 해당 버전 Data/*.rules를 사용자가 제공하면 대조한다.",
  "source_ids": [
    "CMB-S018",
    "ECON-CREDITS",
    "ECON-R-STEEL",
    "ECON-R-COILS",
    "ECON-R-DIAMONDS"
  ]
}
```
- 22종 모든 자원의 실제 resource 내부 ID와 단위 질량은 미확인. 안정 ID를 원작 ID로 간주하지 말 것.
- 우라늄·핵미사일 부품·열 캐니스터 미사일 부품의 개별 가격 및 우주 묶음 크기는 조회 근거 미확보.
- 다이아몬드 즉시 제작 외 공장 정확한 주기·실제 묶음 크기는 대부분 미확인. 표시 생산률의 역수를 사용하지 않음.
- 공장 필수 조작 승무원 수 미확인. Crew Speed 50%를 0명 또는 인원수로 바꾸지 않음.
- 일부 공장 내부 재고는 일반 창고의 0.28.0 저장량 증가와 비례하지 않음. 내부 저장 타일 자료의 갱신 여부 미확인.
- 코일·핵미사일·열 캐니스터 공장 출력률이 검색된 표에 없거나 ?로 표시됨.
- 명성 표의 Crew/Fame Ratio 설정, 각 설정의 배수, 고용 비용 함수·EVA 산소량·이동 속도는 미확인.
- 수리 HP 비례식, 거래 난이도·평판 합성 순서·반올림, 설계 해금 관계 충돌은 원본 .rules 또는 실행 UI 대조 필요.
- Career 2.0 개발 계획 및 Cosmoteer Classic 역사값을 현행 수치로 섞지 않았음. 이 자료는 최신 설치 빌드의 완전 덤프가 아님.
