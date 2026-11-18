# 레시피 단위·경제 파생 분석

아래는 연구자 계산이며 원작 채택 필드를 변경하지 않는다. 입력 관측과 수치 출처는 [원작 JSON](../data/cosmoteer_original.json), 기계 판독용 분석은 [recipe_diagnostics.json](recipe_diagnostics.json)에 있다.

## V2-ECO-F02

표의 .45 iron/.45 copper 대비 초당 .1/.1 및 출력2/s는 .05/.05를 암시하여 9배 차이. 완성 EMP 미사일 9부품과 단위 혼동 가능성은 있으나 패치 또는 rules 없이 inputs를 복구하지 않음.

계산식: `0.45 / (0.1 / 2) = 9`

근거 레코드: `recipe_emp_missile_parts`.

## V2-ECO-F03

0.21.2에서 기뢰 제조 철·탄약 비용이 각각 절반으로 감소. 기존 craft 표 .1철/4탄약과 infobox .2철/8탄약의 2배 차이가 버전 잔존일 가능성. per-part와 per-mine 기준이 확정되지 않아 inputs=null/conflict 유지.

근거 레코드: `recipe_mine_parts`.

## V2-ECO-F04

출력 .17/s×원료비율4=.68/s와 입력표 .67/s 차이는 소수 둘째 자리 반올림으로 양립 가능. 정확한 6초 주기나 실제 배치로 확정하지 않음.

근거 레코드: `recipe_enriched_uranium`.

## V2-ECO-F05

표시 출력3.33×황비율.05=.1665 황/s는 계산값일 뿐 원문 소비율이 아니다. 철 .17/s 한 항목만 남아 있는 부분 관측으로부터 완결 input_rates_per_s 배열을 만들지 않음.

근거 레코드: `recipe_he_missile_parts`.

## V2-ECO-F06

코일 1:1과 copper .67/s로부터 .67출력/s, 핵부품 .1iron/.05로부터2출력/s를 암시하지만 원작 출력률 칸을 채우지 않는다. 핵공장 완성미사일당4전력도 부품당 사용량과 혼합 금지.

근거 레코드: `recipe_coils`, `recipe_nuclear_missile_parts`.

## V2-ECO-F10

원료를 기준 구매가로 사고 생산물을 경제 난이도별 판매 비율로 판매하는 중립 평판 시나리오. 전력·운반·공장 건조비·시간·거래 반올림·재고 한계 미포함. 원작 수익률 공식으로 취급하지 않음.

계산식: `margin = sum(output_quantity * base_price * sell_buy_ratio) - sum(input_quantity * base_price)`

| 레시피 | 원료비 | 완제품 기준가 | Builder | Architect | Starwright |
| --- | ---: | ---: | ---: | ---: | ---: |
| recipe_ammo | 1.0 | 4 | 3.0 | 1.0 | 0.0 |
| recipe_he_missile_parts | 2.0 | 8 | 6.0 | 2.0 | 0.0 |
| recipe_coils | 80 | 100 | 20 | -30.0 | -55.0 |
| recipe_hyper_coils | 240.0 | 300 | 60.0 | -90.0 | -165.0 |
| recipe_processor | 2000 | 2500 | 500 | -750.0 | -1375.0 |
| recipe_diamonds | 3200 | 4000 | 800 | -1200.0 | -2200.0 |

원료를 기준 구매가로 구입하고 중립 평판에서 난이도 판매 비율로 판매하는 가정이다. 전력·인력·공장·시간·공간·수리·반올림 비용이 빠진 공헌이익이다. 원작 수익률·순이익·회수기간으로 읽지 않는다.

근거 레코드: `recipe_ammo`, `recipe_he_missile_parts`, `recipe_coils`, `recipe_hyper_coils`, `recipe_processor`, `recipe_diamonds`.
