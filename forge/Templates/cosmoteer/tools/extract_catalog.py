"""Extract a bounded, source-traceable catalogue from a local Cosmoteer Data tree."""

import argparse
from collections import Counter
from dataclasses import dataclass, field
from functools import cached_property
import json
from pathlib import Path
import re


class Unsupported(ValueError):
    """A present value cannot safely be interpreted by this subset reader."""


class Missing(KeyError):
    """A well-formed object and all its bases omit a field."""


# Tokenize strings/comments before delimiters; quoted braces and slashes are data.
TOKEN = re.compile(
    r'//[^\n]*|/\*[\s\S]*?\*/|@"(?:""|[^"])*"|"(?:\\.|[^"\\])*"|'
    r'<[^>\n]+>|\n|[{}\[\]:=;,]|[^\s{}\[\]:=;,<"/]+|/(?![/*])|[^\s]'
)


@dataclass(eq=False)
class Node:
    doc: "Document"
    parent: "Node | None"
    kind: str
    start: int
    end: int
    line: int
    bases: list = field(default_factory=list)

    @property
    def location(self):
        return f"{self.doc.path}:{self.line}"

    @property
    def raw(self):
        return "".join(self.doc.tokens[self.start:self.end])

    @cached_property
    def entries(self):
        if self.kind == "value":
            raise Unsupported(f"{self.location} scalar used as collection")
        tokens = self.doc.tokens
        children = {}
        i = self.start
        while i < self.end:
            if tokens[i] in ("\n", ",", ";"):
                i += 1
                continue
            begin = i
            if self.kind == "object":
                name = tokens[i].strip('"')
                i += 1
                # Collections and inheritance headers may start on the following line.
                while i < self.end and tokens[i] == "\n":
                    i += 1
                if i < self.end and tokens[i] == "=":
                    i += 1
                    while i < self.end and tokens[i] == "\n":
                        i += 1
            else:
                name = str(len(children))
            bases = []
            if i < self.end and tokens[i] == ":":
                i += 1
                base_start = i
                while i < self.end and tokens[i] not in ("{", "["):
                    i += 1
                bases = "".join(tokens[base_start:i]).replace("\n", "").split(",")
            if i >= self.end:
                raise Unsupported(f"{self.location} incomplete value for {name}")
            if tokens[i] in ("{", "["):
                close = self.doc.closing[i]
                kind = "object" if tokens[i] == "{" else "list"
                node = Node(self.doc, self, kind, i + 1, close, self.doc.lines[begin], bases)
                i = close + 1
            else:
                value_start = i
                while i < self.end and tokens[i] not in ("\n", ",", ";"):
                    if tokens[i] in ("{", "["):
                        raise Unsupported(f"{self.doc.path}:{self.doc.lines[i]} unexpected collection")
                    i += 1
                node = Node(self.doc, self, "value", value_start, i, self.doc.lines[begin])
            if name in children:
                # Some source objects intentionally repeat fields outside our schema.
                # Preserve that ambiguity and reject it only when selected.
                children[name] = None
            else:
                children[name] = node
        return children


class Document:
    def __init__(self, path, source):
        self.path = path
        self.tokens = []
        self.lines = []
        self.closing = {}
        stack = []
        line = 1
        for token in TOKEN.findall(source):
            first_line = line
            line += token.count("\n")
            if token.startswith(("//", "/*")):
                if line == first_line:
                    continue
                token = "\n"
            index = len(self.tokens)
            if token in ("[", "{"):
                stack.append((token, index))
            elif token in ("]", "}"):
                if not stack:
                    raise Unsupported(f"{path}:{line} extra {token}")
                opening, start = stack.pop()
                if (opening, token) not in (("{", "}"), ("[", "]")):
                    raise Unsupported(f"{path}:{line} mismatched {opening}{token}")
                self.closing[start] = index
            self.tokens.append(token)
            self.lines.append(first_line)
        if stack:
            raise Unsupported(f"{path} unclosed collection")
        self.root = Node(self, None, "object", 0, len(self.tokens), 1)


class Reader:
    def __init__(self, data):
        self.data = data.resolve()
        self.docs = {}

    def load(self, path):
        path = (self.data / path).resolve()
        if not path.is_relative_to(self.data):
            raise Unsupported("Rule reference leaves the Data tree")
        key = path.relative_to(self.data).as_posix()
        if key not in self.docs:
            self.docs[key] = Document(key, path.read_text(encoding="utf-8-sig"))
        return self.docs[key].root

    def reference(self, node, ref, seen):
        ref = ref.removeprefix("&")
        if ref.startswith("<"):
            match = re.fullmatch(r"<([^>]+)>(?:/(.*))?", ref)
            if not match:
                raise Unsupported(f"{node.location} malformed reference")
            fname, ref = match.groups()
            path = (Path(fname[7:]) if fname.startswith("./Data/") else Path(node.doc.path).parent / fname)
            target = self.load(path)
        elif ref.startswith("~/"):
            target, ref = node.doc.root, ref[2:]
        elif ref.startswith("/"):
            target, ref = self.load("cosmoteer.rules"), ref[1:]
        else:
            target = node.parent
        steps = (ref or "").strip("/").split("/")
        while steps:
            step = steps.pop(0)
            if not step:
                continue
            if target is None:
                raise Unsupported(f"{node.location} reference exceeds root")
            if step == "..":
                target = target.parent
            elif step == "^":
                if not steps or not steps[0].isdigit():
                    raise Unsupported(f"{node.location} invalid inheritance index")
                index = int(steps.pop(0))
                if index >= len(target.bases):
                    raise Unsupported(f"{node.location} missing parent {index}")
                target = self.reference(target, target.bases[index], seen)
            elif step == ":":
                raise Unsupported(f"{node.location} virtual dispatch requires runtime context")
            else:
                target = self.child(target, step, seen)
        if target is None:
            raise Unsupported(f"{node.location} missing reference context")
        return target

    def follow(self, node, seen):
        if node.kind == "value" and node.raw.startswith("&"):
            if node in seen:
                raise Unsupported(f"{node.location} cyclic reference")
            try:
                target = self.reference(node, node.raw, seen | {node})
            except Missing as error:
                raise Unsupported(f"{node.location} broken reference {node.raw}") from error
            return self.follow(target, seen | {node})
        return node

    def child(self, node, key, seen=frozenset()):
        node = self.follow(node, seen)
        mark = (node, key)
        if mark in seen:
            raise Unsupported(f"{node.location} cyclic inheritance for {key}")
        seen = seen | {mark}
        if node.kind == "list" and node.bases:
            raise Unsupported(f"{node.location} inherited list indices")
        if key in node.entries:
            value = node.entries[key]
            if value is None:
                raise Unsupported(f"{node.location} ambiguous duplicate field {key}")
            return value
        for base in node.bases:
            try:
                parent = self.reference(node, base, seen)
            except Missing as error:
                raise Unsupported(f"{node.location} broken base {base}") from error
            try:
                return self.child(parent, key, seen)
            except Missing:
                pass
        raise Missing(key)

    def lookup(self, node, path):
        for key in path.split("/"):
            node = self.child(node, key)
        return self.follow(node, frozenset())


def number(raw):
    if not re.fullmatch(r"-?(?:\d+(?:\.\d*)?|\.\d+)(?:/-?(?:\d+(?:\.\d*)?|\.\d+))?", raw):
        raise Unsupported(f"unsupported numeric expression {raw[:100]}")
    if "/" in raw:
        top, bottom = raw.split("/")
        if float(bottom) == 0:
            raise Unsupported("zero denominator")
        return float(top) / float(bottom)
    return float(raw) if "." in raw else int(raw)


def convert(reader, node, style):
    node = reader.follow(node, frozenset())
    if style == "boolean" and node.kind == "value" and node.raw in ("true", "false"):
        return node.raw == "true"
    if style == "subtract_constant" and node.kind == "value":
        match = re.fullmatch(r"\((&[^()]+)\)-(\d+)", node.raw)
        if match:
            return convert(reader, reader.reference(node, match[1], set()), "number") - int(match[2])
    if style == "degrees" and node.kind == "value" and node.raw.endswith("d"):
        return number(node.raw[:-1])
    if style == "percent" and node.kind == "value" and node.raw.endswith("%"):
        return number(node.raw[:-1]) / 100
    if style == "power_of_ten" and node.kind == "value":
        match = re.fullmatch(r"(\d+(?:\.\d+)?)\*10\^(-?\d+)", node.raw)
        if match:
            return float(f"{match[1]}e{match[2]}")
    if style == "reference_ratio" and node.kind == "value":
        match = re.fullmatch(r"\((&[^()]+)\)/\((&[^()]+)\)", node.raw)
        if match:
            top, bottom = (convert(reader, reader.reference(node, ref, set()), "number") for ref in match.groups())
            if bottom != 0:
                return top / bottom
    if style in ("degrees", "percent", "power_of_ten", "reference_ratio", "boolean", "subtract_constant"):
        raise Unsupported(f"{node.location} unexpected {style} expression {node.raw[:100]}")
    if style == "speed":
        if node.kind == "object":
            directions = ("Up", "Down", "Left", "Right")
            if node.bases or set(node.entries) != set(directions):
                raise Unsupported(f"{node.location} unknown speed-factor layout")
            return {key.lower(): convert(reader, node.entries[key], "number") for key in directions}
        style = "number"
    if style in ("numbers", "words", "cost", "points"):
        if node.kind != "list" or node.bases:
            raise Unsupported(f"{node.location} expected a literal list")
        items = list(node.entries.values())
        if style == "points":
            points = [convert(reader, item, "numbers") for item in items]
            if any(len(point) != 2 for point in points):
                raise Unsupported(f"{node.location} expected two-dimensional coordinates")
            return points
        if style == "cost":
            costs = {}
            for pair in items:
                if pair.kind != "list" or pair.bases or len(pair.entries) != 2:
                    raise Unsupported(f"{pair.location} expected [resource, quantity]")
                key = convert(reader, pair.entries["0"], "word")
                if key in costs:
                    raise Unsupported(f"{pair.location} duplicate construction resource {key}")
                costs[key] = convert(reader, pair.entries["1"], "number")
            return costs
        item_type = "number" if style == "numbers" else "word"
        return [convert(reader, item, item_type) for item in items]
    if node.kind != "value":
        raise Unsupported(f"{node.location} expected scalar")
    if style == "number":
        return number(node.raw)
    if not re.fullmatch(r'"[^"\\]*"|[\w.-]+', node.raw):
        raise Unsupported(f"{node.location} unsupported literal {node.raw[:100]}")
    return node.raw.strip('"')


PART_FIELDS = {
    "id": ("ID", "word"), "name_key": ("NameKey", "word"), "group": ("EditorGroup", "word"),
    "groups": ("EditorGroups", "words"), "health_type": ("HealthType", "word"),
    "size": ("Size", "numbers"), "physical_rect": ("PhysicalRect", "numbers"),
    "max_health": ("MaxHealth", "number"), "mass": ("Mass", "number"),
    "density": ("Density", "number"), "crew_speed_factor": ("CrewSpeedFactor", "speed"),
    "categories": ("TypeCategories", "words"), "resources": ("Resources", "cost"),
}
RESOURCE_FIELDS = {
    "id": ("ID", "word"), "name_key": ("NameKey", "word"),
    "buy_price": ("BuyPrice", "number"), "max_stack_size": ("MaxStackSize", "number"),
    "max_per_nugget": ("MaxPerNugget", "number"),
}
BULLET = "BulletEmitter/Bullet/"
HIT = BULLET + "Components/Hit/"
STAT_PATHS = {
    "reactor_small": {
        "battery_capacity": "BatteryStorage/MaxResources",
        "pickup_quantity": "BatteryStorage/MaxResourcesPickUp",
        "production_quantity": "BatteryProducer/ToQuantity/BaseValue",
        "production_interval": "BatteryProducer/Interval/BaseValue",
    },
    "laser_blaster_small": {
        "battery_capacity": "BatteryStorage/MaxResources", "crew_required": "PartCrew/Crew",
        "resupply_threshold": "BatteryConsumer/ResupplyThreshold",
        "fire_interval": "Turret/FireInterval/BaseValue", "fire_delay": "BulletEmitter/FireDelay",
        "battery_per_shot": "BulletEmitter/ResourcesUsed", "min_resources_used": "BulletEmitter/MinResourcesUsed",
        "projectile_speed": BULLET + "Speed", "range": BULLET + "Range",
        "damage": HIT + "HitOperational/HitEffects/0/Damage/BaseValue",
        "structural_damage": HIT + "HitStructural/HitEffects/0/Damage/BaseValue",
    },
    "crew_quarters_small": {"crew_capacity": "CrewSource/Crew"},
    "control_room_small": {
        "crew_required": "PartCrew/Crew", "command_capacity": "CommandProvider/CommandPoints",
        "battery_capacity": "BatteryStorage/MaxResources", "drain_quantity": "PowerDrain/FromQuantity",
        "resupply_threshold": "BatteryConsumer/ResupplyThreshold",
        "drain_interval": "PowerDrain/Interval",
    },
}

# Standard, unbuffed engines share component wiring. The boosted and modular
# rocket families switch components or receive neighbor buffs and are separate.
STANDARD_THRUSTERS = {
    "thruster_small": ["MainThruster"],
    "thruster_small_2way": ["MainThrusterBottom", "MainThrusterRight"],
    "thruster_small_3way": ["MainThrusterBottom", "MainThrusterRight", "MainThrusterLeft"],
    "thruster_med": ["MainThruster"], "thruster_large": ["MainThruster"], "thruster_huge": ["MainThruster"],
}
NOZZLE_FIELDS = {
    "location": ("Location", "numbers"), "rotation_deg": ("Rotation", "degrees"),
    "min_activation": ("MinActivation", "number"), "max_activation": ("MaxActivation", "base_number"),
    "thrust_force": ("Force", "base_number"), "ramp_up": ("ActivationIncreaseTime", "base_number"),
    "ramp_down": ("ActivationDecreaseTime", "base_number"), "recovery_time": ("ActivationRecoveryTime", "base_number"),
    "fuel_per_second": ("FuelUsagePerSecond", "base_number"), "fuel_storage": ("FuelStorage", "word"),
    "activation_toggle": ("SoftOperationalToggle", "word"),
}
THRUSTER_FIELDS = {
    "battery_capacity": ("Components/BatteryStorage/MaxResources", "number"),
    "fuel_resource": ("Components/BatteryStorage/ResourceType", "word"),
    "command_required": ("Components/CommandConsumer/CommandPoints", "number"),
    "resupply_threshold": ("Components/ToggledBatteryConsumer/Components/BatteryConsumer/ResupplyThreshold", "number"),
}
DYNAMO_FIELDS = {
    "self_recharge_per_second": ("FuelRecharge", "number"),
    "production_quantity": ("Components/BatteryProducer/ToQuantity", "number"),
    "production_interval": ("Components/BatteryProducer/Interval/BaseValue", "reference_ratio"),
    "production_toggle": ("Components/BatteryProducer/OperationalToggle", "word"),
    "battery_toggle_on": ("Components/BatteryStorage/ToggleOnResources", "number"),
    "battery_toggle_off": ("Components/BatteryStorage/ToggleOffResources", "number"),
}
TURRET_FIELDS = {
    "turret_location": ("Components/Turret/Location", "numbers"),
    "turret_rotation_deg": ("Components/Turret/Rotation", "degrees"),
    "firing_arc_deg": ("Components/Turret/FiringArc", "degrees"),
    "rotate_speed_deg": ("Components/Turret/RotateSpeed", "degrees"),
    "fire_threshold_deg": ("Components/Turret/FireThresholdAngle", "degrees"),
}
SHIP_PHYSICS = {
    "linear_drag_type": ("LinearDrag/Type", "word"),
    "linear_drag_coefficient": ("LinearDrag/Coefficient", "power_of_ten"),
    "linear_drag_exponent": ("LinearDrag/Exponent", "number"),
    "linear_min_damping": ("LinearDrag/MinDampingCoefficient", "percent"),
    "angular_drag_type": ("AngularDrag/Type", "word"),
    "angular_drag_coefficient": ("AngularDrag/Coefficient", "percent"),
    "rotational_inertia_factor": ("RotationalInertiaFactor", "number"),
    "max_abs_angular_velocity": ("MaxAbsAngularVelocity", "number"),
    "restitution": ("Restitution", "number"),
    "thruster_update_interval": ("ThrusterUpdateInterval", "numbers"),
    "thruster_solver_iterations": ("ThrusterSolverIterations", "number"),
    "uncommanded_thruster_shutdown_delay": ("UncommandedThrusterShutdownDelay", "number"),
    "max_linear_magic_acceleration": ("MaxLinearMagicAcceleration", "number"),
}

# These parts have dynamic behavior beyond a standard nozzle profile. Keep their
# source parameters distinct so a flight implementation can opt into each model.
SPECIAL_THRUSTERS = {
    "thruster_boost": {
        "normal_force": ("ThrusterForce", "number"), "boost_force": ("BoostedThrusterForce", "number"),
        "normal_fuel_per_second": ("FuelUsage", "number"), "boost_fuel_per_second": ("BoostedFuelUsage", "number"),
        "boost_drain_quantity": ("BoostedPowerDrain/BaseValue", "number"),
        "boost_drain_interval": ("BoostedPowerDrainInterval", "number"),
        "battery_capacity": ("Components/RealBatteryStorage/MaxResources", "number"),
        "full_battery_gate": ("Components/FullAmmoToggle/ToggleOnResources", "number"),
        "boost_switch_id": ("Components/BoostToggle/ToggleID", "word"),
        "battery_toggle_on": ("Components/RealBatteryStorage/ToggleOnResources", "subtract_constant"),
        "battery_toggle_off": ("Components/RealBatteryStorage/ToggleOffResources", "number"),
        "full_battery_off": ("Components/FullAmmoToggle/ToggleOffResources", "subtract_constant"),
        "boost_default": ("Components/BoostToggle/Default", "number"),
        "boost_start_gate": ("Components/BoostToggle/OperationalToggle", "word"),
        "boost_auto_off_triggers": ("Components/AutoBoostOffTrigger/Triggers", "words"),
        "overclock_off_trigger_toggle": ("Components/OverclockDisabledTrigger/Toggle", "word"),
        "battery_off_triggers_auto_off": ("Components/BatteryDepletedTrigger/TriggerWhenOff", "boolean"),
        "boost_stop_gate_toggles": ("Components/BoostOffInstantDrainToggles/Toggles", "words"),
        "boost_stop_gate_mode": ("Components/BoostOffInstantDrainToggles/Mode", "word"),
        "boost_stop_gate_falling": ("Components/BoostOffInstantDrainTrigger/TriggerWhenOff", "boolean"),
        "boost_stop_gate_rising": ("Components/BoostOffInstantDrainTrigger/TriggerWhenOn", "boolean"),
        "boost_stop_gate": ("Components/BoostOffInstantDrainTrigger/OperationalToggle", "word"),
        "boost_stop_gate_inverted": ("Components/BoostOffInstantDrainTrigger/InvertOperationalToggle", "boolean"),
        "boost_stop_drain": ("Components/BoostOffInstantDrain/Amount", "number"),
        "boost_drain_initial_delay": ("Components/BoostOnComponents/Components/PowerDrain/InitialDelay", "number"),
        "boost_drain_auto_start": ("Components/BoostOnComponents/Components/PowerDrainTimer/AutoStart", "boolean"),
        "boost_drain_repeats": ("Components/BoostOnComponents/Components/PowerDrainTimer/Repeats", "boolean"),
        "receive_gate_mode": ("Components/CanReceivePower/Mode", "word"),
        "receive_gate_toggle": ("Components/CanReceivePower/Toggles/0/Toggle", "word"),
        "receive_gate_inverted": ("Components/CanReceivePower/Toggles/0/Invert", "boolean"),
        "receive_other_gate": ("Components/CanReceivePower/Toggles/1", "word"),
        "command_required": ("Components/CommandConsumer/CommandPoints", "number"),
    },
    "thruster_rocket_nozzle": {
        "base_force": ("ThrusterForce/BaseValue", "number"),
        "force_buff": ("ThrusterForce/BuffType", "word"),
        "ramp_up": ("ThrustIncreaseTime/BaseValue", "number"),
        "ramp_down": ("ThrustDecreaseTime/BaseValue", "number"),
        "recovery_time": ("ThrustRecoveryTime/BaseValue", "number"),
        "fuel_per_second": ("FuelUsage", "number"),
        "crew_required": ("Components/PartCrew/Crew", "number"),
        "crew_locations": ("Components/PartCrew/CrewDestinations", "points"),
        "fuel_storage": ("Components/MainThruster/FuelStorage", "word"),
        "local_battery_capacity": ("Components/LocalBatteryStorage/MaxResources", "number"),
        "location": ("Components/MainThruster/Location", "numbers"),
        "rotation_deg": ("Components/MainThruster/Rotation", "degrees"),
        "command_required": ("Components/CommandConsumer/CommandPoints", "number"),
        "stage_stack": ("Components/EngineBuffProvider/BuffAmount/BaseValue", "percent"),
        "stage_stack_gate": ("Components/EngineBuffProvider/OperationalToggle", "word"),
        "minimum_thrust_stack": ("Components/ThrustBuffProvider/BuffAmount/MinValue", "number"),
        "normal_ramp_power": ("Components/One/Value", "number"),
        "overclock_ramp_power": ("Components/Overclock_RampExponent/Value", "number"),
        "ramp_power_operator": ("Components/RampUpExponentOperation/Operator", "word"),
        "ramp_combine_mode": ("Components/RampUpFinalValue/Mode", "word"),
        "thrust_inverse_mode": ("Components/InvThrustBuffValue/Value/BuffMode", "word"),
        "operation_multiplier_range": ("Components/OperationBuffMultiplier/OutputRange", "numbers"),
        "operation_buff_area": ("Components/RocketOperationBuffProvider/BuffArea", "numbers"),
        "activation_buff_mode": ("Components/MainThruster/MaxActivation/BuffMode", "word"),
        "ramp_down_buff_mode": ("ThrustDecreaseTime/BuffMode", "word"),
    },
    "thruster_rocket_extender": {
        "local_battery_capacity": ("Components/LocalBatteryStorage/MaxResources", "number"),
        "propagated_buff": ("Components/RocketExtraForceBuffProvider/BuffType", "word"),
        "stage_stack": ("Components/EngineBuffProvider/BuffAmount/BaseValue", "percent"),
        "stage_stack_gate": ("Components/EngineBuffProvider/OperationalToggle", "word"),
        "stack_buff_area": ("Components/RocketBuffProvider/BuffArea", "numbers"),
        "operation_buff_area": ("Components/RocketOperationBuffProvider/BuffArea", "numbers"),
        "overclock_extra_force": ("Components/RocketExtraForceSelfValue/Value/MaxValue", "number"),
    },
    "thruster_rocket_battery": {
        "local_battery_capacity": ("Components/LocalBatteryStorage/MaxResources", "number"),
        "connection_buff": ("Components/LeftBatteryConnectionProvider/BuffType", "word"),
    },
}

ROCKET_STAGE_STORAGE = {
    "stage_capacity_limit": ("Components/ToggledExtendableBatteryStorage/LimitMaxResources", "number"),
    "stage_storages": ("Components/ExtendableBatteryStorage/ResourceStorages", "words"),
    "aggregate_storages": ("Components/CombinedBatteryStorage/ResourceStorages", "words"),
    "aggregate_add_mode": ("Components/CombinedBatteryStorage/AddMode", "word"),
    "aggregate_remove_mode": ("Components/CombinedBatteryStorage/RemoveMode", "word"),
    "upstream_storage_gate": ("Components/PrevCombinedBatteryStorage/ProxyToggle", "word"),
}
ROCKET_BUFFS = {
    "thrust_exponent": ("RocketThrust/Exponent", "number"), "ramp_exponent": ("RocketRampUp/Exponent", "number"),
    "thrust_initial": ("RocketThrust/BaseValue", "percent"), "ramp_initial": ("RocketRampUp/BaseValue", "percent"),
    "stack_combine_mode": ("Rocket/CombineMode", "word"), "thrust_combine_mode": ("RocketThrust/CombineMode", "word"),
    "ramp_combine_buff_mode": ("RocketRampUp/CombineMode", "word"), "engine_base": ("Engine/BaseValue", "percent"),
}
SPECIAL_OVERCLOCK_FIELDS = {
    "thruster_boost": {
        "normal_force": ("THRUST", "number"), "boost_force": ("BOOST_THRUST", "number"),
        "normal_force_factor": ("THRUST_FACTOR", "reference_ratio"),
        "boost_force_factor": ("BOOST_THRUST_FACTOR", "reference_ratio"),
        "max_power_usage_factor": ("MAX_POWER_USAGE_FACTOR", "percent"),
        "boost_max_power_usage_factor": ("BOOST_MAX_POWER_USAGE_FACTOR", "percent"),
        "boost_power_ramp_time": ("BOOST_POWER_RAMP_TIME", "number"),
        "thrust_heat_per_second": ("THRUST_HEAT_PER_SECOND", "number"),
        "base_boost_heat_factor": ("BASE_BOOST_HEAT_FACTOR", "percent"),
        "boost_heat_factor_per_battery": ("BOOST_HEAT_FACTOR_PER_BATTERY", "percent"),
        "boost_heat_factor_per_second": ("BOOST_HEAT_FACTOR_PER_SECOND", "percent"),
    },
    "thruster_rocket_nozzle": {
        "ramp_power": ("RAMP_EXPONENT", "number"), "thrust_heat_per_second": ("THRUST_HEAT_PER_SECOND", "number"),
    },
    "thruster_rocket_extender": {
        "extra_force": ("BONUS_FORCE", "number"), "thrust_heat_per_second": ("THRUST_HEAT_PER_SECOND", "number"),
    },
}


def extract_fields(reader, node, fields, unresolved, required=()):
    output = {}
    sources = {}
    for key, (path, style) in fields.items():
        field_node = node
        try:
            field_node = reader.lookup(node, path)
            if style == "base_number":
                if field_node.kind == "object":
                    field_node = reader.lookup(field_node, "BaseValue")
                style = "number"
            output[key] = convert(reader, field_node, style)
            sources[key] = field_node.location
        except Missing:
            output[key] = None
            if key in required:
                unresolved.append({"source": node.location, "field": path, "reason": "missing required field"})
        except (Unsupported, OSError) as error:
            output[key] = None
            unresolved.append({"source": field_node.location, "field": path, "reason": str(error)})
    return output, sources


def nozzle_profile(reader, source, component, unresolved):
    paths = {key: (f"Components/{component}/{path}", style) for key, (path, style) in NOZZLE_FIELDS.items()}
    nozzle, lines = extract_fields(reader, source, paths, unresolved, paths)
    nozzle["component"] = component.split("/")[-1]
    return nozzle, lines


def extract_socket(reader, source, component, unresolved):
    prefix = f"Components/{component}/"
    fields = {"offset": (prefix + "PartLocation", "numbers"),
              "target_component": (prefix + "ComponentID", "word"),
              "rotation": (prefix + "PartCriteria/Rot", "number"),
              "id": (prefix + "PartCriteria/ID", "word"), "ids": (prefix + "PartCriteria/IDs", "words")}
    for edge in ("Top", "Bottom", "Left", "Right"):
        fields[edge.lower()] = (prefix + "PartCriteria/" + edge, "number")
    values, origins = extract_fields(reader, source, fields, unresolved, ("offset", "rotation", "target_component"))
    if values["id"] is not None and values["ids"] is None:
        values["ids"], origins["ids"] = [values["id"]], origins["id"]
    elif values["ids"] is None or values["id"] is not None:
        raise Unsupported(f"{source.location} expected one target ID or IDs field in {prefix}")
    values.pop("id")
    origins.pop("id", None)
    return {key: value for key, value in values.items() if value is not None}, origins


def special_propulsion(reader, source, short, unresolved):
    fields = dict(SPECIAL_THRUSTERS[short])
    consumer = "Components/ToggledBatteryConsumer/Components/BatteryConsumer/"
    fields.update({"resupply_threshold": (consumer + "ResupplyThreshold", "number"),
                   "resupply_storage": (consumer + "Storage", "word"),
                   "resupply_gate": (consumer + "OperationalToggle", "word"),
                   "operational_gates": ("Components/IsOperational/Toggles", "words"),
                   "operational_gate_mode": ("Components/IsOperational/Mode", "word")})
    is_stage = short in ("thruster_rocket_nozzle", "thruster_rocket_extender")
    if is_stage:
        fields.update(ROCKET_STAGE_STORAGE)
        fields["blocked_travel_cells"] = ("BlockedTravelCells", "points")
        fields["force_manhattan_path"] = ("ForceManhattanPathInPart", "boolean")
    if short == "thruster_rocket_battery":
        fields["stage_storages"] = ("Components/ExtendableBatteryStorage/ResourceStorages", "words")
    profile, origins = extract_fields(reader, source, fields, unresolved, fields)
    if short in SPECIAL_OVERCLOCK_FIELDS:
        clock_fields = {"overclock." + key: ("OVERCLOCK/" + path, style)
                        for key, (path, style) in SPECIAL_OVERCLOCK_FIELDS[short].items()}
        clock_data, lines = extract_fields(reader, source.doc.root, clock_fields, unresolved, clock_fields)
        profile["overclock"] = {key.removeprefix("overclock."): value for key, value in clock_data.items()}
        origins.update(lines)
    if short == "thruster_boost":
        for key, component in [("normal_nozzle", "BoostOffComponents/Components/MainThruster"),
                               ("boost_nozzle", "BoostOnComponents/Components/MainThrusterBoosted")]:
            profile[key], lines = nozzle_profile(reader, source, component, unresolved)
            origins.update({key + "." + field: value for field, value in lines.items()})
        return profile, origins

    if short == "thruster_rocket_nozzle":
        if profile["crew_locations"] is not None:
            for index in range(len(profile["crew_locations"])):
                origins[f"crew_locations.{index}"] = reader.lookup(
                    source, f"Components/PartCrew/CrewDestinations/{index}").location
        buffs = reader.lookup(reader.load("cosmoteer.rules"), "Buffs")
        values, lines = extract_fields(reader, buffs, ROCKET_BUFFS, unresolved, ROCKET_BUFFS)
        profile.update(values)
        origins.update(lines)
    if is_stage:
        components = {"previous": "PrevCombinedBatteryStorage", "left_battery": "LeftBatteryStorage",
                      "right_battery": "RightBatteryStorage"}
        if short == "thruster_rocket_extender":
            components["next"] = "IsConnectedProxy"
    else:
        components = {"left": "LeftExtendableBatteryStorage", "right": "RightExtendableBatteryStorage"}
    sockets = {}
    for key, component in components.items():
        sockets[key], lines = extract_socket(reader, source, component, unresolved)
        origins.update({f"sockets.{key}.{field}": value for field, value in lines.items()})
    profile["sockets"] = sockets
    return profile, origins


def extract_part_stats(reader, source, short, unresolved):
    fields = {key: ("Components/" + path, "number") for key, path in STAT_PATHS.get(short, {}).items()}
    if short == "laser_blaster_small":
        fields.update(TURRET_FIELDS)
    if short in STANDARD_THRUSTERS:
        fields.update(THRUSTER_FIELDS)
        if short.startswith("thruster_small"):
            fields.update(DYNAMO_FIELDS)
    stats, origins = extract_fields(reader, source, fields, unresolved, fields)
    if short in SPECIAL_THRUSTERS:
        stats["special_propulsion"], lines = special_propulsion(reader, source, short, unresolved)
        origins.update({"special_propulsion." + key: line for key, line in lines.items()})
    if short in STANDARD_THRUSTERS:
        nozzles = []
        for component in STANDARD_THRUSTERS[short]:
            nozzle, lines = nozzle_profile(reader, source, component, unresolved)
            origins.update({f"nozzles.{len(nozzles)}.{key}": line for key, line in lines.items()})
            if not nozzles:
                for key in ("thrust_force", "ramp_up", "ramp_down", "recovery_time", "fuel_per_second"):
                    stats[key] = nozzle[key]
                    if key in lines:
                        origins[key] = lines[key]
            nozzles.append(nozzle)
        stats["nozzles"] = nozzles
    return stats, origins


def inventory(data):
    extensions = Counter()
    rules = Counter()
    directories = Counter()
    for path in data.rglob("*"):
        if path.is_file():
            suffix = path.suffix.lower() or "(none)"
            extensions[suffix] += 1
            relative = path.relative_to(data)
            directory = relative.parts[0] if len(relative.parts) > 1 else "."
            directories[directory] += 1
            if suffix == ".rules":
                rules[directory] += 1
    return {"files": sum(extensions.values()), "rules": sum(rules.values()),
            "by_extension": dict(sorted(extensions.items())), "files_by_directory": dict(sorted(directories.items())),
            "rules_by_directory": dict(sorted(rules.items()))}


def extract(data):
    reader = Reader(data)
    unresolved = []
    catalogue = {"schema_version": 1, "inventory": inventory(data), "unresolved": unresolved}
    registries = [
        ("parts", "ships/terran/terran.rules", "Terran/Parts", PART_FIELDS),
        ("resources", "resources/resources.rules", "Resources", RESOURCE_FIELDS),
    ]
    for name, file, registry_path, fields in registries:
        entries = reader.lookup(reader.load(file), registry_path)
        if entries.kind != "list" or entries.bases:
            raise Unsupported(f"{entries.location} unsupported registry layout")
        records = []
        ids = set()
        for entry in entries.entries.values():
            source = reader.follow(entry, frozenset())
            required = ("id", "size", "max_health") if name == "parts" else ("id",)
            record, provenance = extract_fields(reader, source, fields, unresolved, required)
            record.update(source=source.doc.path, provenance=provenance)
            if not record["id"] or record["id"] in ids:
                raise Unsupported(f"{entry.location} absent or duplicate ID in {name}")
            ids.add(record["id"])
            if name == "parts":
                if record["groups"] and record["group"] is None:
                    record["group"] = record["groups"][0]
                    provenance["group"] = provenance["groups"]
                elif record["groups"] is None and record["group"]:
                    record["groups"] = [record["group"]]
                    provenance["groups"] = provenance["group"]
                if isinstance(record["crew_speed_factor"], dict):
                    record["crew_speed_factor_by_direction"] = record["crew_speed_factor"]
                    provenance["crew_speed_factor_by_direction"] = provenance.pop("crew_speed_factor")
                    record["crew_speed_factor"] = None
                short = record["id"].removeprefix("cosmoteer.")
                record["stats"], origins = extract_part_stats(reader, source, short, unresolved)
                provenance.update({"stats." + key: value for key, value in origins.items()})
            records.append(record)
        catalogue[name] = records
    crew = reader.load("crew/crew.rules")
    catalogue["crew"], sources = extract_fields(reader, crew, {"base_speed": ("BaseSpeed", "number")}, unresolved, ("base_speed",))
    catalogue["crew"]["provenance"] = sources
    terran = reader.lookup(reader.load("ships/terran/terran.rules"), "Terran")
    physics, origins = extract_fields(reader, terran, SHIP_PHYSICS, unresolved, SHIP_PHYSICS)
    catalogue["ship_physics"] = {**physics, "provenance": origins}
    return catalogue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True, help="local Cosmoteer/Data directory")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data/catalog.json")
    args = parser.parse_args()
    catalogue = extract(args.data)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(catalogue['parts'])} parts, {len(catalogue['resources'])} resources, "
          f"{len(catalogue['unresolved'])} unresolved fields -> {args.output}")


if __name__ == "__main__":
    main()
