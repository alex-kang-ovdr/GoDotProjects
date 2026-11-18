#!/usr/bin/env python3
"""Build the browser's pinned LoL catalogue and supported gameplay definitions.

Default: rebuild from the bundled compact, factual snapshot. --source can point
to a previous reconstruction package's data directory to refresh those records.
No network request is made by this script.
"""
from pathlib import Path
import argparse
import json

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "data/restored-input.json"
OUTPUT = ROOT / "dist/restored-data.js"
VERSION = "16.22.1"
UNIT_SCALE = 0.5
STAT_KEYS = ["hp", "hpperlevel", "mp", "mpperlevel", "movespeed", "armor", "armorperlevel", "spellblock", "spellblockperlevel", "attackrange", "hpregen", "hpregenperlevel", "mpregen", "mpregenperlevel", "crit", "critperlevel", "attackdamage", "attackdamageperlevel", "attackspeedperlevel", "attackspeed"]
PLAYABLE = ["Ahri", "Ashe", "Garen", "Lux", "LeeSin", "Jhin"]
SHOP_IDS = [1001, 1011, 1018, 1026, 1027, 1028, 1029, 1031, 1033, 1036, 1037, 1038, 1042, 1052, 1058, 1053, 3006, 3086, 3031, 3089, 2022, 3067, 3108, 3133, 1057]
STAT_MAP = {"FlatHPPoolMod": "maxHp", "FlatMPPoolMod": "maxMana", "FlatPhysicalDamageMod": "damage", "FlatMagicDamageMod": "abilityPower", "FlatArmorMod": "armor", "FlatSpellBlockMod": "magicResist", "FlatMovementSpeedMod": "speed", "PercentMovementSpeedMod": "percentSpeed", "PercentAttackSpeedMod": "attackSpeed", "FlatCritChanceMod": "critChance", "PercentLifeStealMod": "lifeSteal"}

# Authored presentation and gameplay geometry. These are deliberately separate
# from the official rank arrays. Damage/behavior code is owned by the engine.
HERO_CONFIG = {
    "Ahri": {"archetype": "mage", "color": "#e7a4e8", "role": "기동 마법사", "description": "왕복 구슬과 매혹, 연속 질주를 연결하는 기동형 마법사입니다.",
             "passiveDescription": "미니언·몬스터 9마리 처치 또는 적 챔피언 처치 관여 시 체력을 회복하는 재구성 패시브입니다.",
             "skills": {
                 "q": ("direction", 22, "◉", "구슬이 앞으로 나아갔다 돌아오며 경로의 적을 공격합니다."),
                 "w": ("self", 70, "♨", "주변 적을 추적하는 여우불을 발사하고 잠시 빠르게 이동합니다."),
                 "e": ("direction", 18, "♥", "첫 적에게 매혹을 걸어 이동과 행동을 제약합니다."),
                 "r": ("dash", 70, "»", "짧게 질주하며 주변 적을 공격합니다. 재시전으로 연속 질주합니다.")}},
    "Ashe": {"archetype": "ranger", "color": "#7bc8ff", "role": "둔화 원거리", "description": "서리 화살로 적을 늦추고 정찰과 긴 사거리의 기절로 교전을 엽니다.",
             "passiveDescription": "기본 공격에 서리 둔화를 적용하는 재구성 패시브입니다.",
             "skills": {
                 "q": ("self", 70, "≋", "기본 공격으로 집중을 쌓은 뒤 연사를 활성화합니다."),
                 "w": ("direction", 18, "⋀", "부채꼴로 서리 화살을 발사합니다. 같은 적에게 중복 적중하지 않습니다."),
                 "e": ("ground", 200, "◎", "지정한 지역으로 매를 보내 전장을 정찰합니다."),
                 "r": ("direction", 30, "➶", "먼 거리로 수정 화살을 쏘아 적 챔피언을 기절시킵니다.")}},
    "Garen": {"archetype": "warrior", "color": "#dfbf73", "role": "근접 전사", "description": "마나 없이 결정타·방어·회전을 연결하고 잃은 체력이 큰 적을 처형합니다.",
              "passiveDescription": "전투에서 벗어난 동안 체력을 회복하는 재구성 패시브입니다.",
              "skills": {
                  "q": ("self", 75, "⚔", "이동 속도를 얻고 다음 기본 공격을 강화해 적을 침묵시킵니다."),
                  "w": ("self", 70, "⬡", "보호막과 방어 효과로 적의 공격을 견딥니다."),
                  "e": ("self", 162.5, "↻", "주변을 회전 베기로 연속 공격합니다."),
                  "r": ("ground", 40, "▼", "가까운 적 챔피언에게 잃은 체력에 비례한 마무리 피해를 줍니다.")}},
    "Lux": {"archetype": "mage", "color": "#f4dda2", "role": "원거리 마법", "description": "속박과 빛의 구역으로 진입을 막고 보호막과 긴 광선으로 아군을 지원합니다.",
            "passiveDescription": "스킬로 남긴 빛의 표식을 기본 공격으로 터뜨리는 재구성 패시브입니다.",
            "skills": {
                "q": ("direction", 22, "✧", "빛을 발사해 최대 두 적을 속박합니다."),
                "w": ("direction", 35, "◇", "돌아오는 지팡이로 경로의 아군에게 보호막을 부여합니다."),
                "e": ("ground", 155, "⊙", "둔화 구역을 만들고 재시전으로 폭발시킵니다."),
                "r": ("direction", 75, "═", "잠시 조준한 뒤 일직선으로 긴 빛의 광선을 발사합니다.")}},
    "LeeSin": {"archetype": "warrior", "color": "#e7a37d", "role": "기력 기동 전사", "description": "음파 표식과 연속 시전, 방호 이동, 발차기로 적의 위치를 바꿉니다.",
               "passiveDescription": "스킬 사용 뒤 기본 공격으로 기력을 돌려받는 재구성 패시브입니다.",
               "skills": {
                   "q": ("direction", 20, "➤", "음파로 적을 표시하고 재시전하면 표시한 적에게 돌진합니다."),
                   "w": ("ground", 60, "◈", "아군 방향으로 이동하며 보호막을 얻고 재시전으로 전투 회복을 강화합니다."),
                   "e": ("self", 225, "≋", "주변에 충격파를 주고 재시전하면 적을 둔화시킵니다."),
                   "r": ("ground", 40, "↗", "가까운 적 챔피언을 발로 차 뒤로 밀어냅니다.")}},
    "Jhin": {"archetype": "ranger", "color": "#d69aa8", "role": "재장전 원거리", "description": "네 발의 탄환과 표식, 함정을 준비하고 커튼 콜로 적을 마무리합니다.",
             "passiveDescription": "네 번째 탄환 강화와 재장전을 사용하는 재구성 패시브입니다.",
             "skills": {
                 "q": ("ground", 60, "◆", "가까운 적 사이를 튀는 유탄을 던집니다."),
                 "w": ("direction", 18, "─", "긴 직선 탄환을 발사하고 표식이 남은 적을 속박합니다."),
                 "e": ("ground", 110, "✿", "적이 접근하면 둔화 후 폭발하는 연꽃 함정을 설치합니다."),
                 "r": ("direction", 35, "Ⅳ", "제자리에 자리 잡고 재시전으로 네 발의 장거리 탄환을 발사합니다.")}},
}

def compact_source(source_path, previous):
    """Project the previously validated dataset, without guessing missing fields."""
    read = lambda name: json.loads((source_path / (name + ".json")).read_text(encoding="utf-8"))
    champion_rows, spell_rows, item_rows, passive_rows = map(read, ["champions", "champion_spells", "items", "champion_passives"])
    for family in [champion_rows, spell_rows, item_rows, passive_rows]:
        if not all(row.get("ddragon_version") == VERSION for row in family):
            raise ValueError("The importer is pinned to Data Dragon " + VERSION + "; a new build needs a reviewed runtime profile.")
    old_by_key = {c["key"]: c for c in previous.get("champions", [])}
    spell_by_key = {}
    for s in spell_rows:
        spell_by_key.setdefault(s["champion_key"], []).append({"slot": s["slot"].lower(), "name": s["spell_name_ko"], "spellId": s["spell_id"], "maxRank": s["max_rank"], "cooldownByRank": s["cooldown_by_rank"], "costByRank": s["cost_by_rank"], "rangeByRank": s["range_by_rank"], "unresolvedTokens": s["unresolved_tokens"], "source": s["source_url"], "sourcePointer": s["source_json_pointer"], "sourceHash": s["source_sha256"]})
    passives = {p["champion_key"]: p for p in passive_rows}
    champions = []
    for c in champion_rows:
        key = c["champion_key"]
        old = old_by_key.get(key, {})
        passive = passives.get(key, {})
        champions.append({"id": c["champion_id"], "key": key, "name": c["name_ko"], "nameEn": c["name_en"], "title": old.get("title", ""), "resource": c["resource_type"], "tags": c["class_tags"], "stats": {k: c[k] for k in STAT_KEYS}, "spells": spell_by_key[key], "passiveName": passive.get("name_ko", passive.get("passive_name_ko", "")), "source": c["source_url"], "sourcePointer": c["source_json_pointer"], "sourceHash": c["source_sha256"], "portraitSource": old.get("portraitSource")})
    items = [{"id": "lol_" + str(i["item_id"]), "sourceId": i["item_id"], "name": i["name_ko"], "nameEn": i["name_en"], "cost": i["gold_total"], "combineCost": i["gold_base"], "sell": i["gold_sell"], "stats": i["stats"], "components": ["lol_" + x for x in i["from_ids"]], "maps": i["maps"], "srCandidate": i["sr_shop_candidate_derived"], "tags": i["tags"], "source": i["source_url"], "sourcePointer": i["source_json_pointer"], "sourceHash": i["source_sha256"]} for i in item_rows]
    return {**previous, "version": VERSION, "publicPatch": "26.22", "champions": champions, "items": items}


def skill_template(spell, cfg, champion_key):
    target, radius, icon, description = cfg
    definition = {**spell, "description": description, "icon": icon, "target": target, "radius": radius,
                  "cooldown": spell["cooldownByRank"][0], "cost": spell["costByRank"][0],
                  "range": spell["rangeByRank"][0] * UNIT_SCALE,
                  "evidence": "official_static_rank_values", "behaviorEvidence": "project_reconstruction",
                  "geometryEvidence": "project_reconstruction", "rangeArrayUnits": "lol_units"}
    if champion_key == "Ashe" and spell["slot"] in ["e", "r"]:
        definition["runtimeRangeOverride"] = 4800
        definition["range"] = 4800
        definition["rangeOverrideReason"] = "Global display sentinel adapted to cover every supported prototype map."
    if champion_key == "Jhin" and spell["slot"] == "r":
        definition["runtimeRangeOverride"] = 1750
        definition["range"] = 1750
        definition["rangeOverrideReason"] = "Prototype firing distance; source 25000 is not treated as verified missile travel range."
    return definition


def mapped_item(item, evidence):
    stats = {}
    for raw_key, raw_value in item["stats"].items():
        if raw_key not in STAT_MAP:
            raise ValueError(f"Unsupported structured stat in purchase list: {item['id']} {raw_key}")
        stats[STAT_MAP[raw_key]] = raw_value * UNIT_SCALE if raw_key == "FlatMovementSpeedMod" else raw_value
    stats.update(evidence.get("extraStats", {}))
    tags = item["tags"]
    icon, color = ("✦", "#bfa6ff") if "SpellDamage" in tags else (("⬡", "#9ab8d4") if any(x in tags for x in ["Armor", "SpellBlock"]) else (("♥", "#ff9f98") if "Health" in tags else (("»", "#8fdedc") if "Boots" in tags else (("➶", "#9de6bb") if "AttackSpeed" in tags else ("⚔", "#f6bd7c")))))
    labels = {"damage": "공격력", "abilityPower": "주문력", "maxHp": "체력", "maxMana": "마나", "armor": "방어력", "magicResist": "마법 저항력", "speed": "이동 속도", "percentSpeed": "이동 속도", "attackSpeed": "공격 속도", "critChance": "치명타 확률", "lifeSteal": "생명력 흡수", "abilityHaste": "스킬 가속", "critDamageBonus": "치명타 피해", "abilityPowerMultiplier": "총 주문력"}
    fractional = {"percentSpeed", "attackSpeed", "critChance", "lifeSteal", "critDamageBonus", "abilityPowerMultiplier"}
    descriptions = []
    for k, v in stats.items():
        value = v * 100 if k in fractional else v / UNIT_SCALE if k == "speed" else v
        descriptions.append(labels[k] + " +" + format(value, ".6g") + ("%" if k in fractional else ""))
    out = {"id": item["id"], "sourceId": item["sourceId"], "sourceProfile": "lol16.22", "name": item["name"], "nameEn": item["nameEn"], "description": ", ".join(descriptions) + ".", "cost": item["cost"], "sell": item["sell"], "combineCost": item["combineCost"], "components": item["components"], "stats": stats, "icon": icon, "color": color, "portrait": "assets/items/" + str(item["sourceId"]) + ".png", "source": item["source"], "sourcePointer": item["sourcePointer"], "sourceHash": item["sourceHash"], "evidence": "official_static_values", "extraStatEvidence": evidence.get("fields", []), "mechanicsStatus": "implemented_supported_effects"}
    if item["sourceId"] in [1001, 3006]:
        out["uniqueGroup"] = "boots"
    elif item["sourceId"] in [3031, 3089]:
        out["uniqueGroup"] = item["id"]
    return out


def build(snapshot):
    assert snapshot["version"] == VERSION
    champions = json.loads(json.dumps(snapshot["champions"]))
    items = json.loads(json.dumps(snapshot["items"]))
    champion_map = {c["key"]: c for c in champions}
    item_map = {i["sourceId"]: i for i in items}
    heroes = []
    for key in PLAYABLE:
        c, cfg = champion_map[key], HERO_CONFIG[key]
        s, hero_id = c["stats"], "lol_" + key.lower()
        c["playableId"] = hero_id
        hero = {"id": hero_id, "sourceKey": key, "sourceId": c["id"], "sourceProfile": "lol16.22", "name": c["name"], "title": c["title"], "nameEn": c["nameEn"], "portrait": "assets/champions/" + key + ".png", "archetype": cfg["archetype"], "color": cfg["color"], "role": cfg["role"], "description": cfg["description"], "range": s["attackrange"] * UNIT_SCALE, "hp": s["hp"], "damage": s["attackdamage"], "mana": s["mp"], "armor": s["armor"], "magicResist": s["spellblock"], "speed": s["movespeed"] * UNIT_SCALE, "attackSpeed": s["attackspeed"], "resourceType": "energy" if key == "LeeSin" else "none" if key == "Garen" else "mana", "originalStats": s, "source": c["source"], "sourcePointer": c["sourcePointer"], "sourceHash": c["sourceHash"], "passive": {"name": c["passiveName"], "description": cfg["passiveDescription"], "behaviorEvidence": "project_reconstruction"}, "skills": {sp["slot"]: skill_template(sp, cfg["skills"][sp["slot"]], key) for sp in c["spells"]}, "behaviorEvidence": "project_reconstruction", "statsEvidence": "official_static_values"}
        heroes.append(hero)
    for c in champions:
        c.setdefault("playableId", None)
    shop = []
    for i in SHOP_IDS:
        item = item_map[i]
        assert item["srCandidate"] and item["maps"].get("11") is True, item["id"]
        assert all(int(x.removeprefix("lol_")) in SHOP_IDS for x in item["components"]), item["id"]
        shop.append(mapped_item(item, snapshot["itemEvidence"].get(str(i), {})))
    supported = {i["id"] for i in shop}
    for item in items:
        item["playable"] = item["id"] in supported
    assert len(champions) == 173 and sum(len(c["spells"]) for c in champions) == 692
    assert len(items) == 863 and len(shop) == 25 and len(heroes) == 6
    return {"version": VERSION, "publicPatch": "26.22", "unitScale": UNIT_SCALE, "profileId": "lol16.22", "champions": champions, "items": items, "playableHeroes": heroes, "shopItems": shop, "sources": snapshot["sources"], "coverage": {"champions": len(champions), "qwer": 692, "items": len(items), "playableChampions": len(heroes), "playableItems": len(shop)}, "notices": ["기본 능력치·쿨다운·비용·정적 사거리·가격은 고정된 공식 데이터에서 복원했습니다.", "공개 자료로 확정되지 않은 피해 계수·충전·시전·충돌·패시브는 이 웹 게임의 재구성 규칙입니다.", "거리·이동 속도는 월드에 맞춰 0.5배 변환합니다. 도감의 값은 원본 단위입니다.", "전체 아이템 도감에는 여러 모드 항목이 들어 있으며, 현재 구매 가능한 항목은 25종입니다.", "원본 성장 필드 0은 보존하며, 원작에서 실제 성장이 없다고 확정하지 않습니다."]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, help="Directory containing the prior reconstruction package's normalized JSON files.")
    args = parser.parse_args()
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    if args.source:
        snapshot = compact_source(args.source.resolve(), snapshot)
        SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    result = build(snapshot)
    payload = json.dumps(result, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    OUTPUT.write_text("/* Generated by scripts/import-restored-data.py. Official static values + separately labelled prototype definitions. */\n(function(root){'use strict';const data=" + payload + ";if(typeof module!=='undefined'&&module.exports)module.exports=data;root.NexusRestoredData=data;})(typeof globalThis!=='undefined'?globalThis:this);\n", encoding="utf-8")
    print(json.dumps({**result["coverage"], "output": str(OUTPUT), "bytes": OUTPUT.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
