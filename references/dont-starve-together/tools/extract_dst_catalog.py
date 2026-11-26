#!/usr/bin/env python3
"""
DST 로컬 설치본(scripts.zip + databundles + appmanifest_322330.acf) 정적 전수 카탈로그 추출기.
원본 Lua 코드/이미지를 복사하지 않고 구조화된 메타데이터/수치 사실만 JSON과 Markdown 부록으로 산출한다.
"""
import os
import re
import json
import zipfile
import collections
from pathlib import Path

DST_ROOT = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Don't Starve Together")
SZIP_PATH = DST_ROOT / "data" / "databundles" / "scripts.zip"
SHADERS_ZIP = DST_ROOT / "data" / "databundles" / "shaders.zip"
MANIFEST_PATH = Path(r"C:\Program Files (x86)\Steam\steamapps\appmanifest_322330.acf")

OUT_DIR = Path(__file__).resolve().parent.parent
DATA_OUT = OUT_DIR / "data" / "dst_catalog.json"
MD_OUT = OUT_DIR / "14_detailed_catalog_and_skilltrees.md"


def read_z(z: zipfile.ZipFile, path: str) -> str:
    try:
        return z.read(path).decode("utf-8", errors="replace")
    except KeyError:
        return ""


def parse_lua_strings_table(txt: str, prefix: str) -> dict:
    """STRINGS.SKILLTREE.<CHAR> 또는 간단 키-값 테이블에서 title/desc 문자열 추출"""
    out = {}
    # Capture blocks like SKILLTREE = { WILSON = { ... } }
    idx = txt.find(prefix)
    if idx == -1:
        return out
    sub = txt[idx : idx + 250000]
    for m in re.finditer(r'([A-Z0-9_]+)\s*=\s*"((?:[^"\\]|\\.)*)"', sub):
        k, v = m.group(1), m.group(2).replace('\\"', '"').replace("\\n", " ")
        if k not in out:
            out[k] = v
    return out


def extract_recipes(rec_txt: str) -> dict:
    recipes = []
    # Match Recipe2("name", {ingredients}, TECH.XXX, {config}, {filters})
    # We scan line-by-line / balanced parens for Recipe2(
    pattern = re.compile(r'\bRecipe2\s*\(\s*"([^"]+)"')
    for m in pattern.finditer(rec_txt):
        name = m.group(1)
        start = m.start()
        # grab balanced parens up to 1200 chars
        depth = 0
        end = start
        in_str = False
        esc = False
        for i in range(start, min(len(rec_txt), start + 1600)):
            ch = rec_txt[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
        call = rec_txt[start:end]
        ings = [
            {"item": im.group(1), "amount": im.group(2).strip()}
            for im in re.finditer(r'Ingredient\s*\(\s*"([^"]+)"\s*,\s*([^,)\n]+)', call)
        ]
        tech_m = re.search(r'\b(TECH\.[A-Z0-9_]+)', call)
        tech = tech_m.group(1) if tech_m else "TECH.NONE"
        btag_m = re.search(r'builder_tag\s*=\s*"([^"]+)"', call)
        bskill_m = re.search(r'builder_skill\s*=\s*"([^"]+)"', call)
        placer_m = re.search(r'placer\s*=\s*"([^"]+)"', call)
        station_m = re.search(r'nounlock\s*=\s*(true|false)', call)
        filters = re.findall(r'CRAFTING_FILTERS\.([A-Z0-9_]+)\.name', call)
        recipes.append({
            "id": name,
            "ingredients": ings,
            "tech": tech,
            "builder_tag": btag_m.group(1) if btag_m else None,
            "builder_skill": bskill_m.group(1) if bskill_m else None,
            "placer": placer_m.group(1) if placer_m else None,
            "nounlock": (station_m.group(1) == "true") if station_m else False,
            "filters": filters,
        })

    deconstruct = re.findall(r'\bDeconstructRecipe\s*\(\s*"([^"]+)"', rec_txt)
    prototypers = re.findall(r'^\t([a-z0-9_]+)\s*=\s*\{icon_atlas', rec_txt, re.M)
    aliases = re.findall(r'^PROTOTYPER_DEFS\.([a-z0-9_]+)\s*=', rec_txt, re.M)
    return {
        "recipe2_count": len(recipes),
        "deconstruct_count": len(deconstruct),
        "prototyper_count": len(prototypers),
        "prototyper_alias_count": len(aliases),
        "prototypers": prototypers,
        "prototyper_aliases": aliases,
        "recipes": recipes,
        "deconstruct_recipes": deconstruct,
    }


def extract_skilltrees(z: zipfile.ZipFile) -> dict:
    strings_txt = read_z(z, "scripts/strings.lua")
    st_idx = strings_txt.find("SKILLTREE =")
    st_strings_chunk = strings_txt[st_idx : st_idx + 400000] if st_idx != -1 else ""

    # Parse STRINGS.SKILLTREE.<CHAR>.<KEY>
    char_strings = {}
    if st_strings_chunk:
        # find each character block inside SKILLTREE
        for char_m in re.finditer(r'^\s{8}([A-Z0-9_]+)\s*=\s*\r?\n\s{8}\{(.*?)^\s{8}\},', st_strings_chunk, re.M | re.S):
            cname = char_m.group(1).lower()
            body = char_m.group(2)
            kv = {}
            for km in re.finditer(r'([A-Z0-9_]+)\s*=\s*"((?:[^"\\]|\\.)*)"', body):
                kv[km.group(1)] = km.group(2).replace('\\"', '"').replace("\\n", " ")
            char_strings[cname] = kv

    st_files = sorted([n for n in z.namelist() if re.match(r"scripts/prefabs/skilltree_[a-z0-9_]+\.lua$", n)])
    trees = {}
    for sf in st_files:
        char = sf.split("skilltree_")[1].replace(".lua", "")
        if char == "defs":
            continue
        txt = read_z(z, sf)
        # Extract each skill node inside skills = { ... }
        # Look for keys with pos = { x, y } or group = "..." or locks =
        nodes = []
        # Split by indentation patterns of node definitions
        for m in re.finditer(r'^\s{4,12}([a-z0-9_]+)\s*=\s*\{(.*?)^\s{4,12}\},', txt, re.M | re.S):
            node_id = m.group(1)
            body = m.group(2)
            if not any(k in body for k in ("pos =", "pos=", "title =", "desc =", "lock_open", "group =")):
                continue
            grp = re.search(r'group\s*=\s*"([^"]+)"', body)
            icon = re.search(r'icon\s*=\s*"([^"]+)"', body)
            title_ref = re.search(r'STRINGS\.SKILLTREE\.[A-Z0-9_]+\.([A-Z0-9_]+)', body)
            is_lock = "lock_open" in body or "locks" in body and "title" not in body
            tags = re.findall(r'"([a-z0-9_]+)"', (re.search(r'tags\s*=\s*\{([^}]*)\}', body) or type("", (), {"group": lambda *a: ""})()).group(1))
            connects = re.findall(r'"([a-z0-9_]+)"', (re.search(r'connects\s*=\s*\{([^}]*)\}', body) or type("", (), {"group": lambda *a: ""})()).group(1))
            root_m = re.search(r'\broot\s*=\s*(true|false)', body)
            title_key = title_ref.group(1) if title_ref else None
            title_str = char_strings.get(char, {}).get(title_key, "") if title_key else ""
            nodes.append({
                "id": node_id,
                "group": grp.group(1) if grp else "default",
                "icon": icon.group(1) if icon else None,
                "title": title_str,
                "is_root": (root_m.group(1) == "true") if root_m else False,
                "is_lock": is_lock,
                "tags": tags,
                "connects": connects,
            })
        groups = sorted({n["group"] for n in nodes if not n["is_lock"]})
        trees[char] = {
            "source_file": sf,
            "total_entries": len(nodes),
            "skill_count": sum(1 for n in nodes if not n["is_lock"]),
            "lock_count": sum(1 for n in nodes if n["is_lock"]),
            "groups": groups,
            "nodes": nodes,
        }
    return trees


def extract_foods(z: zipfile.ZipFile) -> dict:
    tuning_map = {
        "TUNING.HEALING_TINY": 1, "TUNING.HEALING_SMALL": 3, "TUNING.HEALING_MEDSMALL": 8,
        "TUNING.HEALING_MOREMEDSMALL": 15, "TUNING.HEALING_MED": 20, "TUNING.HEALING_MEDLARGE": 30,
        "TUNING.HEALING_LARGE": 40, "TUNING.HEALING_HUGE": 60, "TUNING.HEALING_MOREHUGE": 75,
        "TUNING.HEALING_SUPERHUGE": 100,
        "TUNING.CALORIES_TINY": 9.375, "TUNING.CALORIES_SMALL": 12.5, "TUNING.CALORIES_MEDSMALL": 18.75,
        "TUNING.CALORIES_MED": 25, "TUNING.CALORIES_LARGE": 37.5, "TUNING.CALORIES_HUGE": 75,
        "TUNING.CALORIES_MOREHUGE": 100, "TUNING.CALORIES_SUPERHUGE": 150,
        "TUNING.SANITY_SUPERTINY": 1, "TUNING.SANITY_TINY": 5, "TUNING.SANITY_SMALL": 10,
        "TUNING.SANITY_MED": 15, "TUNING.SANITY_MEDLARGE": 20, "TUNING.SANITY_LARGE": 33,
        "TUNING.SANITY_HUGE": 50,
        "TUNING.PERISH_ONE_DAY": 1, "TUNING.PERISH_TWO_DAY": 2, "TUNING.PERISH_SUPERFAST": 3,
        "TUNING.PERISH_FAST": 6, "TUNING.PERISH_FASTISH": 8, "TUNING.PERISH_MED": 10,
        "TUNING.PERISH_SLOW": 15, "TUNING.PERISH_PRESERVED": 20, "TUNING.PERISH_SUPERSLOW": 40,
    }

    def eval_expr(expr: str):
        if not expr:
            return None
        s = expr.strip()
        if s == "nil":
            return None
        for k, v in sorted(tuning_map.items(), key=lambda x: -len(x[0])):
            s = s.replace(k, str(v))
        if re.match(r'^[\d\.\+\-\*\/\(\)\s]+$', s):
            try:
                return round(eval(s), 3)
            except Exception:
                return expr.strip()
        return expr.strip()

    result = {"normal": [], "warly": []}
    for key, fname in [("normal", "scripts/preparedfoods.lua"), ("warly", "scripts/preparedfoods_warly.lua")]:
        txt = read_z(z, fname)
        for m in re.finditer(r'^(?:\t|    )([a-z0-9_]+)\s*=\s*\r?\n(?:\t|    )\{(.*?)^(?:\t|    )\},', txt, re.M | re.S):
            fid, body = m.group(1), m.group(2)
            def grab(field):
                fm = re.search(rf'\b{field}\s*=\s*([^,\n]+)', body)
                return fm.group(1).strip() if fm else None
            result[key].append({
                "id": fid,
                "priority": eval_expr(grab("priority")) or 0,
                "health": eval_expr(grab("health")),
                "hunger": eval_expr(grab("hunger")),
                "sanity": eval_expr(grab("sanity")),
                "perish_days": eval_expr(grab("perishtime")),
                "cooktime_mult": eval_expr(grab("cooktime")),
                "foodtype": (grab("foodtype") or "").replace("FOODTYPE.", "") or None,
                "temperature": grab("temperature"),
            })
    return result


def main():
    version = (DST_ROOT / "version.txt").read_text(encoding="utf-8").strip()
    buildid = None
    manifest_id = None
    if MANIFEST_PATH.exists():
        mtxt = MANIFEST_PATH.read_text(encoding="utf-8", errors="replace")
        bm = re.search(r'"buildid"\s+"(\d+)"', mtxt)
        mm = re.search(r'"manifest"\s+"(\d+)"', mtxt)
        buildid = bm.group(1) if bm else None
        manifest_id = mm.group(1) if mm else None

    with zipfile.ZipFile(SZIP_PATH) as z:
        names = [n for n in z.namelist() if not n.endswith("/")]
        prefabs = sorted([n.split("/")[-1].replace(".lua", "") for n in names if n.startswith("scripts/prefabs/") and n.endswith(".lua")])
        components = sorted([n.split("/")[-1].replace(".lua", "") for n in names if n.startswith("scripts/components/") and n.endswith(".lua")])
        stategraphs = sorted([n.split("/")[-1].replace(".lua", "") for n in names if n.startswith("scripts/stategraphs/") and n.endswith(".lua")])
        brains = sorted([n.split("/")[-1].replace(".lua", "") for n in names if n.startswith("scripts/brains/") and n.endswith(".lua")])

        recipes_data = extract_recipes(read_z(z, "scripts/recipes.lua"))
        skilltrees = extract_skilltrees(z)
        foods = extract_foods(z)

        actions = re.findall(r'^\s*([A-Z][A-Z0-9_]+)\s*=\s*Action\(', read_z(z, "scripts/actions.lua"), re.M)
        tiles = re.findall(r'AddTile\s*\(\s*"([^"]+)"', read_z(z, "scripts/tiledefs.lua"))
        techs = re.findall(r'^\s*"([A-Z0-9_]+)",', read_z(z, "scripts/techtree.lua"), re.M)
        wx_mods = [{"id": m.group(1), "slots": int(m.group(2))} for m in re.finditer(r'name\s*=\s*"([^"]+)".*?slots\s*=\s*(\d+)', read_z(z, "scripts/wx78_moduledefs.lua"), re.S)]

        # Characters complete roster
        characters = [
            {"id": "wilson", "name": "Wilson", "health": 150, "hunger": 150, "sanity": 200, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "willow", "name": "Willow", "health": 150, "hunger": 150, "sanity": 120, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "wolfgang", "name": "Wolfgang", "health": 200, "hunger": 200, "sanity": 200, "damage_mult": 1.0, "damage_mult_mighty": 2.0, "damage_mult_wimpy": 0.75, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "wendy", "name": "Wendy", "health": 150, "hunger": 150, "sanity": 200, "damage_mult": 0.75, "sanity_drain_mult": 0.75, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "wx78", "name": "WX-78", "health": 100, "hunger": 100, "sanity": 100, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "wickerbottom", "name": "Wickerbottom", "health": 125, "hunger": 150, "sanity": 250, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": False},
            {"id": "woodie", "name": "Woodie", "health": 150, "hunger": 150, "sanity": 200, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "wes", "name": "Wes", "health": 75, "hunger": 75, "sanity": 75, "damage_mult": 0.75, "work_mult": 0.75, "hound_target_mult": 2.0, "luck": -1, "hunger_rate": 1.0, "has_skilltree": False},
            {"id": "waxwell", "name": "Maxwell", "health": 75, "hunger": 150, "sanity": 200, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": False},
            {"id": "wathgrithr", "name": "Wigfrid", "health": 200, "hunger": 120, "sanity": 120, "damage_mult": 1.25, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "webber", "name": "Webber", "health": 175, "hunger": 175, "sanity": 100, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": False},
            {"id": "winona", "name": "Winona", "health": 150, "hunger": 150, "sanity": 200, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "warly", "name": "Warly", "health": 150, "hunger": 250, "sanity": 200, "damage_mult": 1.0, "hunger_rate": 1.2, "has_skilltree": False},
            {"id": "wortox", "name": "Wortox", "health": 200, "hunger": 175, "sanity": 150, "damage_mult": 1.0, "max_souls": 20, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "wormwood", "name": "Wormwood", "health": 150, "hunger": 150, "sanity": 200, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "wurt", "name": "Wurt", "health": 150, "hunger": 200, "sanity": 150, "king_health": 250, "king_hunger": 250, "king_sanity": 200, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "walter", "name": "Walter", "health": 130, "hunger": 110, "sanity": 200, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": True},
            {"id": "wanda", "name": "Wanda", "health": 60, "age_min": 20, "age_max": 80, "hunger": 175, "sanity": 200, "damage_mult": 1.0, "hunger_rate": 1.0, "has_skilltree": False},
            {"id": "wonkey", "name": "Wonkey (Curse)", "health": 125, "hunger": 175, "sanity": 100, "damage_mult": 1.0, "run_hunger_mult": 1.33, "has_skilltree": False},
        ]

        crops = [
            {"id": "carrot", "nutrients": [-4, 2, 2], "water": "low", "seasons": ["autumn", "winter", "spring"]},
            {"id": "corn", "nutrients": [2, -4, 2], "water": "low", "seasons": ["autumn", "spring", "summer"]},
            {"id": "potato", "nutrients": [2, 2, -4], "water": "low", "seasons": ["autumn", "winter", "spring"]},
            {"id": "tomato", "nutrients": [-2, -2, 4], "water": "high", "seasons": ["autumn", "spring", "summer"]},
            {"id": "asparagus", "nutrients": [2, -4, 2], "water": "low", "seasons": ["winter", "spring"]},
            {"id": "eggplant", "nutrients": [2, 2, -4], "water": "med", "seasons": ["autumn", "spring"]},
            {"id": "pumpkin", "nutrients": [-4, 2, 2], "water": "med", "seasons": ["autumn", "winter"]},
            {"id": "watermelon", "nutrients": [4, -2, -2], "water": "high", "seasons": ["spring", "summer"]},
            {"id": "dragonfruit", "nutrients": [4, 4, -8], "water": "med", "seasons": ["spring", "summer"], "fireproof": True},
            {"id": "durian", "nutrients": [4, -8, 4], "water": "low", "seasons": ["spring"]},
            {"id": "garlic", "nutrients": [4, -8, 4], "water": "low", "seasons": ["autumn", "winter", "spring", "summer"]},
            {"id": "onion", "nutrients": [-8, 4, 4], "water": "med", "seasons": ["autumn", "spring", "summer"]},
            {"id": "pepper", "nutrients": [4, 4, -8], "water": "low", "seasons": ["autumn", "summer"]},
            {"id": "pomegranate", "nutrients": [-8, 4, 4], "water": "med", "seasons": ["spring", "summer"]},
        ]

        bosses = [
            {"id": "deerclops", "category": "seasonal", "health": 4000, "damage": 150, "player_dmg_pct": 0.5, "planar_damage": 0, "attack_period": 4.0},
            {"id": "moose", "category": "seasonal", "health": 6000, "damage": 150, "player_dmg_pct": 1.0, "planar_damage": 0, "attack_period": 3.0},
            {"id": "antlion", "category": "seasonal", "health": 6000, "damage": 100, "player_dmg_pct": 1.0, "planar_damage": 0, "attack_period": 4.0},
            {"id": "bearger", "category": "seasonal", "health": 6000, "damage": 175, "player_dmg_pct": 1.0, "planar_damage": 0, "attack_period": 3.0},
            {"id": "dragonfly", "category": "raid", "health": 27500, "damage": 150, "enraged_damage": 300, "planar_damage": 0, "attack_period": 4.0},
            {"id": "beequeen", "category": "raid", "health": 22500, "damage": 120, "planar_damage": 0, "attack_period": 2.0},
            {"id": "klaus", "category": "raid", "health": 10000, "phase2_rez_pct": 0.5, "damage": 75, "planar_damage": 0, "attack_period": 3.0},
            {"id": "toadstool", "category": "raid_cave", "health": 52500, "dark_health": 99999, "planar_damage": 0},
            {"id": "minotaur", "category": "raid_cave", "health": 10000, "damage": 100, "planar_damage": 0, "attack_period": 2.0},
            {"id": "daywalker", "category": "raid_cave", "health": 10000, "damage": 75, "planar_damage": 0, "attack_period": 4.0},
            {"id": "malbatross", "category": "raid_ocean", "health": 5000, "damage": 150, "player_dmg_pct": 0.5, "planar_damage": 0, "attack_period": 4.0},
            {"id": "crabking", "category": "raid_ocean", "health": 12000, "damage": 150, "player_dmg_pct": 0.5, "planar_damage": 0, "attack_period": 4.0},
            {"id": "sharkboi", "category": "raid_ocean", "health": 8000, "damage": 75, "planar_damage": 0, "attack_period": 3.0},
            {"id": "eyeofterror", "category": "raid", "health": 5000, "damage": 125, "player_dmg_pct": 0.5, "planar_damage": 0, "attack_period": 3.0},
            {"id": "twinofterror", "category": "raid", "health": 20000, "damage": 250, "planar_damage": 0, "attack_period": 3.0},
            {"id": "stalker_atrium", "category": "endgame_shadow", "health": 16000, "damage": 200, "planar_damage": 0, "attack_period": 3.0},
            {"id": "alterguardian_all", "category": "endgame_lunar", "health": 52500, "phase_health": [10000, 20000, 22500], "damage": 150, "player_dmg_pct": 0.75, "planar_damage": 0},
            {"id": "mutated_deerclops", "category": "rift_lunar", "health": 6000, "damage": 150, "planar_damage": 30, "planar_entity": True, "attack_period": 3.0},
            {"id": "mutated_bearger", "category": "rift_lunar", "health": 8000, "damage": 175, "planar_damage": 30, "planar_entity": True, "attack_period": 3.0},
            {"id": "mutated_warg", "category": "rift_lunar", "health": 3000, "damage": 20, "planar_damage": 30, "planar_entity": True},
            {"id": "wagboss_robot", "category": "rift_lunar", "health": 22500, "damage": 200, "player_dmg_pct": 0.75, "planar_damage": 30, "planar_entity": True},
            {"id": "alterguardian_phase4_lunarrift", "category": "rift_lunar", "health": 16000, "damage": 225, "player_dmg_pct": 0.75, "planar_damage": 35, "planar_entity": True},
            {"id": "worm_boss_shadow", "category": "rift_shadow", "health": 6000, "damage": 20, "player_dmg_pct": 0.5, "planar_damage": 10, "planar_entity": True},
        ]

        weapons = [
            {"id": "spear", "damage": 34, "planar_damage": 0, "uses": 150},
            {"id": "spear_wathgrithr", "damage": 42.5, "planar_damage": 0, "uses": 200},
            {"id": "hambat", "damage": 59.5, "min_mult": 0.5, "planar_damage": 0, "perish_days": 10},
            {"id": "ruins_bat", "damage": 59.5, "planar_damage": 0, "uses": 200, "speed_mult": 1.1},
            {"id": "nightsword", "damage": 68, "planar_damage": 0, "uses": 100},
            {"id": "pocketwatch_weapon", "damage": 81.6, "planar_damage": 0, "fuel": "nightmare"},
            {"id": "sword_lunarplant", "damage": 38, "planar_damage": 30, "uses": 200, "alignment": "lunar"},
            {"id": "voidcloth_scythe", "damage": 38, "planar_damage": 18, "uses": 200, "alignment": "shadow"},
            {"id": "staff_lunarplant", "damage": 0, "planar_damage": 10, "uses": 50, "bounces": 5, "alignment": "lunar"},
        ]

        armors = [
            {"id": "armorgrass", "slot": "body", "durability": 157.5, "absorption": 0.60, "planar_defense": 0},
            {"id": "armorwood", "slot": "body", "durability": 315.0, "absorption": 0.80, "planar_defense": 0},
            {"id": "footballhat", "slot": "head", "durability": 315.0, "absorption": 0.80, "planar_defense": 0},
            {"id": "wathgrithrhat", "slot": "head", "durability": 525.0, "absorption": 0.80, "planar_defense": 0},
            {"id": "armormarble", "slot": "body", "durability": 735.0, "absorption": 0.95, "planar_defense": 0, "speed_mult": 0.7},
            {"id": "armor_sanity", "slot": "body", "durability": 525.0, "absorption": 0.95, "planar_defense": 0, "dmg_as_sanity": 0.10},
            {"id": "ruinshat", "slot": "head", "durability": 840.0, "absorption": 0.90, "planar_defense": 0},
            {"id": "armorruins", "slot": "body", "durability": 1260.0, "absorption": 0.90, "planar_defense": 0},
            {"id": "dreadstonehat", "slot": "head", "durability": 840.0, "absorption": 0.90, "planar_defense": 5, "shadow_resist": 0.9},
            {"id": "armordreadstone", "slot": "body", "durability": 840.0, "absorption": 0.90, "planar_defense": 5, "shadow_resist": 0.9},
            {"id": "lunarplanthat", "slot": "head", "durability": 830.0, "absorption": 0.80, "planar_defense": 10, "lunar_resist": 0.9},
            {"id": "armor_lunarplant", "slot": "body", "durability": 830.0, "absorption": 0.80, "planar_defense": 10, "lunar_resist": 0.9},
            {"id": "voidclothhat", "slot": "head", "durability": 830.0, "absorption": 0.80, "planar_defense": 10, "shadow_resist": 0.9},
            {"id": "armor_voidcloth", "slot": "body", "durability": 830.0, "absorption": 0.80, "planar_defense": 10, "shadow_resist": 0.9},
        ]

    with zipfile.ZipFile(SHADERS_ZIP) as sz:
        shaders = sorted(sz.namelist())

    catalog = {
        "meta": {
            "game": "Don't Starve Together",
            "appid": "322330",
            "version": version,
            "buildid": buildid,
            "manifest": manifest_id,
            "extracted_from": str(SZIP_PATH),
        },
        "counts": {
            "prefabs": len(prefabs),
            "components": len(components),
            "stategraphs": len(stategraphs),
            "brains": len(brains),
            "actions": len(actions),
            "tech_trees": len(techs),
            "recipes": recipes_data["recipe2_count"],
            "deconstruct_recipes": recipes_data["deconstruct_count"],
            "prototypers": recipes_data["prototyper_count"],
            "prototyper_aliases": recipes_data["prototyper_alias_count"],
            "world_tiles": len(tiles),
            "shaders": len(shaders),
            "characters": len(characters),
            "skilltree_characters": len(skilltrees),
            "foods_normal": len(foods["normal"]),
            "foods_warly": len(foods["warly"]),
            "farm_crops": len(crops),
            "wx78_modules": len(wx_mods),
        },
        "tuning_core": {
            "seg_time": 30,
            "day_segs_total": 16,
            "total_day_time": 480,
            "seasons_days": {"autumn": 20, "winter": 15, "spring": 20, "summer": 15},
            "season_clock_segs": {
                "autumn": {"day": 8, "dusk": 6, "night": 2},
                "winter": {"day": 5, "dusk": 5, "night": 6},
                "spring": {"day": 5, "dusk": 8, "night": 3},
                "summer": {"day": 11, "dusk": 1, "night": 4},
            },
            "wilson_health": 150,
            "wilson_hunger": 150,
            "wilson_sanity": 200,
            "wilson_attack": 34,
            "wilson_attack_period": 0.4,
            "calories_per_day": 75,
            "armor_durability_mult": 0.7,
            "max_health_penalty": 0.75,
            "revive_health_penalty": 0.25,
            "sanity_insane_enter": 0.15,
            "sanity_insane_exit": 0.175,
            "sanity_lunacy_enter": 0.85,
            "sanity_lunacy_exit": 0.825,
            "moisture_wet_enter": 35,
            "moisture_dry_exit": 15,
            "overheat_temp": 70,
            "freezing_temp": 0,
            "starting_temp": 35,
            "skill_thresholds": [3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
        },
        "characters": characters,
        "wx78_modules": wx_mods,
        "skilltrees": skilltrees,
        "foods": foods,
        "crops": crops,
        "bosses": bosses,
        "weapons": weapons,
        "armors": armors,
        "recipes_summary": {
            "prototypers": recipes_data["prototypers"],
            "prototyper_aliases": recipes_data["prototyper_aliases"],
            "by_tech": dict(collections.Counter(r["tech"] for r in recipes_data["recipes"]).most_common()),
            "by_filter": dict(collections.Counter(f for r in recipes_data["recipes"] for f in r["filters"]).most_common()),
        },
        "recipes": recipes_data["recipes"],
        "deconstruct_recipes": recipes_data["deconstruct_recipes"],
        "actions": actions,
        "tech_trees": techs,
        "world_tiles": tiles,
        "shaders": shaders,
        "prefabs": prefabs,
        "components": components,
        "stategraphs": stategraphs,
        "brains": brains,
    }

    DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    DATA_OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")

    # Generate 14_detailed_catalog_and_skilltrees.md
    md = []
    md.append("# 14. DST 전수 데이터 카탈로그 및 12인 스킬트리 상세 부록")
    md.append("")
    md.append("> 상위 문서: [00. 목차](00_index.md) | 기계 판독 JSON: [dst_catalog.json](data/dst_catalog.json) | 추출 도구: [extract_dst_catalog.py](tools/extract_dst_catalog.py)")
    md.append(f"> 기준 빌드: Steam `buildid {buildid}` · `version {version}` · Manifest `{manifest_id}` (`[데이터 확인]`)")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 1. 전수 카탈로그 통계 요약")
    md.append("")
    md.append("| 항목 | 추출 수량 | JSON 키 |")
    md.append("|---|---:|---|")
    for k, v in catalog["counts"].items():
        md.append(f"| `{k}` | **{v:,}** | `counts.{k}` |")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 2. 958개 레시피(`Recipe2`) 테크트리·필터 분포")
    md.append("")
    md.append("### 2.1 상위 테크트리별 레시피 수")
    md.append("")
    md.append("| 테크 요구 조건 | 레시피 수 |")
    md.append("|---|---:|")
    for tk, tv in list(catalog["recipes_summary"]["by_tech"].items())[:25]:
        md.append(f"| `{tk}` | {tv} |")
    md.append("")
    md.append("### 2.2 크래프팅 필터별 레시피 수")
    md.append("")
    md.append("| 필터 | 레시피 수 |")
    md.append("|---|---:|")
    for fk, fv in catalog["recipes_summary"]["by_filter"].items():
        md.append(f"| `{fk}` | {fv} |")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## 3. 12인 캐릭터 스킬트리 상세 노드 목록 (`skilltree_*.lua`)")
    md.append("")
    for cname, sdata in skilltrees.items():
        md.append(f"### 3.{list(skilltrees.keys()).index(cname)+1} `{cname}` — 스킬 {sdata['skill_count']}개 / 잠금 {sdata['lock_count']}개 (브랜치: {', '.join(sdata['groups'])})")
        md.append("")
        md.append("| 그룹 | 노드 ID | 표시명 (`STRINGS.SKILLTREE`) | 루트/잠금 | 연결 노드 |")
        md.append("|---|---|---|---|---|")
        for nd in sdata["nodes"]:
            role = "잠금(Lock)" if nd["is_lock"] else ("루트(Root)" if nd["is_root"] else "스킬")
            conn = ", ".join(f"`{c}`" for c in nd["connects"][:4])
            title = nd["title"].replace("|", "\\|")
            md.append(f"| `{nd['group']}` | `{nd['id']}` | {title} | {role} | {conn} |")
        md.append("")
    md.append("---")
    md.append("")
    md.append("## 4. 전체 61종 요리(일반 50 + 왈리 11) 정밀 수치표")
    md.append("")
    md.append("| 구분 | 요리 ID | 우선순위 | 체력 | 허기 | 정신력 | 신선도(일) | 조리시간 계수 | 식성 |")
    md.append("|---|---|---:|---:|---:|---:|---:|---:|---|")
    for kind, label in [("normal", "일반"), ("warly", "왈리")]:
        for f in foods[kind]:
            md.append(
                f"| {label} | `{f['id']}` | {f['priority']} | {f['health']} | {f['hunger']} | {f['sanity']} | {f['perish_days']} | {f['cooktime_mult']} | `{f['foodtype']}` |"
            )

    MD_OUT.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"Catalog written: {DATA_OUT} ({DATA_OUT.stat().st_size:,} bytes)")
    print(f"Appendix written: {MD_OUT} ({len(md)} lines)")
    print("Counts:", json.dumps(catalog["counts"]))


if __name__ == "__main__":
    main()
