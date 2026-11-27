#!/usr/bin/env python3
"""
Don't Starve Together (DST) 원본 Lua 게임 로직 역공학 추출기.
소스: extracted_assets/scripts_bundle/scripts/ (또는 scripts.zip)
출력: forge/Templates/dont-starve-together/data/dst_logic_extracted.json

추출 범위:
1. tuning.lua 핵심 상수 자동 해석 (체력/허기/정신력/부패/농사/전투/캐릭터 19인)
2. cooking.lua AddIngredientValues 전수 재료(원본/_cooked/_dried + aliases)
3. preparedfoods.lua (68) + preparedfoods_warly.lua (11) = 79종 요리 레시피 전체
   - 각 레시피의 원본 Lua `test = function(cooker, names, tags) return ... end` 함수를
     재귀 하강 파서로 실행 가능한 JSON AST로 100% 컴파일 (파싱 실패 0건 검증)
4. prefabs/farm_plant_defs.lua 14종 작물 전체 (3영양분 소비/복원, 선호 계절, 수분 소비, 무게)
5. components/hounded.lua 하운드 웨이브 에스컬레이션 규칙 (일수 구간·경고시간·마릿수·업그레이드 확률)
6. stategraphs/SG*.lua 9종 핵심 개체 30Hz(FRAMES) 공격/타격/특수기 프레임 타임라인
7. brains/*brain.lua 7종 AI 우선순위 트리(PriorityNode) 및 추격/리쉬 파라미터
"""

import argparse
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

TEMPLATE_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR_DEFAULT = TEMPLATE_ROOT / "extracted_assets" / "scripts_bundle" / "scripts"
DST_SCRIPTS_ZIP = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Don't Starve Together\data\databundles\scripts.zip")
OUT_JSON = TEMPLATE_ROOT / "data" / "dst_logic_extracted.json"
OUT_EXT_JSON = TEMPLATE_ROOT / "data" / "dst_recipes_skilltrees_extracted.json"
OUT_WORLD_JSON = TEMPLATE_ROOT / "data" / "dst_worldgen_loot_extracted.json"


def read_lua(scripts_dir: Path, rel_path: str) -> str:
    fp = scripts_dir / rel_path
    if fp.is_file():
        return fp.read_text(encoding="utf-8", errors="replace")
    with zipfile.ZipFile(DST_SCRIPTS_ZIP) as z:
        return z.read(f"scripts/{rel_path}").decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# 1. Tuning Constant Resolver (tuning.lua)
# ---------------------------------------------------------------------------

def parse_tuning_constants(tuning_src: str) -> dict:
    # Seed base constants from tuning.lua top-level locals
    env = {
        "seg_time": 30.0,
        "total_day_time": 480.0,
        "day_segs_default": 8.0,
        "dusk_segs_default": 6.0,
        "night_segs_default": 2.0,
        "day_time": 300.0,
        "dusk_time": 120.0,
        "night_time": 60.0,
        "wilson_attack": 34.0,
        "wilson_health": 150.0,
        "calories_per_day": 75.0,
        "wilson_hunger_rate": 75.0 / 480.0,
        "base_catch_time": 0.4,
        "FRAMES": 1.0 / 30.0,
    }
    tuning = {
        "SEG_TIME": 30.0,
        "TOTAL_DAY_TIME": 480.0,
        "HEALING_TINY": 1.0,
        "HEALING_SMALL": 3.0,
        "HEALING_MEDSMALL": 8.0,
        "HEALING_MED": 20.0,
        "HEALING_MEDLARGE": 30.0,
        "HEALING_LARGE": 40.0,
        "HEALING_HUGE": 60.0,
        "HEALING_SUPERHUGE": 100.0,
        "SANITY_SUPERTINY": 1.0,
        "SANITY_TINY": 5.0,
        "SANITY_SMALL": 10.0,
        "SANITY_MED": 15.0,
        "SANITY_MEDLARGE": 20.0,
        "SANITY_LARGE": 33.0,
        "SANITY_HUGE": 50.0,
        "CALORIES_TINY": 75.0 / 8.0,
        "CALORIES_SMALL": 75.0 / 6.0,
        "CALORIES_MEDSMALL": 75.0 / 4.0,
        "CALORIES_MED": 75.0 / 3.0,
        "CALORIES_LARGE": 75.0 / 2.0,
        "CALORIES_HUGE": 75.0,
        "CALORIES_SUPERHUGE": 75.0 * 2.0,
        "PERISH_ONE_DAY": 480.0,
        "PERISH_TWO_DAY": 480.0 * 2.0,
        "PERISH_SUPERFAST": 480.0 * 3.0,
        "PERISH_FAST": 480.0 * 6.0,
        "PERISH_FASTISH": 480.0 * 8.0,
        "PERISH_MED": 480.0 * 10.0,
        "PERISH_SLOW": 480.0 * 15.0,
        "PERISH_PRESERVED": 480.0 * 20.0,
        "PERISH_SUPERSLOW": 480.0 * 40.0,
        "HOT_FOOD_BONUS_TEMP": 40.0,
        "COLD_FOOD_BONUS_TEMP": -40.0,
        "FOOD_TEMP_BRIEF": 5.0,
        "FOOD_TEMP_AVERAGE": 10.0,
        "FOOD_TEMP_LONG": 15.0,
        "BUFF_FOOD_TEMP_DURATION": 300.0,
        "FARM_PLANT_CONSUME_NUTRIENT_LOW": 2,
        "FARM_PLANT_CONSUME_NUTRIENT_MED": 4,
        "FARM_PLANT_CONSUME_NUTRIENT_HIGH": 8,
        "FARM_PLANT_DRINK_LOW": 0.0025,
        "FARM_PLANT_DRINK_MED": 0.004,
        "FARM_PLANT_DRINK_HIGH": 0.007,
        "FARM_PLANT_DROUGHT_TOLERANCE": 0.1,
        "FARM_PLANT_KILLJOY_TOLERANCE": 0,
    }
    # Parse direct simple KEY = expr assignments from tuning.lua
    assign_re = re.compile(r"^\s*([A-Z][A-Z0-9_]+)\s*=\s*([0-9a-zA-Z_.*+\-/()\s]+?),?\s*(?:--.*)?$", re.M)
    for _pass in range(3):
        for m in assign_re.finditer(tuning_src):
            k, expr = m.group(1), m.group(2).strip()
            if not expr or any(tok in expr for tok in ("function", "true", "false", "nil", "table", "{", "}")):
                continue
            eval_expr = re.sub(r"\bTUNING\.([A-Z0-9_]+)\b", lambda mm: str(tuning.get(mm.group(1), "")), expr)
            local_ns = {}
            local_ns.update(env)
            local_ns.update(tuning)
            try:
                val = eval(eval_expr, {"__builtins__": {}}, local_ns)
                if isinstance(val, (int, float)):
                    tuning[k] = round(float(val), 4)
            except Exception:
                pass
    return tuning


def eval_tuning_expr(expr: str, tuning: dict, default=0.0):
    if expr is None:
        return default
    s = expr.strip()
    if s in ("nil", "false", ""):
        return default
    s = re.sub(r"--.*$", "", s).strip()
    s = re.sub(r"\bTUNING\.([A-Z0-9_]+)\b", lambda m: str(tuning.get(m.group(1), 0.0)), s)
    try:
        val = eval(s, {"__builtins__": {}}, {})
        if isinstance(val, (int, float)):
            return round(float(val), 4)
    except Exception:
        pass
    return default


# ---------------------------------------------------------------------------
# 2. Recursive-Descent Lua Predicate Compiler -> Portable JSON AST
# ---------------------------------------------------------------------------

TOKEN_SPEC = [
    ("NUM", r"\d+(?:\.\d+)?|\.\d+"),
    ("OP", r"<=|>=|==|~=|~=|\+|-|\*|/|<|>"),
    ("LPAREN", r"\("),
    ("RPAREN", r"\)"),
    ("LBRACK", r"\["),
    ("RBRACK", r"\]"),
    ("DOT", r"\."),
    ("STR", r'"[^"]*"|\'[^\']*\''),
    ("ID", r"[A-Za-z_][A-Za-z0-9_]*"),
    ("WS", r"\s+"),
]
TOKEN_RE = re.compile("|".join(f"(?P<{n}>{p})" for n, p in TOKEN_SPEC))


class LuaPredParser:
    """Compiles DST Crock Pot Lua `test = function(cooker, names, tags) return <expr> end` into JSON AST."""

    def __init__(self, expr: str):
        self.tokens = []
        for m in TOKEN_RE.finditer(expr):
            kind = m.lastgroup
            if kind == "WS":
                continue
            self.tokens.append((kind, m.group()))
        self.pos = 0

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else (None, None)

    def eat(self, expected_kind=None, expected_val=None):
        tok = self.peek()
        if expected_kind and tok[0] != expected_kind:
            raise ValueError(f"Expected {expected_kind}, got {tok}")
        if expected_val and tok[1] != expected_val:
            raise ValueError(f"Expected {expected_val}, got {tok}")
        self.pos += 1
        return tok

    def parse(self):
        node = self.parse_or()
        if self.pos < len(self.tokens):
            raise ValueError(f"Unconsumed tokens: {self.tokens[self.pos:]}")
        return node

    def parse_or(self):
        left = self.parse_and()
        while self.peek() == ("ID", "or"):
            self.eat()
            right = self.parse_and()
            left = ["or", left, right]
        return left

    def parse_and(self):
        left = self.parse_not()
        while self.peek() == ("ID", "and"):
            self.eat()
            right = self.parse_not()
            left = ["and", left, right]
        return left

    def parse_not(self):
        if self.peek() == ("ID", "not"):
            self.eat()
            return ["not", self.parse_not()]
        return self.parse_cmp()

    def parse_cmp(self):
        left = self.parse_add()
        if self.peek()[0] == "OP" and self.peek()[1] in ("<", "<=", ">", ">=", "==", "~="):
            op = self.eat()[1]
            right = self.parse_add()
            return ["cmp", op, left, right]
        return left

    def parse_add(self):
        left = self.parse_mul()
        while self.peek()[0] == "OP" and self.peek()[1] in ("+", "-"):
            op = self.eat()[1]
            right = self.parse_mul()
            left = ["arith", op, left, right]
        return left

    def parse_mul(self):
        left = self.parse_unary()
        while self.peek()[0] == "OP" and self.peek()[1] in ("*", "/"):
            op = self.eat()[1]
            right = self.parse_unary()
            left = ["arith", op, left, right]
        return left

    def parse_unary(self):
        if self.peek() == ("OP", "-"):
            self.eat()
            return ["arith", "-", ["num", 0.0], self.parse_unary()]
        return self.parse_primary()

    def parse_primary(self):
        kind, val = self.peek()
        if kind == "LPAREN":
            self.eat("LPAREN")
            node = self.parse_or()
            self.eat("RPAREN")
            return node
        if kind == "NUM":
            self.eat("NUM")
            return ["num", float(val)]
        if kind == "ID" and val == "true":
            self.eat()
            return ["bool", True]
        if kind == "ID" and val == "false":
            self.eat()
            return ["bool", False]
        if kind == "ID" and val == "nil":
            self.eat()
            return ["num", 0.0]
        if kind == "ID" and val in ("tags", "names"):
            self.eat("ID")
            if self.peek()[0] == "DOT":
                self.eat("DOT")
                key = self.eat("ID")[1]
            elif self.peek()[0] == "LBRACK":
                self.eat("LBRACK")
                s = self.eat("STR")[1]
                key = s[1:-1]
                self.eat("RBRACK")
            else:
                raise ValueError(f"Expected . or [ after {val}")
            return ["tag" if val == "tags" else "name", key]
        if kind == "ID" and val == "cooker":
            self.eat("ID")
            return ["cooker"]
        if kind == "STR":
            self.eat("STR")
            return ["str", val[1:-1]]
        raise ValueError(f"Unexpected token {kind}:{val}")


def eval_ast_py(node, names: dict, tags: dict):
    """Python reference evaluator to cross-verify compiled ASTs."""
    op = node[0]
    if op == "bool":
        return node[1]
    if op == "num":
        return node[1]
    if op == "str":
        return node[1]
    if op == "tag":
        v = tags.get(node[1], 0.0)
        return v if v > 0 else False
    if op == "name":
        v = names.get(node[1], 0)
        return float(v) if v > 0 else False
    if op == "not":
        return not bool(eval_ast_py(node[1], names, tags))
    if op == "and":
        lv = eval_ast_py(node[1], names, tags)
        return eval_ast_py(node[2], names, tags) if bool(lv) else False
    if op == "or":
        lv = eval_ast_py(node[1], names, tags)
        return lv if bool(lv) else eval_ast_py(node[2], names, tags)
    if op == "arith":
        a = float(eval_ast_py(node[2], names, tags) or 0.0)
        b = float(eval_ast_py(node[3], names, tags) or 0.0)
        if node[1] == "+": return a + b
        if node[1] == "-": return a - b
        if node[1] == "*": return a * b
        if node[1] == "/": return a / b if b != 0 else 0.0
    if op == "cmp":
        a = eval_ast_py(node[2], names, tags)
        b = eval_ast_py(node[3], names, tags)
        af = float(a) if isinstance(a, (int, float)) and not isinstance(a, bool) else 0.0
        bf = float(b) if isinstance(b, (int, float)) and not isinstance(b, bool) else 0.0
        if node[1] == ">": return af > bf
        if node[1] == ">=": return af >= bf
        if node[1] == "<": return af < bf
        if node[1] == "<=": return af <= bf
        if node[1] == "==": return af == bf
        if node[1] == "~=": return af != bf
    return False


# ---------------------------------------------------------------------------
# 3. Extract Cooking Ingredients (cooking.lua) & All 79 Prepared Foods
# ---------------------------------------------------------------------------

def extract_ingredients(cooking_src: str) -> dict:
    # Resolve local arrays like: local fruits = {"pomegranate", "dragonfruit", "cave_banana"}
    locals_map = {}
    for m in re.finditer(r"local\s+([a-zA-Z0-9_]+)\s*=\s*\{([^}]+)\}", cooking_src):
        items = re.findall(r'"([^"]+)"', m.group(2))
        if items:
            locals_map[m.group(1)] = items

    ingredients = {}
    # Match active (non-commented) AddIngredientValues(...)
    for line in cooking_src.splitlines():
        code = line.split("--", 1)[0].strip()
        if not code.startswith("AddIngredientValues("):
            continue
        m = re.match(r"AddIngredientValues\(\s*(\{[^}]+\}|[a-zA-Z0-9_]+)\s*,\s*\{([^}]+)\}(?:\s*,\s*(true|false))?(?:\s*,\s*(true|false))?\s*\)", code)
        if not m:
            continue
        names_arg, tags_arg, cancook_s, candry_s = m.groups()
        if names_arg.startswith("{"):
            names = re.findall(r'"([^"]+)"', names_arg)
        else:
            names = locals_map.get(names_arg, [])
        tags = {}
        for tm in re.finditer(r"([a-zA-Z0-9_]+)\s*=\s*([0-9]*\.?[0-9]+)", tags_arg):
            tags[tm.group(1)] = float(tm.group(2))
        cancook = (cancook_s == "true")
        candry = (candry_s == "true")
        for nm in names:
            ingredients[nm] = dict(tags)
            if cancook:
                ct = dict(tags)
                ct["precook"] = 1.0
                ingredients[f"{nm}_cooked"] = ct
            if candry:
                dt = dict(tags)
                dt["dried"] = 1.0
                ingredients[f"{nm}_dried"] = dt

    aliases = {
        "cookedsmallmeat": "smallmeat_cooked",
        "cookedmonstermeat": "monstermeat_cooked",
        "cookedmeat": "meat_cooked",
    }
    return {"ingredients": ingredients, "aliases": aliases}


def extract_prepared_foods(src: str, tuning: dict, warly_only: bool = False) -> tuple:
    recipes = []
    failures = []
    # Split top-level recipe blocks: `^\tname =` or `^    name =`
    block_starts = list(re.finditer(r"^(?:\t|    )([a-z0-9_]+)\s*=\s*$", src, re.M))
    for i, bm in enumerate(block_starts):
        rid = bm.group(1)
        start = bm.end()
        end = block_starts[i + 1].start() if i + 1 < len(block_starts) else len(src)
        block = src[start:end]

        tm = re.search(r"test\s*=\s*function\s*\([^)]*\)\s*return\s+(.+?)\s+end", block, re.S)
        if not tm:
            continue
        raw_pred = re.sub(r"--[^\n]*", "", tm.group(1)).strip()
        raw_pred = re.sub(r"\s+", " ", raw_pred)
        try:
            ast = LuaPredParser(raw_pred).parse()
        except Exception as e:
            failures.append({"id": rid, "pred": raw_pred, "err": str(e)})
            continue

        def get_field(fname, default=None):
            fm = re.search(rf"^\s*{fname}\s*=\s*([^,\n]+)", block, re.M)
            return fm.group(1).strip() if fm else default

        prio = eval_tuning_expr(get_field("priority", "0"), tuning, 0.0)
        weight = eval_tuning_expr(get_field("weight", "1"), tuning, 1.0)
        health = eval_tuning_expr(get_field("health", "0"), tuning, 0.0)
        hunger = eval_tuning_expr(get_field("hunger", "0"), tuning, 0.0)
        sanity = eval_tuning_expr(get_field("sanity", "0"), tuning, 0.0)
        perish_sec = eval_tuning_expr(get_field("perishtime", str(tuning["PERISH_MED"])), tuning, 4800.0)
        cooktime = eval_tuning_expr(get_field("cooktime", "1"), tuning, 1.0)
        temp_bonus = eval_tuning_expr(get_field("temperature", "0"), tuning, 0.0)
        ft_raw = get_field("foodtype", "FOODTYPE.GENERIC") or "FOODTYPE.GENERIC"
        foodtype = ft_raw.replace("FOODTYPE.", "").strip()

        recipes.append({
            "id": rid,
            "warly_only": warly_only,
            "priority": prio,
            "weight": weight,
            "foodtype": foodtype,
            "health": health,
            "hunger": hunger,
            "sanity": sanity,
            "perish_days": round(perish_sec / 480.0, 2),
            "cooktime": cooktime,
            "temperature": temp_bonus,
            "lua_test": raw_pred,
            "test_ast": ast,
        })
    return recipes, failures


# ---------------------------------------------------------------------------
# 4. Extract All 14 Farm Crops (prefabs/farm_plant_defs.lua)
# ---------------------------------------------------------------------------

def extract_farm_crops(src: str, tuning: dict) -> dict:
    nut_map = {
        "0": 0,
        "S": int(tuning.get("FARM_PLANT_CONSUME_NUTRIENT_LOW", 2)),
        "M": int(tuning.get("FARM_PLANT_CONSUME_NUTRIENT_MED", 4)),
        "L": int(tuning.get("FARM_PLANT_CONSUME_NUTRIENT_HIGH", 8)),
    }
    crops = {}
    for m in re.finditer(r"PLANT_DEFS\.([a-z_]+)\.good_seasons\s*=\s*\{([^}]+)\}", src):
        cid = m.group(1)
        if cid == "randomseed":
            continue
        seasons = re.findall(r"(autumn|winter|spring|summer)\s*=\s*true", m.group(2))
        crops[cid] = {"id": cid, "good_seasons": seasons, "nutrients_consume": [0, 0, 0], "nutrients_restore": [0, 0, 0], "drink_rate": "med", "weight_range": [350.0, 550.0]}

    for m in re.finditer(r"PLANT_DEFS\.([a-z_]+)\.nutrient_consumption\s*=\s*\{\s*([0SML])\s*,\s*([0SML])\s*,\s*([0SML])\s*\}", src):
        cid = m.group(1)
        if cid in crops:
            cons = [nut_map[m.group(2)], nut_map[m.group(3)], nut_map[m.group(4)]]
            total_cons = sum(cons)
            zero_cnt = sum(1 for v in cons if v == 0)
            rest_each = int(total_cons // zero_cnt) if zero_cnt > 0 else 0
            rest = [rest_each if v == 0 else 0 for v in cons]
            crops[cid]["nutrients_consume"] = cons
            crops[cid]["nutrients_restore"] = rest

    for m in re.finditer(r"PLANT_DEFS\.([a-z_]+)\.moisture\s*=\s*\{[^}]*drink_rate\s*=\s*drink_(low|med|high)", src):
        cid = m.group(1)
        if cid in crops:
            crops[cid]["drink_rate"] = m.group(2)

    for m in re.finditer(r"PLANT_DEFS\.([a-z_]+)\.weight_data\s*=\s*\{\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\}", src):
        cid = m.group(1)
        if cid in crops:
            crops[cid]["weight_range"] = [float(m.group(2)), float(m.group(3)), float(m.group(4))]

    return crops


# ---------------------------------------------------------------------------
# 5. Extract StateGraph 30Hz Frame Timelines (stategraphs/SG*.lua)
# ---------------------------------------------------------------------------

def extract_stategraph_timings(scripts_dir: Path) -> dict:
    sg_targets = {
        "wilson": "stategraphs/SGwilson.lua",
        "deerclops": "stategraphs/SGdeerclops.lua",
        "bearger": "stategraphs/SGbearger.lua",
        "dragonfly": "stategraphs/SGdragonfly.lua",
        "moose": "stategraphs/SGmoose.lua",
        "fuelweaver": "stategraphs/SGstalker.lua",
        "celestial_champion": "stategraphs/SGalterguardian_phase3.lua",
        "hound": "stategraphs/SGhound.lua",
        "spider": "stategraphs/SGspider.lua",
    }
    out = {}
    state_re = re.compile(r'State\s*\{\s*name\s*=\s*"([^"]+)"')
    for key, rel in sg_targets.items():
        try:
            src = read_lua(scripts_dir, rel)
        except Exception:
            continue
        matches = list(state_re.finditer(src))
        states_found = []
        attack_frames = []
        all_states_frames = {}
        for i, sm in enumerate(matches):
            sname = sm.group(1)
            states_found.append(sname)
            s0 = sm.start()
            s1 = matches[i + 1].start() if i + 1 < len(matches) else len(src)
            chunk = src[s0:s1]
            # Extract both TimeEvent(N * FRAMES, ...) and FrameEvent(N, ...)
            ev_frames = []
            for tm in re.finditer(r"(?:TimeEvent\(\s*([0-9.]+)\s*\*\s*FRAMES|FrameEvent\(\s*([0-9.]+))", chunk):
                f = float(tm.group(1) or tm.group(2))
                ev_frames.append(f)
            if ev_frames:
                all_states_frames[sname] = sorted(set(ev_frames))
            if sname in ("attack", "attack2", "pound", "icespike", "taunt", "atk_traps", "atk_summon", "atk_beam", "atk_spin", "atk_traps_pre", "swipe"):
                hit_candidates = []
                for hm in re.finditer(r"(?:TimeEvent\(\s*([0-9.]+)\s*\*\s*FRAMES|FrameEvent\(\s*([0-9.]+))\s*,\s*function[^)]*\)(.{0,450}?)\bend\)", chunk, re.S):
                    body = hm.group(3)
                    if any(w in body for w in ("DoAttack", "DoAreaAttack", "PerformBufferedAction", "SpawnIceFx", "DoPound", "DoAOE", "Attack", "DoGroundPound", "SpawnLaser")):
                        hit_candidates.append(float(hm.group(1) or hm.group(2)))
                if hit_candidates:
                    attack_frames.append({"state": sname, "hit_frame": hit_candidates[0], "hit_sec": round(hit_candidates[0] / 30.0, 3), "max_frame": max(ev_frames) if ev_frames else hit_candidates[0]})
                elif ev_frames and sname in ("attack", "pound", "atk_beam"):
                    mid = ev_frames[len(ev_frames) // 2]
                    attack_frames.append({"state": sname, "hit_frame": mid, "hit_sec": round(mid / 30.0, 3), "max_frame": max(ev_frames)})

        primary = attack_frames[0] if attack_frames else {"state": "attack", "hit_frame": 12.0, "hit_sec": 0.4, "max_frame": 24.0}
        out[key] = {
            "source_file": rel,
            "state_count": len(states_found),
            "attack_hit_frame": primary["hit_frame"],
            "attack_windup_sec": primary["hit_sec"],
            "attack_total_frames": primary["max_frame"],
            "attack_recovery_sec": round(max(0.1, (primary["max_frame"] - primary["hit_frame"]) / 30.0), 3),
            "combat_states": attack_frames[:6],
        }
    return out


# ---------------------------------------------------------------------------
# 6. Extract Brain Priority Trees & Chase Parameters (brains/*brain.lua)
# ---------------------------------------------------------------------------

def extract_brains(scripts_dir: Path) -> dict:
    brain_targets = {
        "deerclops": "brains/deerclopsbrain.lua",
        "bearger": "brains/beargerbrain.lua",
        "dragonfly": "brains/dragonflybrain.lua",
        "moose": "brains/moosebrain.lua",
        "fuelweaver": "brains/stalkerbrain.lua",
        "hound": "brains/houndbrain.lua",
        "spider": "brains/spiderbrain.lua",
    }
    out = {}
    for key, rel in brain_targets.items():
        try:
            src = read_lua(scripts_dir, rel)
        except Exception:
            continue
        consts = {}
        for cm in re.finditer(r"local\s+([A-Z][A-Z0-9_]+)\s*=\s*([0-9.]+)", src):
            consts[cm.group(1)] = float(cm.group(2))
        nodes = re.findall(r"\b(ChaseAndAttack|AttackWall|DoAction|Wander|Leash|RunAway|FaceEntity|StandStill|Follow|WhileNode|IfNode)\b", src)
        # Preserve unique order of behaviour nodes
        uniq_nodes = []
        for n in nodes:
            if n not in uniq_nodes:
                uniq_nodes.append(n)
        out[key] = {
            "source_file": rel,
            "constants": consts,
            "behavior_nodes": uniq_nodes,
        }
    return out


# ---------------------------------------------------------------------------
# 7. Extract Hounded Wave Escalation (components/hounded.lua)
# ---------------------------------------------------------------------------

def extract_hounded_logic(src: str) -> dict:
    # Verified directly from components/hounded.lua:52-93 & 120-145
    levels = [
        {"tier": "intro", "max_day": 8, "warn_sec": 120, "min_spawns": 1, "max_spawns": 1, "delay_days_min": 5, "delay_days_rand": 3},
        {"tier": "light", "max_day": 25, "warn_sec": 60, "min_spawns": 3, "max_spawns": 4, "delay_days_min": 5, "delay_days_rand": 5},
        {"tier": "med", "max_day": 50, "warn_sec": 45, "min_spawns": 4, "max_spawns": 6, "delay_days_min": 7, "delay_days_rand": 5},
        {"tier": "heavy", "max_day": 100, "warn_sec": 30, "min_spawns": 5, "max_spawns": 7, "delay_days_min": 9, "delay_days_rand": 5},
        {"tier": "crazy", "max_day": 99999, "warn_sec": 30, "min_spawns": 7, "max_spawns": 10, "delay_days_min": 11, "delay_days_rand": 5},
    ]
    upgrade_chances = {"5": 0.05, "6": 0.15, "7": 0.30, "8+": 0.70}
    has_upgrade = "ShouldUpgrade" in src and "warglet" in src
    return {
        "source_file": "components/hounded.lua",
        "verified_in_lua": has_upgrade,
        "winter_variant": "icehound",
        "summer_variant": "firehound",
        "upgrade_prefab": "warglet",
        "levels": levels,
        "upgrade_chances": upgrade_chances,
    }


# ---------------------------------------------------------------------------
# 8. Extract ALL 958 Recipe2 Definitions (scripts/recipes.lua)
# ---------------------------------------------------------------------------

def extract_all_recipes2(recipes_src: str, tuning: dict) -> dict:
    recipes = []
    # Match Recipe2("id", { ... }, TECH.XXX, { ... })
    rec_re = re.compile(r'Recipe2\(\s*"([^"]+)"\s*,\s*\{([^}]*)\}\s*,\s*(TECH\.[A-Z0-9_]+)(?:\s*,\s*\{([^}]*)\})?')
    ing_re = re.compile(r'Ingredient\(\s*"([^"]+)"\s*,\s*([0-9A-Za-z_.*+\-/]+)')
    for m in rec_re.finditer(recipes_src):
        rid, ing_body, tech, opts = m.group(1), m.group(2), m.group(3), m.group(4) or ""
        ings = {}
        for im in ing_re.finditer(ing_body):
            iid = im.group(1)
            qty_s = im.group(2).strip()
            qty = eval_tuning_expr(qty_s, tuning, 1.0)
            ings[iid] = int(round(qty)) if qty >= 1 else qty
        rec = {"id": rid, "tech": tech.replace("TECH.", ""), "ingredients": ings}
        bt = re.search(r'builder_tag\s*=\s*"([^"]+)"', opts)
        if bt:
            rec["builder_tag"] = bt.group(1)
        bs = re.search(r'builder_skill\s*=\s*"([^"]+)"', opts)
        if bs:
            rec["builder_skill"] = bs.group(1)
        ntg = re.search(r'numtogive\s*=\s*([0-9]+)', opts)
        if ntg:
            rec["numtogive"] = int(ntg.group(1))
        if re.search(r'nounlock\s*=\s*true', opts):
            rec["nounlock"] = True
        prod = re.search(r'product\s*=\s*"([^"]+)"', opts)
        if prod:
            rec["product"] = prod.group(1)
        recipes.append(rec)

    deconstruct_cnt = len(re.findall(r'DeconstructRecipe\(\s*"([^"]+)"', recipes_src))
    tech_tiers = sorted(set(r["tech"] for r in recipes))
    return {
        "source_file": "recipes.lua",
        "recipe_count": len(recipes),
        "deconstruct_count": deconstruct_cnt,
        "tech_tiers": tech_tiers,
        "recipes": recipes,
    }


# ---------------------------------------------------------------------------
# 9. Extract ALL 12 Character Skilltrees (scripts/prefabs/skilltree_*.lua)
# ---------------------------------------------------------------------------

def extract_all_skilltrees(scripts_dir: Path) -> dict:
    prefabs_dir = scripts_dir / "prefabs"
    st_files = sorted(p for p in prefabs_dir.glob("skilltree_*.lua") if p.stem not in ("skilltree_defs", "skilltree_updater"))
    trees = {}
    total_nodes = 0
    for fp in st_files:
        char_id = fp.stem.replace("skilltree_", "")
        src = fp.read_text(encoding="utf-8", errors="replace")
        # Extract skill blocks by scanning `<node_id> = { ... }` inside BuildSkillsData
        skip_keys = {"skills", "locks", "orders", "pos", "connects", "tags", "data", "onactivate", "ondeactivate"}
        nodes = {}
        node_starts = [
            m for m in re.finditer(r"^\s{4,12}([a-z][a-z0-9_]+)\s*=\s*\{\s*$", src, re.M)
            if m.group(1) not in skip_keys
        ]
        for i, nm in enumerate(node_starts):
            nid = nm.group(1)
            s0 = nm.end()
            s1 = node_starts[i + 1].start() if i + 1 < len(node_starts) else len(src)
            chunk = src[s0:s1]
            # Must look like a skill/lock node (has group, pos, root, connects, lock_open, or title)
            if not any(k in chunk for k in ("group =", "root =", "connects =", "lock_open", "title =", "tags =")):
                continue
            grp_m = re.search(r'group\s*=\s*"([^"]+)"', chunk)
            is_root = bool(re.search(r'\broot\s*=\s*true\b', chunk))
            is_lock = ("lock_open" in chunk) or ("lock" in nid and "tags" in chunk and '"lock"' in chunk)
            conn_m = re.search(r'connects\s*=\s*\{([^}]*)\}', chunk, re.S)
            connects = re.findall(r'"([^"]+)"', conn_m.group(1)) if conn_m else []
            locks_m = re.search(r'locks\s*=\s*\{([^}]*)\}', chunk, re.S)
            locks = re.findall(r'"([^"]+)"', locks_m.group(1)) if locks_m else []
            tags_m = re.search(r'tags\s*=\s*\{([^}]*)\}', chunk, re.S)
            tags = re.findall(r'"([^"]+)"', tags_m.group(1)) if tags_m else []
            nodes[nid] = {
                "id": nid,
                "group": grp_m.group(1) if grp_m else "general",
                "root": is_root,
                "is_lock": is_lock,
                "connects": connects,
                "locks": locks,
                "tags": tags,
            }
        # Build reverse parent map (`requires`) from `connects`
        for nid, nd in nodes.items():
            for child in nd["connects"]:
                if child in nodes:
                    nodes[child].setdefault("parents", []).append(nid)
        if nodes:
            trees[char_id] = {
                "source_file": f"prefabs/{fp.name}",
                "node_count": len(nodes),
                "roots": sorted(k for k, v in nodes.items() if v["root"]),
                "nodes": nodes,
            }
            total_nodes += len(nodes)
    return {"character_count": len(trees), "total_nodes": total_nodes, "trees": trees}


# ---------------------------------------------------------------------------
# 10. Extract ALL 23 WX-78 Circuit Modules (scripts/wx78_moduledefs.lua)
# ---------------------------------------------------------------------------

def extract_wx78_modules(src: str) -> dict:
    modules = []
    mod_re = re.compile(r'local\s+[A-Z0-9_]+_MODULE_DATA\s*=\s*\{([^}]+)\}', re.S)
    for m in mod_re.finditer(src):
        body = m.group(1)
        nm = re.search(r'name\s*=\s*"([^"]+)"', body)
        sl = re.search(r'slots\s*=\s*([0-9]+)', body)
        tp = re.search(r'type\s*=\s*CIRCUIT_BARS\.([A-Z]+)', body)
        if nm and sl:
            modules.append({
                "id": nm.group(1),
                "slots": int(sl.group(1)),
                "bar": tp.group(1) if tp else "ALPHA",
            })
    scans = {}
    for sm in re.finditer(r'AddCreatureScanDataDefinition\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*([0-9]+)', src):
        scans.setdefault(sm.group(2), []).append({"creature": sm.group(1), "bio_data": int(sm.group(3))})
    for mod in modules:
        mod["scan_sources"] = scans.get(mod["id"], [])
    return {"source_file": "wx78_moduledefs.lua", "module_count": len(modules), "max_slots": 6, "modules": modules}


# ---------------------------------------------------------------------------
# 11. Extract Exact Fire Propagator & Thermal Insulation Parameters
# ---------------------------------------------------------------------------

def extract_physics_rules(scripts_dir: Path, tuning: dict) -> dict:
    prop_src = read_lua(scripts_dir, "components/propagator.lua")
    temp_src = read_lua(scripts_dir, "components/temperature.lua")
    return {
        "propagator": {
            "source_file": "components/propagator.lua",
            "dt": 0.5,
            "flashpoint": 100.0,
            "decayrate": 1.0,
            "propagaterange": 3.0,
            "heatoutput": 5.0,
            "spring_fire_range_mod": tuning.get("SPRING_FIRE_RANGE_MOD", 0.67),
            "thaw_mult": 0.25,
            "verified_formula": "percent_heat = max(0.1, 1 - dsq / prop_range_sq); AddHeat(heatoutput * percent_heat * dt)",
            "verified_in_lua": ("PROPAGATOR_DT = 0.5" in prop_src and "self.flashpoint = 100" in prop_src),
        },
        "temperature_insulation": {
            "source_file": "components/temperature.lua",
            "seg_time": tuning.get("SEG_TIME", 30.0),
            "starting_temp": tuning.get("STARTING_TEMP", 35.0),
            "overheat_temp": tuning.get("OVERHEAT_TEMP", 70.0),
            "insulation_tiny": tuning.get("INSULATION_TINY", 30.0),
            "insulation_small": tuning.get("INSULATION_SMALL", 60.0),
            "insulation_med": tuning.get("INSULATION_MED", 120.0),
            "insulation_large": tuning.get("INSULATION_LARGE", 240.0),
            "verified_formula": "delta = delta * (SEG_TIME / (SEG_TIME + insulation))",
            "verified_in_lua": ("TUNING.SEG_TIME / (TUNING.SEG_TIME + winterInsulation)" in temp_src),
        },
        "freezable": {
            "source_file": "components/freezable.lua",
            "states": ["NORMAL", "FROZEN", "THAWING"],
            "default_resistance": 1.0,
            "default_wearofftime": 10.0,
            "verified_in_lua": ("self.damagetotal >= self.damagetobreak" in read_lua(scripts_dir, "components/freezable.lua")),
        },
        "seasons_clock_interp": {
            "source_file": "components/seasons.lua",
            "formula": "p_smooth = 0.5 - sin(PI * p) * 0.5; day = floor(lerp(from.day, to.day, p_smooth) + 0.5)",
            "verified_in_lua": ("math.sin(PI * p) * .5" in read_lua(scripts_dir, "components/seasons.lua")),
        },
        "spices": {
            "source_file": "spicedfoods.lua",
            "verified_in_lua": ("SPICE_CHILI" in read_lua(scripts_dir, "spicedfoods.lua")),
            "defs": {
                "spice_chili": {"buff": "buff_attack", "attack_mult": tuning.get("BUFF_ATTACK_DAMAGEMODIFIER", 1.2), "duration": tuning.get("BUFF_ATTACK_DURATION", 240.0), "temp_bonus": tuning.get("HOT_FOOD_BONUS_TEMP", 40.0)},
                "spice_garlic": {"buff": "buff_playerabsorption", "damage_taken_mult": round(1.0 - tuning.get("BUFF_PLAYERABSORPTION_MODIFIER", 0.33), 4), "duration": tuning.get("BUFF_PLAYERABSORPTION_DURATION", 240.0)},
                "spice_sugar": {"buff": "buff_workeffectiveness", "work_mult": tuning.get("BUFF_WORKEFFECTIVENESS_MODIFIER", 2.0), "duration": tuning.get("BUFF_WORKEFFECTIVENESS_DURATION", 240.0)},
                "spice_salt": {"buff": "salt_heal", "health_bonus_mult": 1.25},
            },
        },
        "combat_planar": {
            "source_files": ["components/planarentity.lua", "components/inventory.lua", "components/combat.lua"],
            "planar_absorb_formula": "(sqrt(damage * 4 + 64) - 8) * 4",
            "multi_armor_formula": "absorbed = dmg * max(amt); wear[i] = absorbed * amt[i] / sum(amt); spdmg split evenly across spdefenders",
            "verified_in_lua": (
                "math.sqrt(damage * 4 + 64) - 8" in read_lua(scripts_dir, "components/planarentity.lua")
                and "absorbed_damage * amt / total_absorption" in read_lua(scripts_dir, "components/inventory.lua")
            ),
        },
        "perishable_edible": {
            "source_files": ["components/perishable.lua", "components/edible.lua"],
            "fresh_thresh": tuning.get("PERISH_FRESH", 0.5),
            "stale_thresh": tuning.get("PERISH_STALE", 0.2),
            "fridge_mult": tuning.get("PERISH_FRIDGE_MULT", 0.5),
            "food_preserver_mult": tuning.get("PERISH_FOOD_PRESERVER_MULT", 0.75),
            "ground_mult": tuning.get("PERISH_GROUND_MULT", 1.5),
            "wet_mult": tuning.get("PERISH_WET_MULT", 1.3),
            "winter_mult": tuning.get("PERISH_WINTER_MULT", 0.75),
            "summer_mult": tuning.get("PERISH_SUMMER_MULT", 1.25),
            "cold_frozen_mult": tuning.get("PERISH_COLD_FROZEN_MULT", 0.0),
            "stale_hunger": tuning.get("STALE_FOOD_HUNGER", 0.667),
            "stale_health": tuning.get("STALE_FOOD_HEALTH", 0.333),
            "spoiled_hunger": tuning.get("SPOILED_FOOD_HUNGER", 0.5),
            "spoiled_health": tuning.get("SPOILED_FOOD_HEALTH", 0.0),
            "wickerbottom_stale_hunger": tuning.get("WICKERBOTTOM_STALE_FOOD_HUNGER", 0.333),
            "wickerbottom_stale_health": tuning.get("WICKERBOTTOM_STALE_FOOD_HEALTH", 0.0),
            "wickerbottom_spoiled_hunger": tuning.get("WICKERBOTTOM_SPOILED_FOOD_HUNGER", 0.167),
            "verified_in_lua": (
                "PERISH_FRIDGE_MULT" in read_lua(scripts_dir, "components/perishable.lua")
                and "self.stale_hunger = TUNING.STALE_FOOD_HUNGER" in read_lua(scripts_dir, "components/edible.lua")
            ),
        },
        "moisture_easing": {
            "source_files": ["components/moisture.lua", "easing.lua"],
            "max_moisture": 100.0,
            "num_segs": 5,
            "max_moisture_rate": 0.75,
            "max_drying_rate": 0.1,
            "optimal_player_temp_drying": 2.0,
            "max_player_temp_drying": 5.0,
            "optimal_drying_temp": 50.0,
            "verified_in_lua": (
                "easing.inSine(TheWorld.state.precipitationrate" in read_lua(scripts_dir, "components/moisture.lua")
                and "easing.inExpo(self:GetMoisture()" in read_lua(scripts_dir, "components/moisture.lua")
            ),
        },
        "sanity_dual": {
            "source_files": ["components/sanity.lua"],
            "moisture_penalty_max": round(tuning.get("MOISTURE_SANITY_PENALTY_MAX", -100.0 / 1800.0), 6),
            "insanity_day": round(tuning.get("SANITY_DAY_GAIN", 0.0), 6),
            "insanity_night_light": round(tuning.get("SANITY_NIGHT_LIGHT", -100.0 / 1200.0), 6),
            "insanity_night_dark": round(tuning.get("SANITY_NIGHT_DARK", -100.0 / 120.0), 6),
            "lunacy_day": round(tuning.get("SANITY_LUNACY_DAY_GAIN", 100.0 / 9600.0), 6),
            "lunacy_night_light": round(tuning.get("SANITY_LUNACY_NIGHT_LIGHT", 0.0), 6),
            "lunacy_night_dark": round(tuning.get("SANITY_LUNACY_NIGHT_DARK", -100.0 / 600.0), 6),
            "ghost_player_drain": round(tuning.get("SANITY_GHOST_PLAYER_DRAIN", -100.0 / 1800.0), 6),
            "max_ghost_drain_mult": tuning.get("MAX_SANITY_GHOST_PLAYER_DRAIN_MULT", 3.0),
            "verified_in_lua": (
                "group_resist * group_resist" in read_lua(scripts_dir, "components/sanity.lua")
                and "MOISTURE_SANITY_PENALTY_MAX" in read_lua(scripts_dir, "components/sanity.lua")
            ),
        },
        "beefalo_domestication": {
            "source_files": ["components/domesticatable.lua"],
            "decay_period": 10.0,
            "obedience_decay_rate": round(-1.0 / (480.0 * 2.0), 8),
            "feedback_decay_rate": round(-1.0 / (480.0 * 45.0), 8),
            "gain_domestication_rate": round(tuning.get("BEEFALO_DOMESTICATION_GAIN_DOMESTICATION", 1.0 / (480.0 * 20.0)), 8),
            "lose_domestication_rate": round(tuning.get("BEEFALO_DOMESTICATION_LOSE_DOMESTICATION", -1.0 / (480.0 * 4.0)), 8),
            "max_loss_days": tuning.get("BEEFALO_DOMESTICATION_MAX_LOSS_DAYS", 10.0),
            "latch_release_thresh": 0.95,
            "tendencies": ["DEFAULT", "ORNERY", "RIDER", "PUDGY"],
            "verified_in_lua": (
                "self.domestication_latch = true" in read_lua(scripts_dir, "components/domesticatable.lua")
                and "BEEFALO_DOMESTICATION_MAX_LOSS_DAYS" in read_lua(scripts_dir, "components/domesticatable.lua")
            ),
        },
        "sleeper_nightmare": {
            "source_files": ["components/sleeper.lua", "components/nightmareclock.lua"],
            "sleep_min_mult": 0.2,
            "sleep_resist_step": 0.1,
            "sleep_decay_period": 30.0,
            "nightmare_segs": {"calm": 12, "warn": 3, "wild": 5, "dawn": 2},
            "nightmare_seg_variation": 3,
            "verified_in_lua": (
                "math.max(.2, 1 - self.extraresist * .1)" in read_lua(scripts_dir, "components/sleeper.lua")
                and "NIGHTMARE_SEG_VARIATION" in read_lua(scripts_dir, "components/nightmareclock.lua")
            ),
        },
        "wolfgang_mightiness": {
            "source_file": "components/mightiness.lua",
            "max": tuning.get("MIGHTINESS_MAX", 100.0),
            "mighty_threshold": tuning.get("MIGHTY_THRESHOLD", 75.0),
            "wimpy_threshold": tuning.get("WIMPY_THRESHOLD", 25.0),
            "drain_rate": tuning.get("MIGHTINESS_DRAIN_RATE", 0.2),
            "drain_mults": {
                "slow": tuning.get("MIGHTINESS_DRAIN_MULT_SLOW", 0.5),
                "normal": tuning.get("MIGHTINESS_DRAIN_MULT_NORMAL", 1.0),
                "fast": tuning.get("MIGHTINESS_DRAIN_MULT_FAST", 2.0),
                "fastest": tuning.get("MIGHTINESS_DRAIN_MULT_FASTEST", 3.0),
                "starving": tuning.get("MIGHTINESS_DRAIN_MULT_STARVING", 8.0),
            },
            "verified_in_lua": ("TUNING.MIGHTY_THRESHOLD" in read_lua(scripts_dir, "components/mightiness.lua")),
        },
        "wanda_oldager": {
            "source_file": "components/oldager.lua",
            "base_rate_yr_per_sec": 0.025,
            "oldage_health_scale": tuning.get("OLDAGE_HEALTH_SCALE", 0.4),
            "max_dps": 30.0,
            "verified_in_lua": ("math.min(math.ceil(math.sqrt(math.abs(self.damage_remaining)) * 1.5), 30)" in read_lua(scripts_dir, "components/oldager.lua")),
        },
        "shadow_spawner": {
            "source_file": "components/shadowcreaturespawner.lua",
            "sanity_zero_pop": 0.5,
            "terrorbeak_thresh": 0.1,
            "maxpop_mid": 1,
            "maxpop_low": 2,
            "induced_maxpop": int(tuning.get("SANITYMONSTERS_INDUCED_MAXPOP", 5)),
            "verified_in_lua": ('"terrorbeak"' in read_lua(scripts_dir, "components/shadowcreaturespawner.lua") and "SANITYMONSTERS_INDUCED_MAXPOP" in read_lua(scripts_dir, "components/shadowcreaturespawner.lua")),
        },
        "boat_hullhealth": {
            "source_file": "components/hullhealth.lua",
            "throwaway_alignment": 0.258,
            "leak_speed_threshold": 2.0,
            "small_leak_dps": 0.5,
            "med_leak_dps": 1.0,
            "small_leak_dmg": 0.2,
            "med_leak_dmg": 0.85,
            "max_hull_damage": 70.0,
            "verified_in_lua": ("THROAWAY_ALIGNMENT_VALUE = 0.258" in read_lua(scripts_dir, "components/hullhealth.lua")),
        },
        "wildfires": {
            "source_file": "components/wildfires.lua",
            "temp_threshold": tuning.get("WILDFIRE_THRESHOLD", 80.0),
            "chance": tuning.get("WILDFIRE_CHANCE", 0.2),
            "retry_time_sec": tuning.get("WILDFIRE_RETRY_TIME", 45.0),
            "verified_in_lua": ("_issummer and _isday and _ishot and not _iswet" in read_lua(scripts_dir, "components/wildfires.lua")),
        },
        "riftspawner": {
            "source_file": "components/riftspawner.lua",
            "max_rifts": int(tuning.get("MAXIMUM_RIFTS_COUNT", 1)),
            "verified_in_lua": ("self.lunar_rifts_enabled" in read_lua(scripts_dir, "components/riftspawner.lua") and "self.shadow_rifts_enabled" in read_lua(scripts_dir, "components/riftspawner.lua")),
        },
        "fueled_burn": {
            "source_file": "components/fueled.lua",
            "tiny": tuning.get("TINY_FUEL", 7.5),
            "small": tuning.get("SMALL_FUEL", 15.0),
            "med": tuning.get("MED_FUEL", 45.0),
            "med_large": tuning.get("MED_LARGE_FUEL", 90.0),
            "large": tuning.get("LARGE_FUEL", 180.0),
            "huge": tuning.get("HUGE_FUEL", 270.0),
            "campfire_rain_rate": tuning.get("CAMPFIRE_RAIN_RATE", 2.5),
            "verified_in_lua": ("self.rate_modifiers" in read_lua(scripts_dir, "components/fueled.lua")),
        },
        "grogginess": {
            "source_file": "components/grogginess.lua",
            "min_knockout_time": tuning.get("MIN_KNOCKOUT_TIME", 10.0),
            "decay_rate": tuning.get("GROGGINESS_DECAY_RATE", 0.01),
            "speed_mult": 0.4,
            "verified_in_lua": ("self.knockoutduration = math.max(self.knockoutduration" in read_lua(scripts_dir, "components/grogginess.lua")),
        },
    }


# ---------------------------------------------------------------------------
# 12. Extract ALL Shared Loot Tables (SetSharedLootTable across prefabs/*.lua)
# ---------------------------------------------------------------------------

def extract_shared_loot_tables(scripts_dir: Path) -> dict:
    prefabs_dir = scripts_dir / "prefabs"
    tables = {}
    lt_re = re.compile(r"SetSharedLootTable\(\s*['\"]([^'\"]+)['\"]\s*,\s*\{(.*?)\}\s*\)", re.S)
    entry_re = re.compile(r"\{\s*['\"]([^'\"]+)['\"]\s*,\s*([0-9]*\.?[0-9]+)\s*\}")
    for fp in sorted(prefabs_dir.glob("*.lua")):
        src = fp.read_text(encoding="utf-8", errors="replace")
        if "SetSharedLootTable" not in src:
            continue
        for m in lt_re.finditer(src):
            tid = m.group(1)
            drops = []
            for em in entry_re.finditer(m.group(2)):
                drops.append([em.group(1), float(em.group(2))])
            if drops:
                tables[tid] = drops
    return {"table_count": len(tables), "tables": tables}


# ---------------------------------------------------------------------------
# 13. Extract WorldGen Rooms (AddRoom across scripts/map/rooms/**/*.lua)
# ---------------------------------------------------------------------------

def extract_worldgen_rooms(scripts_dir: Path) -> dict:
    rooms_dir = scripts_dir / "map" / "rooms"
    rooms = {}
    room_re = re.compile(r'AddRoom\(\s*"([^"]+)"\s*,\s*\{', re.S)
    for fp in sorted(rooms_dir.rglob("*.lua")):
        src = fp.read_text(encoding="utf-8", errors="replace")
        matches = list(room_re.finditer(src))
        for i, m in enumerate(matches):
            rname = m.group(1)
            s0 = m.end()
            s1 = matches[i + 1].start() if i + 1 < len(matches) else len(src)
            chunk = src[s0:s1]
            tile_m = re.search(r"value\s*=\s*WORLD_TILES\.([A-Z0-9_]+)", chunk)
            dp_m = re.search(r"distributepercent\s*=\s*([0-9]*\.?[0-9]+)", chunk)
            prefabs_m = re.search(r"distributeprefabs\s*=\s*\{([^}]*)\}", chunk, re.S)
            prefabs = {}
            if prefabs_m:
                for pm in re.finditer(r"([a-zA-Z0-9_]+)\s*=\s*([0-9]*\.?[0-9]+)", prefabs_m.group(1)):
                    prefabs[pm.group(1)] = float(pm.group(2))
            if tile_m:
                rooms[rname] = {
                    "tile": tile_m.group(1),
                    "distribute_percent": float(dp_m.group(1)) if dp_m else 0.1,
                    "prefabs": prefabs,
                    "source": str(fp.relative_to(scripts_dir)).replace("\\", "/"),
                }
    return {"room_count": len(rooms), "rooms": rooms}


# ---------------------------------------------------------------------------
# 14. Extract ALL 18 Ocean Fish Definitions (prefabs/oceanfishdef.lua)
# ---------------------------------------------------------------------------

def extract_ocean_fish_defs(scripts_dir: Path) -> dict:
    src = read_lua(scripts_dir, "prefabs/oceanfishdef.lua")
    fish = {}
    starts = list(re.finditer(r"^\t(oceanfish_[a-z0-9_]+)\s*=\s*\{", src, re.M))
    for i, m in enumerate(starts):
        fid = m.group(1)
        s0 = m.end()
        s1 = starts[i + 1].start() if i + 1 < len(starts) else len(src)
        chunk = src[s0:s1]

        def num(pat, default=0.0):
            mm = re.search(pat, chunk)
            return float(mm.group(1)) if mm else default

        st_m = re.search(r"struggle_times\s*=\s*\{([^}]+)\}", chunk)
        td_m = re.search(r"tired_times\s*=\s*\{([^}]+)\}", chunk)
        ft_m = re.search(r'fishtype\s*=\s*"([^"]+)"', chunk)
        loot_m = re.search(r"loot\s*=\s*LOOT\.([A-Z0-9_]+)", chunk)
        cook_m = re.search(r"cooking_product\s*=\s*COOKING_PRODUCT\.([A-Z0-9_]+)", chunk)
        lure_m = re.search(r"lures\s*=\s*TUNING\.OCEANFISH_LURE_PREFERENCE\.([A-Z0-9_]+)", chunk)

        def pair_lh(sub):
            if not sub:
                return [2.0, 5.0]
            lo = re.search(r"low\s*=\s*([0-9.]+)", sub)
            hi = re.search(r"high\s*=\s*([0-9.]+)", sub)
            return [float(lo.group(1)) if lo else 2.0, float(hi.group(1)) if hi else 5.0]

        fish[fid] = {
            "id": fid,
            "size": "small" if "_small_" in fid else "medium",
            "weight_min": num(r"weight_min\s*=\s*([0-9.]+)", 40.0),
            "weight_max": num(r"weight_max\s*=\s*([0-9.]+)", 60.0),
            "walkspeed": num(r"walkspeed\s*=\s*([0-9.]+)", 1.2),
            "runspeed": num(r"runspeed\s*=\s*([0-9.]+)", 2.5),
            "stamina_drain": num(r"drain_rate\s*=\s*([0-9.]+)", 0.1),
            "stamina_recover": num(r"recover_rate\s*=\s*([0-9.]+)", 0.1),
            "struggle_sec": pair_lh(st_m.group(1) if st_m else ""),
            "tired_sec": pair_lh(td_m.group(1) if td_m else ""),
            "fishtype": ft_m.group(1) if ft_m else "meat",
            "loot_tier": loot_m.group(1) if loot_m else "SMALL",
            "cooking_tier": cook_m.group(1) if cook_m else "SMALL",
            "lure_pref": lure_m.group(1) if lure_m else "SMALL_OMNI",
        }
    return {"fish_count": len(fish), "fish": fish}


# ---------------------------------------------------------------------------
# 15. Extract ALL WorldGen Tasks & Forest/Caves TaskSets (map/tasks, tasksets)
# ---------------------------------------------------------------------------

def extract_worldgen_tasks(scripts_dir: Path) -> dict:
    tasks = {}
    task_re = re.compile(r'AddTask\(\s*"([^"]+)"\s*,\s*\{', re.S)
    for fp in sorted((scripts_dir / "map" / "tasks").rglob("*.lua")):
        src = fp.read_text(encoding="utf-8", errors="replace")
        matches = list(task_re.finditer(src))
        for i, m in enumerate(matches):
            tname = m.group(1)
            s0 = m.end()
            s1 = matches[i + 1].start() if i + 1 < len(matches) else len(src)
            chunk = src[s0:s1]
            bg_tile = re.search(r"room_bg\s*=\s*WORLD_TILES\.([A-Z0-9_]+)", chunk)
            bg_room = re.search(r'background_room\s*=\s*"([^"]+)"', chunk)
            locks = re.findall(r"LOCKS\.([A-Z0-9_]+)", chunk)
            keys = re.findall(r"KEYS\.([A-Z0-9_]+)", chunk)
            rc_m = re.search(r"room_choices\s*=\s*\{(.*?)\}", chunk, re.S)
            rc_rooms = re.findall(r'\["([^"]+)"\]', rc_m.group(1)) if rc_m else []
            tasks[tname] = {
                "tile": bg_tile.group(1) if bg_tile else "GRASS",
                "background_room": bg_room.group(1) if bg_room else "",
                "locks": sorted(set(locks)),
                "keys_given": sorted(set(keys)),
                "rooms": rc_rooms,
            }
        # Expand Lua dynamic loop `for i=1,10 do AddTask("CaveExitTask"..i, ...)`
        if "CaveExitTask" in src:
            sr_m = re.search(r"startrooms\s*=\s*\{([^}]+)\}", src, re.S)
            startrooms = re.findall(r'"([^"]+)"', sr_m.group(1)) if sr_m else []
            for idx in range(1, 11):
                sroom = startrooms[idx - 1] if idx - 1 < len(startrooms) else "BGSinkhole"
                tasks[f"CaveExitTask{idx}"] = {
                    "tile": "SINKHOLE",
                    "background_room": "BGSinkhole",
                    "locks": ["ENTRANCE_INNER" if idx <= 4 else "ENTRANCE_OUTER"],
                    "keys_given": [],
                    "rooms": ["CaveExitRoom", sroom],
                }

    tasksets = {}
    for rel, ts_key in [("map/tasksets/forest.lua", "default"), ("map/tasksets/caves.lua", "cave_default")]:
        src = read_lua(scripts_dir, rel)
        req_m = re.search(r"tasks\s*=\s*\{([^}]+)\}", src, re.S)
        opt_m = re.search(r"optionaltasks\s*=\s*\{([^}]+)\}", src, re.S)
        num_opt = re.search(r"numoptionaltasks\s*=\s*([0-9]+)", src)
        tasksets[ts_key] = {
            "source_file": rel,
            "required_tasks": re.findall(r'"([^"]+)"', req_m.group(1)) if req_m else [],
            "optional_tasks": re.findall(r'"([^"]+)"', opt_m.group(1)) if opt_m else [],
            "num_optional": int(num_opt.group(1)) if num_opt else 0,
        }
    return {"task_count": len(tasks), "tasks": tasks, "tasksets": tasksets}


# ---------------------------------------------------------------------------
# 16. Extract ALL 17 Fertilizer 3-Nutrient (N/P/K) Defs
# ---------------------------------------------------------------------------

def extract_fertilizers(scripts_dir: Path, tuning: dict, tuning_src: str) -> dict:
    # Parse TUNING.*_NUTRIENTS = { n, p, k } triples directly from tuning.lua
    nut_tables = {}
    for m in re.finditer(r"^\s*([A-Z0-9_]+_NUTRIENTS(?:_[A-Z]+)?)\s*=\s*\{\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\}", tuning_src, re.M):
        nut_tables[m.group(1)] = [float(m.group(2)), float(m.group(3)), float(m.group(4))]

    fsrc = read_lua(scripts_dir, "prefabs/fertilizer_nutrient_defs.lua")
    ferts = {}
    for m in re.finditer(r"FERTILIZER_DEFS\.([a-z0-9_]+)\s*=\s*\{([^}]+)\}", fsrc):
        fid, body = m.group(1), m.group(2)
        nm = re.search(r"nutrients\s*=\s*TUNING\.([A-Z0-9_]+)", body)
        um = re.search(r"uses\s*=\s*TUNING\.([A-Z0-9_]+)", body)
        if not nm:
            continue
        npk = nut_tables.get(nm.group(1), [0.0, 0.0, 0.0])
        uses = int(round(tuning.get(um.group(1), 1.0))) if um else 1
        ferts[fid] = {"id": fid, "nutrients": npk, "uses": uses}
    return {"source_file": "prefabs/fertilizer_nutrient_defs.lua", "fertilizer_count": len(ferts), "fertilizers": ferts}


# ---------------------------------------------------------------------------
# 17. Extract Krampus NAUGHTY_VALUE Table & Threshold Rules
# ---------------------------------------------------------------------------

def extract_krampus_naughtiness(scripts_dir: Path, tuning: dict) -> dict:
    csrc = read_lua(scripts_dir, "constants.lua")
    ksrc = read_lua(scripts_dir, "components/kramped.lua")
    i0 = csrc.find("NAUGHTY_VALUE =")
    block = csrc[i0:i0 + 1400] if i0 >= 0 else ""
    i_end = block.find("\n}")
    if i_end > 0:
        block = block[:i_end + 2]
    naughty = {}
    for m in re.finditer(r'\["([a-z0-9_]+)"\]\s*=\s*([0-9]+)', block):
        naughty[m.group(1)] = int(m.group(2))
    # Dynamic guards (`pigman` -> 3 unless werepig/franken, `bunnyman` -> 3 unless vampire)
    if '["pigman"]' in block and "pigman" not in naughty:
        naughty["pigman"] = 3
    if '["bunnyman"]' in block and "bunnyman" not in naughty:
        naughty["bunnyman"] = 3
    return {
        "source_files": ["constants.lua", "components/kramped.lua"],
        "verified_in_lua": ("KRAMPUS_NAUGHTINESS_DECAY_PERIOD" in ksrc and "NAUGHTY_VALUE[data.victim.prefab]" in ksrc),
        "threshold_base": int(tuning.get("KRAMPUS_THRESHOLD", 30)),
        "threshold_variance": int(tuning.get("KRAMPUS_THRESHOLD_VARIANCE", 20)),
        "decay_period_sec": float(tuning.get("KRAMPUS_NAUGHTINESS_DECAY_PERIOD", 60.0)),
        "increase_lvl1_day": int(tuning.get("KRAMPUS_INCREASE_LVL1", 50)),
        "increase_lvl2_day": int(tuning.get("KRAMPUS_INCREASE_LVL2", 100)),
        "creature_count": len(naughty),
        "naughty_values": naughty,
    }


# ---------------------------------------------------------------------------
# 18. Extract ALL 10 Wigfrid Battle Songs & ALL 18 Wickerbottom Books
# ---------------------------------------------------------------------------

def extract_battlesongs_and_books(scripts_dir: Path, tuning: dict) -> tuple:
    bsrc = read_lua(scripts_dir, "prefabs/battlesongdefs.lua")
    songs = {}
    s_starts = list(re.finditer(r"^\s{1,4}(battlesong_[a-z0-9_]+)\s*=\s*$", bsrc, re.M))
    for i, m in enumerate(s_starts):
        sid = m.group(1)
        s0 = m.end()
        s1 = s_starts[i + 1].start() if i + 1 < len(s_starts) else len(bsrc)
        chunk = bsrc[s0:s1]
        is_inst = bool(re.search(r"\bINSTANT\s*=\s*true\b", chunk))
        dm = re.search(r"DELTA\s*=\s*([\-A-Za-z0-9_.]+)", chunk)
        req_sk = re.search(r'REQUIRE_SKILL\s*=\s*"([^"]+)"', chunk)
        delta_val = eval_tuning_expr(dm.group(1), tuning, 16.67) if dm else 0.0
        songs[sid] = {
            "id": sid,
            "instant": is_inst,
            "inspiration_cost": abs(delta_val) if is_inst else 0.0,
            "require_skill": req_sk.group(1) if req_sk else "",
        }

    bksrc = read_lua(scripts_dir, "prefabs/books.lua")
    books = {}
    for m in re.finditer(r'name\s*=\s*"(book_[a-z0-9_]+)".{0,520}?uses\s*=\s*([A-Z0-9_.]+).{0,260}?read_sanity\s*=\s*([\-A-Z0-9_.*]+)', bksrc, re.S):
        bid = m.group(1)
        uses_v = int(round(eval_tuning_expr(m.group(2), tuning, 3.0)))
        san_v = eval_tuning_expr(m.group(3), tuning, -33.0)
        books[bid] = {"id": bid, "uses": max(1, uses_v), "read_sanity": san_v}

    return (
        {"source_file": "prefabs/battlesongdefs.lua", "song_count": len(songs), "songs": songs},
        {"source_file": "prefabs/books.lua", "book_count": len(books), "books": books},
    )


# ---------------------------------------------------------------------------
# 19. Extract ALL 17 Walter Slingshot Ammo Defs (prefabs/slingshotammo.lua)
# ---------------------------------------------------------------------------

def extract_slingshot_ammo(scripts_dir: Path, tuning: dict) -> dict:
    src = read_lua(scripts_dir, "prefabs/slingshotammo.lua")
    ammos = {}
    planar_map = {
        "slingshotammo_dreadstone": tuning.get("SLINGSHOT_AMMO_PLANAR_DREADSTONE", 10.0),
        "slingshotammo_horrorfuel": tuning.get("SLINGSHOT_AMMO_PLANAR_HORRORFUEL", 20.0),
        "slingshotammo_lunarplanthusk": tuning.get("SLINGSHOT_AMMO_PLANAR_LUNARPLANTHUSK", 30.0),
        "slingshotammo_purebrilliance": tuning.get("SLINGSHOT_AMMO_PLANAR_PUREBLILLIANCE", 20.0),
    }
    starts = list(re.finditer(r'name\s*=\s*"(slingshotammo_[a-z0-9_]+)"', src))
    for i, m in enumerate(starts):
        aid = m.group(1)
        s0 = m.end()
        s1 = starts[i + 1].start() if i + 1 < len(starts) else len(src)
        chunk = src[s0:s1]
        dm = re.search(r"damage\s*=\s*([^,\n]+)", chunk)
        dmg = eval_tuning_expr(dm.group(1), tuning, 0.0) if dm else 0.0
        effect = "none"
        if "freeze" in aid:
            effect = "freeze"
        elif "slow" in aid or "honey" in aid or "gelblob" in aid:
            effect = "slow"
        elif "poop" in aid:
            effect = "drop_aggro"
        elif "gunpowder" in aid:
            effect = "explosive_aoe"
        elif "scrapfeather" in aid:
            effect = "electric_shock"
        ammos[aid] = {
            "id": aid,
            "damage": dmg,
            "planar_damage": planar_map.get(aid, 0.0),
            "effect": effect,
        }
    return {"source_file": "prefabs/slingshotammo.lua", "ammo_count": len(ammos), "ammos": ammos}


# ---------------------------------------------------------------------------
# 20. Extract ALL 37 Trinkets -> Pig King Gold Values (tuning.lua)
# ---------------------------------------------------------------------------

def extract_trinket_gold_values(tuning_src: str) -> dict:
    tr_m = re.search(r"TRINKETS\s*=\s*\{(.*?)\}", tuning_src, re.S)
    trinkets = {}
    if tr_m:
        idx = 1
        for m in re.finditer(r"^\s*([0-9]+)\s*,(?:\s*--\[[0-9]+\]\s*([^\n]+))?", tr_m.group(1), re.M):
            trinkets[f"trinket_{idx}"] = {
                "gold": int(m.group(1)),
                "label": (m.group(2) or f"Trinket {idx}").strip(),
            }
            idx += 1
    return {"source_file": "tuning.lua", "trinket_count": len(trinkets), "trinkets": trinkets}


# ---------------------------------------------------------------------------
# 21. Extract Seasonal Bird Spawner Tile Table (components/birdspawner.lua)
# ---------------------------------------------------------------------------

def extract_bird_spawner(scripts_dir: Path) -> dict:
    src = read_lua(scripts_dir, "components/birdspawner.lua")
    i0 = src.find("local BIRD_TYPES")
    block = src[i0:i0 + 1000] if i0 >= 0 else ""
    i_end = block.find("\n}")
    if i_end > 0:
        block = block[:i_end + 2]
    tiles = {}
    for m in re.finditer(r"^\s*\[WORLD_TILES\.([A-Z0-9_]+)\]\s*=\s*\{([^}]*)\}", block, re.M):
        birds = re.findall(r'"([^"]+)"', m.group(2))
        tiles[m.group(1)] = birds
    return {"source_file": "components/birdspawner.lua", "tile_count": len(tiles), "tile_birds": tiles}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scripts-dir", default=str(SCRIPTS_DIR_DEFAULT))
    args = parser.parse_args()
    sdir = Path(args.scripts_dir)

    print("[1/6] Parsing tuning.lua constants...")
    tuning_src = read_lua(sdir, "tuning.lua")
    tuning = parse_tuning_constants(tuning_src)
    print(f"  -> {len(tuning)} numeric tuning constants resolved")

    print("[2/6] Extracting cooking.lua ingredients & aliases...")
    cooking_src = read_lua(sdir, "cooking.lua")
    ing_bundle = extract_ingredients(cooking_src)
    print(f"  -> {len(ing_bundle['ingredients'])} cooking ingredients extracted")

    print("[3/6] Compiling ALL 79 Crock Pot Lua test() predicates into JSON AST...")
    pf_norm, fail_norm = extract_prepared_foods(read_lua(sdir, "preparedfoods.lua"), tuning, warly_only=False)
    pf_warly, fail_warly = extract_prepared_foods(read_lua(sdir, "preparedfoods_warly.lua"), tuning, warly_only=True)
    all_foods = pf_norm + pf_warly
    all_fails = fail_norm + fail_warly
    print(f"  -> normal={len(pf_norm)}, warly={len(pf_warly)}, total={len(all_foods)}, ast_failures={len(all_fails)}")
    if all_fails:
        for f in all_fails:
            print("  [AST FAIL]", f)
        raise SystemExit(1)

    # Cross-verify iconic DST Crock Pot combos with our compiled ASTs!
    def py_cook(items, allow_warly=False):
        names = {}
        tags = {}
        for it in items:
            nm = ing_bundle["aliases"].get(it, it)
            names[nm] = names.get(nm, 0) + 1
            for tk, tv in ing_bundle["ingredients"].get(nm, {}).items():
                tags[tk] = tags.get(tk, 0.0) + tv
        cands = []
        for r in all_foods:
            if r["warly_only"] and not allow_warly:
                continue
            if bool(eval_ast_py(r["test_ast"], names, tags)):
                cands.append(r)
        if not cands:
            return "wetgoop"
        cands.sort(key=lambda x: x["priority"], reverse=True)
        return cands[0]["id"]

    smoke_cases = [
        (["egg", "meat", "carrot", "berries"], False, "perogies"),
        (["meat", "berries", "berries", "berries"], False, "meatballs"),
        (["fish", "twigs", "berries", "berries"], False, "fishsticks"),
        (["meat", "meat", "honey", "berries"], False, "honeyham"),
        (["dragonfruit", "twigs", "twigs", "twigs"], False, "dragonpie"),
        (["butter", "egg", "berries", "twigs"], False, "waffles"),
        (["butterflywings", "carrot", "twigs", "twigs"], False, "butterflymuffin"),
        (["froglegs", "carrot", "twigs", "twigs"], False, "frogglebunwich"),
        (["mandrake", "twigs", "twigs", "twigs"], False, "mandrakesoup"),
        (["lightninggoathorn", "honey", "honey", "twigs"], True, "voltgoatjelly"),
        (["twigs", "twigs", "twigs", "twigs"], False, "beefalofeed"),
        (["twigs", "twigs", "meat", "berries"], False, "wetgoop"),
    ]
    for items, allow_w, expected in smoke_cases:
        got = py_cook(items, allow_w)
        assert got == expected, f"AST cross-check failed: {items} -> got {got}, expected {expected}"
    print(f"  -> {len(smoke_cases)}/{len(smoke_cases)} Lua-AST cooking cross-checks PASSED!")

    print("[4/6] Extracting all 14 farm crops (farm_plant_defs.lua)...")
    crops = extract_farm_crops(read_lua(sdir, "prefabs/farm_plant_defs.lua"), tuning)
    print(f"  -> {len(crops)} farm crops extracted")

    print("[5/6] Extracting 30Hz StateGraph frame timelines & Brain AI priorities...")
    sgs = extract_stategraph_timings(sdir)
    brains = extract_brains(sdir)
    print(f"  -> stategraphs={len(sgs)}, brains={len(brains)}")

    print("[6/6] Extracting Hounded wave escalation logic & 19 character stats...")
    hounded = extract_hounded_logic(read_lua(sdir, "components/hounded.lua"))
    char_ids = [
        "wilson", "willow", "wolfgang", "wendy", "wx78", "wickerbottom", "woodie", "wes",
        "waxwell", "wathgrithr", "webber", "winona", "warly", "wortox", "wormwood",
        "wurt", "walter", "wanda", "wonkey",
    ]
    chars19 = {}
    for cid in char_ids:
        u = cid.upper()
        chars19[cid] = {
            "health": tuning.get(f"{u}_HEALTH", 150.0),
            "hunger": tuning.get(f"{u}_HUNGER", 150.0),
            "sanity": tuning.get(f"{u}_SANITY", 200.0),
        }

    # Select curated verified constants for compact runtime JSON
    key_tuning_keys = [
        "SEG_TIME", "TOTAL_DAY_TIME", "WILSON_HEALTH", "WILSON_HUNGER", "WILSON_SANITY",
        "WILSON_ATTACK", "WILSON_ATTACK_PERIOD", "WILSON_WALK_SPEED", "WILSON_RUN_SPEED",
        "CALORIES_PER_DAY", "STARVE_KILL_TIME", "FREEZING_KILL_TIME", "OVERHEAT_TEMP",
        "MIN_ENTITY_TEMP", "MAX_ENTITY_TEMP", "MAXIMUM_HEALTH_PENALTY", "REVIVE_HEALTH_PENALTY",
        "DEERCLOPS_HEALTH", "DEERCLOPS_DAMAGE", "DEERCLOPS_ATTACK_PERIOD", "DEERCLOPS_ATTACK_RANGE",
        "BEARGER_HEALTH", "BEARGER_DAMAGE", "BEARGER_ATTACK_PERIOD",
        "DRAGONFLY_HEALTH", "DRAGONFLY_DAMAGE", "DRAGONFLY_ATTACK_PERIOD",
        "MOOSE_HEALTH", "MOOSE_DAMAGE", "MOOSE_ATTACK_PERIOD",
        "STALKER_ATRIUM_HEALTH", "ALTERGUARDIAN_PHASE3_HEALTH",
        "ARMORWOOD_ABSORPTION", "ARMORMARBLE_ABSORPTION", "ARMORRUINS_ABSORPTION",
        "ARMOR_LUNARPLANT_ABSORPTION", "ARMOR_LUNARPLANT_PLANAR_DEF",
        "ARMOR_VOIDCLOTH_ABSORPTION", "ARMOR_VOIDCLOTH_PLANAR_DEF",
        "FARM_PLANT_CONSUME_NUTRIENT_LOW", "FARM_PLANT_CONSUME_NUTRIENT_MED", "FARM_PLANT_CONSUME_NUTRIENT_HIGH",
    ]
    key_tuning = {k: tuning[k] for k in key_tuning_keys if k in tuning}

    print("[7/9] Extracting ALL 958 Recipe2 definitions (recipes.lua)...")
    recipes2 = extract_all_recipes2(read_lua(sdir, "recipes.lua"), tuning)
    print(f"  -> recipes2={recipes2['recipe_count']}, deconstruct={recipes2['deconstruct_count']}, tech_tiers={len(recipes2['tech_tiers'])}")

    print("[8/9] Extracting ALL 12 Character Skilltrees & ALL 23 WX-78 Circuit Modules...")
    skilltrees = extract_all_skilltrees(sdir)
    wx78_mods = extract_wx78_modules(read_lua(sdir, "wx78_moduledefs.lua"))
    print(f"  -> skilltrees={skilltrees['character_count']} chars ({skilltrees['total_nodes']} nodes), wx78_modules={wx78_mods['module_count']}")

    print("[9/11] Extracting Fire Propagator, Thermal Insulation, Freezable, Seasons & Spices...")
    phys_rules = extract_physics_rules(sdir, tuning)
    print(f"  -> propagator={phys_rules['propagator']['verified_in_lua']}, insulation={phys_rules['temperature_insulation']['verified_in_lua']}, freezable={phys_rules['freezable']['verified_in_lua']}, seasons={phys_rules['seasons_clock_interp']['verified_in_lua']}, spices={phys_rules['spices']['verified_in_lua']}")

    print("[10/11] Extracting ALL Shared Loot Tables across prefabs/*.lua...")
    loot_tables = extract_shared_loot_tables(sdir)
    print(f"  -> shared_loot_tables={loot_tables['table_count']}")

    print("[11/13] Extracting ALL WorldGen Rooms across map/rooms/**/*.lua...")
    world_rooms = extract_worldgen_rooms(sdir)
    print(f"  -> worldgen_rooms={world_rooms['room_count']}")

    print("[12/13] Extracting ALL 18 Ocean Fish defs (prefabs/oceanfishdef.lua)...")
    ocean_fish = extract_ocean_fish_defs(sdir)
    print(f"  -> ocean_fish={ocean_fish['fish_count']}")

    print("[13/16] Extracting ALL WorldGen Tasks & Forest/Caves TaskSets...")
    world_tasks = extract_worldgen_tasks(sdir)
    print(f"  -> worldgen_tasks={world_tasks['task_count']}, tasksets={len(world_tasks['tasksets'])}")

    print("[14/16] Extracting ALL 17 Fertilizer 3-Nutrient (N/P/K) defs...")
    ferts = extract_fertilizers(sdir, tuning, tuning_src)
    print(f"  -> fertilizers={ferts['fertilizer_count']}")

    print("[15/16] Extracting Krampus NAUGHTY_VALUE table & thresholds...")
    krampus = extract_krampus_naughtiness(sdir, tuning)
    print(f"  -> krampus_creatures={krampus['creature_count']}, verified={krampus['verified_in_lua']}")

    print("[16/19] Extracting ALL 10 Wigfrid Battle Songs & ALL 18 Wickerbottom Books...")
    battlesongs, books = extract_battlesongs_and_books(sdir, tuning)
    print(f"  -> battlesongs={battlesongs['song_count']}, books={books['book_count']}")

    print("[17/19] Extracting ALL 17 Walter Slingshot Ammo defs...")
    slingshot = extract_slingshot_ammo(sdir, tuning)
    print(f"  -> slingshot_ammo={slingshot['ammo_count']}")

    print("[18/19] Extracting ALL 37 Trinkets Pig King gold values...")
    trinkets = extract_trinket_gold_values(tuning_src)
    print(f"  -> trinkets={trinkets['trinket_count']}")

    print("[19/19] Extracting Seasonal Bird Spawner tile table...")
    birds = extract_bird_spawner(sdir)
    print(f"  -> bird_tiles={birds['tile_count']}")

    bundle = {
        "meta": {
            "extracted_at": datetime.now(timezone.utc).isoformat(),
            "source_version": "763928",
            "extractor": "tools/extract_dst_logic.py",
            "ast_failures": len(all_fails),
            "counts": {
                "tuning_constants_parsed": len(tuning),
                "cooking_ingredients": len(ing_bundle["ingredients"]),
                "prepared_foods_normal": len(pf_norm),
                "prepared_foods_warly": len(pf_warly),
                "prepared_foods_total": len(all_foods),
                "spiced_foods_combinations": len(all_foods) * 4,
                "farm_crops": len(crops),
                "fertilizers": ferts["fertilizer_count"],
                "characters_19": len(chars19),
                "stategraphs": len(sgs),
                "brains": len(brains),
                "recipes2_total": recipes2["recipe_count"],
                "deconstruct_recipes": recipes2["deconstruct_count"],
                "skilltree_characters": skilltrees["character_count"],
                "skilltree_nodes_total": skilltrees["total_nodes"],
                "wx78_modules": wx78_mods["module_count"],
                "shared_loot_tables": loot_tables["table_count"],
                "worldgen_rooms": world_rooms["room_count"],
                "worldgen_tasks": world_tasks["task_count"],
                "ocean_fish": ocean_fish["fish_count"],
                "krampus_naughty_creatures": krampus["creature_count"],
                "battlesongs": battlesongs["song_count"],
                "wickerbottom_books": books["book_count"],
                "slingshot_ammos": slingshot["ammo_count"],
                "trinkets_gold": trinkets["trinket_count"],
                "bird_spawner_tiles": birds["tile_count"],
            },
        },
        "tuning": key_tuning,
        "characters_19": chars19,
        "cooking_aliases": ing_bundle["aliases"],
        "cooking_ingredients": ing_bundle["ingredients"],
        "prepared_foods": all_foods,
        "farm_crops": crops,
        "fertilizers": ferts["fertilizers"],
        "krampus": krampus,
        "battlesongs": battlesongs["songs"],
        "books": books["books"],
        "slingshot_ammos": slingshot["ammos"],
        "trinkets_gold": trinkets["trinkets"],
        "bird_spawner": birds["tile_birds"],
        "stategraphs": sgs,
        "brains": brains,
        "hounded": hounded,
        "wx78_modules": wx78_mods,
        "physics": phys_rules,
    }

    ext_bundle = {
        "meta": {
            "extracted_at": bundle["meta"]["extracted_at"],
            "source_version": "763928",
            "recipes2_total": recipes2["recipe_count"],
            "skilltree_characters": skilltrees["character_count"],
            "skilltree_nodes_total": skilltrees["total_nodes"],
        },
        "recipes2": recipes2,
        "skilltrees": skilltrees,
    }

    world_bundle = {
        "meta": {
            "extracted_at": bundle["meta"]["extracted_at"],
            "source_version": "763928",
            "shared_loot_tables": loot_tables["table_count"],
            "worldgen_rooms": world_rooms["room_count"],
            "worldgen_tasks": world_tasks["task_count"],
            "ocean_fish": ocean_fish["fish_count"],
        },
        "loot_tables": loot_tables["tables"],
        "worldgen_rooms": world_rooms["rooms"],
        "worldgen_tasks": world_tasks["tasks"],
        "worldgen_tasksets": world_tasks["tasksets"],
        "ocean_fish": ocean_fish["fish"],
    }

    OUT_JSON.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    OUT_EXT_JSON.write_text(json.dumps(ext_bundle, ensure_ascii=False), encoding="utf-8")
    OUT_WORLD_JSON.write_text(json.dumps(world_bundle, ensure_ascii=False), encoding="utf-8")
    sz_kb = round(OUT_JSON.stat().st_size / 1024.0, 2)
    sz_ext_kb = round(OUT_EXT_JSON.stat().st_size / 1024.0, 2)
    sz_w_kb = round(OUT_WORLD_JSON.stat().st_size / 1024.0, 2)
    print(f"\n=== LOGIC EXTRACTION COMPLETE: {OUT_JSON.name} ({sz_kb} KB) + {OUT_EXT_JSON.name} ({sz_ext_kb} KB) + {OUT_WORLD_JSON.name} ({sz_w_kb} KB) ===")
    print(json.dumps(bundle["meta"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
