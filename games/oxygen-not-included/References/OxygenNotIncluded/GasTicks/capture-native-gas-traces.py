#!/usr/bin/env python3
"""Capture isolated gas cases with the installed ONI SimDLL, without starting the game."""

from __future__ import annotations

import argparse
import ctypes as C
import hashlib
import json
import math
import struct
import time
from pathlib import Path

import yaml


WORLD_W = WORLD_H = 32
SEED = 73
DT = 0.2
PREPARE_GAME_DATA = 1078620451
NEW_GAME_FRAME = -775326397
SIM_ELEMENT_TABLE = 1108437482
SIM_DISEASE_TABLE = 825301935
ALLOCATE_CELLS = 1092408308
INIT_FROM_CELLS = 2062421945
DEFINE_WORLD_OFFSETS = -895846551
SIM_START = -931446686


def pack(fmt: str, *values) -> bytes:
    return struct.pack("<" + fmt, *values)


def sim_hash(name: str | None) -> int:
    h = 0
    for ch in (name or "").lower():
        h = (ord(ch) + 65599 * h) & 0xFFFFFFFF
    return C.c_int32(h).value


class NativeView(C.Structure):
    _pack_ = 4
    _fields_ = [
        ("frames", C.c_int),
        ("elements", C.POINTER(C.c_uint16)),
        ("temperature", C.POINTER(C.c_float)),
        ("mass", C.POINTER(C.c_float)),
    ]


def load_base_elements(data_dir: Path) -> list[dict]:
    entries: list[dict] = []
    seen_hashes: set[int] = set()
    for yaml_path in sorted((data_dir / "StreamingAssets" / "elements").glob("*.yaml")):
        document = yaml.safe_load(yaml_path.read_bytes()) or {}
        for entry in document.get("elements", []):
            if entry.get("dlcId", ""):
                continue
            element_hash = sim_hash(entry["elementId"])
            if element_hash in seen_hashes:
                continue
            seen_hashes.add(element_hash)
            entries.append(entry)

    # ElementLoader.FinaliseElementsTable sorts by (state & Solid) descending,
    # then by the signed SimHashes value before assigning table indexes.
    phase = {"Vacuum": 0, "Gas": 1, "Liquid": 2, "Solid": 3}
    entries.sort(key=lambda e: (-phase[e["state"]], sim_hash(e["elementId"])))
    return entries


def build_cases() -> list[dict]:
    cases: list[dict] = []
    for element, temp_k in (("Oxygen", 293.15), ("Hydrogen", 293.15), ("CarbonDioxide", 293.15), ("Steam", 400.0)):
        cases.append({
            "caseId": f"pair-horizontal-{element}", "role": "calibration",
            "tempK": temp_k, "ticks": 8,
            "gases": [{"x": 1, "y": 2, "element": element, "massKg": 2.0}, {"x": 2, "y": 2, "element": "Vacuum", "massKg": 0.0}],
        })
        cases.append({
            "caseId": f"pair-vertical-{element}", "role": "calibration",
            "tempK": temp_k, "ticks": 8,
            "gases": [{"x": 2, "y": 1, "element": element, "massKg": 2.0}, {"x": 2, "y": 2, "element": "Vacuum", "massKg": 0.0}],
        })

    pair_types = (("Oxygen", "Hydrogen", 293.15), ("Oxygen", "CarbonDioxide", 293.15), ("Hydrogen", "CarbonDioxide", 293.15))
    for a, b, temp_k in pair_types:
        for axis in ("horizontal", "vertical"):
            coords = ((1, 2), (2, 2)) if axis == "horizontal" else ((2, 1), (2, 2))
            cases.append({
                "caseId": f"hetero-{axis}-{a}-{b}", "role": "calibration",
                "tempK": temp_k, "ticks": 8,
                "gases": [
                    {"x": coords[0][0], "y": coords[0][1], "element": a, "massKg": 2.0},
                    {"x": coords[1][0], "y": coords[1][1], "element": b, "massKg": 2.0},
                ],
            })

    # In y-down output, stable placement puts the less dense species above.
    # Each inversion pair holds the same species, mass, temperature, and geometry.
    for upper, lower, temp_k in (("Hydrogen", "Oxygen", 293.15), ("Hydrogen", "CarbonDioxide", 293.15), ("Oxygen", "CarbonDioxide", 293.15), ("Steam", "Oxygen", 400.0)):
        for placement, top, bottom, role in (
            ("stable", upper, lower, "calibration"),
            ("inverted", lower, upper, "holdout"),
        ):
            cases.append({
                "caseId": f"buoyancy-{placement}-{top}-{bottom}", "role": role,
                "tempK": temp_k, "ticks": 8,
                "gases": [
                    {"x": 2, "y": 1, "element": top, "massKg": 2.0},
                    {"x": 2, "y": 2, "element": bottom, "massKg": 2.0},
                ],
            })

    cases.append({
        "caseId": "room-oxygen-center-to-vacuum", "role": "holdout",
        "tempK": 293.15, "ticks": 12,
        "openCells": [[x, y] for y in range(1, 4) for x in range(1, 4)],
        "gases": [{"x": 2, "y": 2, "element": "Oxygen", "massKg": 2.0}],
    })
    cases.append({
        "caseId": "thermal-contact-oxygen-20c-80c", "role": "holdout",
        "tempK": 293.15, "ticks": 12,
        "gases": [
            {"x": 1, "y": 2, "element": "Oxygen", "massKg": 1.0, "tempK": 293.15},
            {"x": 2, "y": 2, "element": "Oxygen", "massKg": 1.0, "tempK": 353.15},
        ],
    })
    room_cells = [[x, y] for y in range(1, 4) for x in range(1, 4)]
    cases.append({
        "caseId": "room-holdout-center-3p75kg-offset-0p65kg-vacuum",
        "role": "holdout", "tempK": 293.15, "ticks": 16,
        "openCells": room_cells,
        "gases": [
            {"x": 2, "y": 2, "element": "Oxygen", "massKg": 3.75},
            {"x": 3, "y": 1, "element": "Oxygen", "massKg": 0.65},
        ],
    })
    cases.append({
        "caseId": "room-holdout-center-3p75kg-offset-0p65kg-seven-0p1kg",
        "role": "holdout", "tempK": 293.15, "ticks": 16,
        "openCells": room_cells,
        "gases": [
            {"x": 2, "y": 2, "element": "Oxygen", "massKg": 3.75},
            {"x": 3, "y": 1, "element": "Oxygen", "massKg": 0.65},
            *[{"x": x, "y": y, "element": "Oxygen", "massKg": 0.1}
              for y in range(1, 4) for x in range(1, 4) if (x, y) not in ((2, 2), (3, 1))],
        ],
    })

    mass_probes = (0.005, 5e-10, 1e-9, 1.1e-9, 0.5, 2.0, 10.0, 12.0, 100.0, 1000.0)
    for mass in mass_probes:
        label = f"{mass:g}".replace(".", "p").replace("-", "m")
        cases.append({
            "caseId": f"oxygen-isolated-mass-{label}-kg", "role": "limit-probe" if mass < 0.01 or mass >= 10 else "holdout",
            "tempK": 293.15, "ticks": 2,
            "gases": [{"x": 2, "y": 2, "element": "Oxygen", "massKg": mass}],
        })
    return cases


def build_density_case(layout: str) -> dict:
    """Build the separately measured 140-pair full-world density probe."""
    species = {
        "oh": ("Oxygen", "Hydrogen", "Hydrogen"),
        "co": ("CarbonDioxide", "Oxygen", "Oxygen"),
        "os": ("Oxygen", "Steam", "Steam"),
        "ho": ("Hydrogen", "Oxygen", "Oxygen"),
    }
    if layout not in species:
        raise ValueError(f"Unknown density layout: {layout}")
    top, bottom, flipped_species = species[layout]
    native_pairs = [(x, y) for y in range(2, 30, 3) for x in range(2, 30, 2)]
    # The supplied SimDLL probes index native rows bottom-up; persisted traces use y-down.
    pairs = [(x, WORLD_H - 1 - y) for x, y in native_pairs]
    return {
        "caseId": f"density-inversion-{layout}", "role": "additional-validation",
        "tempK": 423.15, "ticks": 120, "fullWorld": True,
        "openCells": [[x, y] for x, y in pairs] + [[x, y + 1] for x, y in pairs],
        "gases": [placement for x, y in pairs for placement in (
            {"x": x, "y": y, "element": top, "massKg": 2.0},
            {"x": x, "y": y + 1, "element": bottom, "massKg": 2.0},
        )],
        "densityProbe": {"layout": layout, "topElement": top, "bottomElement": bottom,
                         "detectedFlipElement": flipped_species, "pairCount": len(pairs),
                         "pairCoordinates": pairs},
        "traceCells": [[x, y] for x, y in pairs] + [[x, y + 1] for x, y in pairs],
    }


def build_corner_case(openings: int) -> dict:
    if openings not in (0, 1, 2):
        raise ValueError("Corner probe openings must be 0, 1, or 2")
    native_cells = [(15, 15), (16, 16)]
    if openings > 0:
        native_cells.append((15, 16))
    if openings > 1:
        native_cells.append((16, 15))
    cells = [(x, WORLD_H - 1 - y) for x, y in native_cells]
    return {
        "caseId": f"corner-opening-{openings}", "role": "additional-validation",
        "tempK": 293.15, "ticks": 16, "fullWorld": True,
        "openCells": [[x, y] for x, y in cells],
        "gases": [{"x": 15, "y": WORLD_H - 1 - 15, "element": "Oxygen", "massKg": 2.0}],
        "cornerProbe": {"openingCount": openings, "openCoordinates": cells},
        "traceCells": cells,
    }


def build_max_mass_cases() -> list[dict]:
    return [{
        "caseId": f"oxygen-isolated-mass-{mass:g}-kg", "role": "additional-validation",
        "tempK": 293.15, "ticks": 2,
        "gases": [{"x": 2, "y": 2, "element": "Oxygen", "massKg": mass}],
    } for mass in (1001, 9999, 10000, 10001, 20000, 100000, 1000000)]


def encode_sim_element(entry: dict, index: int, indexes: dict[str, int]) -> bytes:
    get = entry.get
    element_id = get("elementId", "")
    phase = {"Vacuum": 0, "Gas": 1, "Liquid": 2, "Solid": 3}[get("state", "Vacuum")]
    state = phase
    if not get("thermalConductivity", 0):
        state |= 16  # Element.State.TemperatureInsulated
    if not get("strength", 0):
        state |= 4  # Element.State.Unbreakable
    if "Unstable" in (get("tags") or []):
        state |= 8  # Sim.Element adds this from GameTags.Unstable

    transition = lambda key: indexes.get(get(key, ""), 0xFFFF)
    packed = pack(
        "iHHHBB", sim_hash(element_id),
        transition("lowTempTransitionTarget"), transition("highTempTransitionTarget"),
        index, state, 1,
    )
    packed += pack("14f", *[get(key, 0) for key in (
        "specificHeatCapacity", "thermalConductivity", "molarMass",
        "solidSurfaceAreaMultiplier", "liquidSurfaceAreaMultiplier", "gasSurfaceAreaMultiplier",
        "flow", "speed", "minHorizontalFlow", "minVerticalFlow",
    )], 1.8 if phase == 1 else get("maxMass", 0),
        get("lowTemp", 0) if get("lowTemp") is not None else 0,
        get("highTemp", 10000) if get("highTemp") is not None else 10000,
        get("strength", 0))
    packed += pack("ififHH",
        sim_hash(get("lowTempTransitionOreId")), get("lowTempTransitionOreMassConversion", 0),
        sim_hash(get("highTempTransitionOreId")), get("highTempTransitionOreMassConversion", 0),
        transition("sublimateId"), transition("convertId"))
    # Material properties, color and six gradient colors are presentation-only here.
    packed += pack("8Ii", 0, 0xFFFFFFFF, *([0xFFFFFFFF] * 6), 0)
    packed += pack("10f", *[get(key, 0) for key in (
        "sublimateRate", "sublimateEfficiency", "sublimateProbability", "offGasPercentage",
        "lightAbsorptionFactor", "radiationAbsorptionFactor", "radiationPer1000Mass",
    )], get("defaultTemperature", 0), 1.0 if phase == 1 else get("defaultMass", 0), get("defaultPressure", 0))
    return packed


def cell_state(element: str, mass: float) -> str:
    if element == "Vacuum" or mass == 0:
        return "vacuum"
    if element == "Unobtanium":
        return "solid"
    return "gas"


def build_world(cases: list[dict], indexes: dict[str, int]) -> tuple[bytes, list[dict]]:
    cells = [("Unobtanium", 20000.0, 293.15) for _ in range(WORLD_W * WORLD_H)]
    placed: list[dict] = []
    for case_index, case in enumerate(cases):
        full_world = case.get("fullWorld", False)
        row, column = divmod(case_index, 6)
        origin_x, origin_y = case.pop("fixedOrigin", (0, 0) if full_world else (column * 5, row * 5))
        chamber_width, chamber_height = (WORLD_W, WORLD_H) if full_world else (5, 5)
        open_cells = {tuple(point) for point in case.get("openCells", [[p["x"], p["y"]] for p in case["gases"]])}
        case["geometry"] = {
            "width": chamber_width, "height": chamber_height, "originX": origin_x, "originY": origin_y,
            "solidCells": [[x, y] for y in range(chamber_height) for x in range(chamber_width) if (x, y) not in open_cells],
            "boundaryElement": "Unobtanium", "boundaryTempK": case["tempK"],
        }
        for local_y in range(chamber_height):
            for local_x in range(chamber_width):
                x, y_down = origin_x + local_x, origin_y + local_y
                y_native = WORLD_H - 1 - y_down
                if (local_x, local_y) in open_cells:
                    cells[y_native * WORLD_W + x] = ("Vacuum", 0.0, 0.0)
                else:
                    cells[y_native * WORLD_W + x] = ("Unobtanium", 20000.0, case["tempK"])
        for placement in case["gases"]:
            element, mass = placement["element"], float(placement["massKg"])
            x, y_down = origin_x + placement["x"], origin_y + placement["y"]
            y_native = WORLD_H - 1 - y_down
            temperature = float(placement.get("tempK", case["tempK"])) if mass > 0 else 0.0
            cells[y_native * WORLD_W + x] = (element, mass, temperature)
        case["_origin"] = (origin_x, origin_y)
        placed.append(case)

    encoded = bytearray()
    for element, mass, temp_k in cells:
        encoded += pack("HBB4xff", indexes[element], 0, 0xFF, temp_k, mass)
    return bytes(encoded), placed


def snapshots(view_ptr: int, indexes: list[str], cases: list[dict]) -> dict[str, list[dict]]:
    view = NativeView.from_address(view_ptr)
    snapshots_by_case: dict[str, list[dict]] = {}
    for case in cases:
        ox, oy = case["_origin"]
        cells = []
        sample_coordinates = case.get("traceCells")
        if sample_coordinates is None:
            sample_coordinates = [[x, y] for y in range(case["geometry"]["height"])
                                  for x in range(case["geometry"]["width"])]
        for local_x, local_y in sample_coordinates:
            x, y_down = ox + local_x, oy + local_y
            y_native = WORLD_H - 1 - y_down
            index = y_native * WORLD_W + x
            elem_idx = int(view.elements[index])
            name = indexes[elem_idx]
            mass = float(view.mass[index])
            temp_k = float(view.temperature[index])
            state = cell_state(name, mass)
            cells.append({
                "x": x, "y": y_down,
                "element": None if state == "vacuum" else name,
                "cellState": state,
                "massKg": mass,
                "massG": mass * 1000.0,
                "tempK": temp_k,
                "tempC": temp_k - 273.15 if state != "vacuum" else None,
            })
        snapshots_by_case[case["caseId"]] = cells
    return snapshots_by_case


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--game-data", type=Path, default=Path(r"C:/Program Files (x86)/Steam/steamapps/common/OxygenNotIncluded/OxygenNotIncluded_Data"))
    parser.add_argument("--build-id", type=int, default=24423041)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--case-id", action="append", help="Capture only the named case(s); repeat the option to select more than one.")
    parser.add_argument("--probe", choices=("density", "corner", "max-mass"), help="Capture a separately stored supplemental validation set.")
    parser.add_argument("--layout", choices=("oh", "co", "os", "ho"), help="Density arrangement used with --probe density.")
    parser.add_argument("--corner-openings", type=int, choices=(0, 1, 2), help="Open corner edges for --probe corner.")
    parser.add_argument("--origin-x", type=int, help="Override the origin for a single selected case.")
    parser.add_argument("--origin-y", type=int, help="Override the origin for a single selected case.")
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("native-gas-traces-4.4.json"))
    args = parser.parse_args()

    data_dir = args.game_data.resolve()
    sim_path = data_dir / "Plugins" / "x86_64" / "SimDLL.dll"
    dll_hash = hashlib.sha256(sim_path.read_bytes()).hexdigest().upper()
    library = C.CDLL(str(sim_path))

    @C.CFUNCTYPE(C.c_int, C.c_int, C.c_void_p)
    def native_report(code: int, pointer: int) -> int:
        if code == 1 and pointer:
            fields = (C.c_void_p * 3).from_address(pointer)
            print("native report:", C.string_at(fields[1])[:230].decode("utf-8", "replace"), flush=True)
        return 0

    library.SIM_Initialize.argtypes = [type(native_report)]
    library.SIM_Initialize.restype = None
    library.SIM_Shutdown.argtypes = []
    library.SIM_Shutdown.restype = None
    library.SIM_HandleMessage.argtypes = [C.c_int, C.c_int, C.c_void_p]
    library.SIM_HandleMessage.restype = C.c_void_p

    def message(message_id: int, payload: bytes = b"") -> int:
        buffer = C.create_string_buffer(payload) if payload else None
        return int(library.SIM_HandleMessage(message_id, len(payload), buffer) or 0)

    entries = load_base_elements(data_dir)
    element_names = [entry["elementId"] for entry in entries]
    indexes_by_name = {name: index for index, name in enumerate(element_names)}
    for required in ("Oxygen", "Hydrogen", "CarbonDioxide", "Steam", "Vacuum", "Unobtanium"):
        if required not in indexes_by_name:
            raise RuntimeError(f"Required base-game element is missing: {required}")

    if args.probe == "density":
        if not args.layout or args.corner_openings is not None or args.case_id:
            raise ValueError("--probe density requires one --layout and no --case-id or --corner-openings")
        cases = [build_density_case(args.layout)]
    elif args.probe == "corner":
        if args.corner_openings is None or args.layout or args.case_id:
            raise ValueError("--probe corner requires --corner-openings and no --layout or --case-id")
        cases = [build_corner_case(args.corner_openings)]
    elif args.probe == "max-mass":
        if args.layout or args.corner_openings is not None or args.case_id:
            raise ValueError("--probe max-mass takes no selector options")
        cases = build_max_mass_cases()
    else:
        if args.layout or args.corner_openings is not None:
            raise ValueError("--layout/--corner-openings require --probe")
        cases = build_cases()
    if args.case_id:
        requested = set(args.case_id)
        cases = [case for case in cases if case["caseId"] in requested]
        missing = requested - {case["caseId"] for case in cases}
        if missing:
            raise ValueError(f"Unknown case id(s): {', '.join(sorted(missing))}")
    if args.origin_x is not None or args.origin_y is not None:
        if len(cases) != 1 or args.origin_x is None or args.origin_y is None:
            raise ValueError("Use both --origin-x and --origin-y with exactly one --case-id")
        chamber_size = WORLD_W if cases[0].get("fullWorld") else 5
        if args.origin_x < 0 or args.origin_y < 0 or args.origin_x + chamber_size > WORLD_W or args.origin_y + chamber_size > WORLD_H:
            raise ValueError("Selected 5x5 chamber origin does not fit in the 32x32 world")
        cases[0]["fixedOrigin"] = (args.origin_x, args.origin_y)
    init_cells, placed_cases = build_world(cases, indexes_by_name)
    cases_data = pack("iiI??", WORLD_W, WORLD_H, args.seed, False, False) + init_cells
    cases_data += pack("B11x", 0xFF) * (WORLD_W * WORLD_H)
    cases_data += pack("H2xff", indexes_by_name["Vacuum"], 0.0, 0.0) * (WORLD_W * WORLD_H)

    library.SIM_Initialize(native_report)
    try:
        element_table = pack("i", len(entries))
        element_table += b"".join(encode_sim_element(entry, i, indexes_by_name) for i, entry in enumerate(entries))
        element_table += b"".join(pack("i", len(name.encode("utf-8"))) + name.encode("utf-8") for name in element_names)
        message(SIM_ELEMENT_TABLE, element_table)
        message(SIM_DISEASE_TABLE, pack("ii", 0, len(entries)))
        message(ALLOCATE_CELLS, pack("ii??", WORLD_W, WORLD_H, False, False))
        message(INIT_FROM_CELLS, cases_data)
        message(DEFINE_WORLD_OFFSETS, pack("5i", 1, 0, 0, WORLD_W, WORLD_H))
        initial = message(SIM_START)
        if not initial:
            raise RuntimeError("Native SIM_Start returned a null data view")

        raw_frames = [snapshots(initial, element_names, placed_cases)]
        max_ticks = max(case["ticks"] for case in placed_cases)
        area = bytes([0xFF]) * (WORLD_W * WORLD_H)
        frame_payload = pack("f4i2f", DT, 0, 0, WORLD_W, WORLD_H - 1, 0.0, 0.0)
        for tick in range(1, max_ticks + 1):
            message(NEW_GAME_FRAME, frame_payload)
            deadline = time.monotonic() + 2.0
            while True:
                time.sleep(0.001)
                result = message(PREPARE_GAME_DATA, area)
                if not result:
                    raise RuntimeError(f"PrepareGameData returned null at tick {tick}")
                view = NativeView.from_address(result)
                if view.frames == 1:
                    break
                if view.frames != 0:
                    raise RuntimeError(f"Expected exactly one processed frame at tick {tick}, got {view.frames}")
                if time.monotonic() >= deadline:
                    raise TimeoutError(f"Timed out waiting for native frame {tick}")
            print(f"processed native frame {tick}/{max_ticks}", flush=True)
            raw_frames.append(snapshots(result, element_names, placed_cases))

        output_cases = []
        for case in placed_cases:
            frames = [
                {"timeSeconds": round(tick * DT, 10), "cells": raw_frames[tick][case["caseId"]]}
                for tick in range(case["ticks"] + 1)
            ]
            output_cases.append({
                "caseId": case["caseId"], "role": case["role"],
                "geometry": case["geometry"], "dtSeconds": DT, "ticks": case["ticks"],
                **({"densityProbe": case["densityProbe"], "traceCoordinates": case["traceCells"]} if "densityProbe" in case else {}),
                **({"cornerProbe": case["cornerProbe"], "traceCoordinates": case["traceCells"]} if "cornerProbe" in case else {}),
                "frames": frames,
            })

        payload = {
            "schemaVersion": 1,
            "gameBuild": args.build_id,
            "simVersion": f"SimDLL.dll sha256 {dll_hash}",
            "runner": "capture-native-gas-traces.py",
            "seed": args.seed,
            "world": {
                "width": WORLD_W, "height": WORLD_H,
                "coordinateConvention": "x increases right; y increases down; native y is flipped as 31-y",
                "background": {"element": "Unobtanium", "cellState": "solid", "massKg": 20000, "tempK": 293.15},
                "cellRecordPrecision": "native float32 values preserved in JSON numbers; tempC = tempK - 273.15",
            },
            "elementTable": {
                "source": "installed StreamingAssets/elements/*.yaml, base-game entries only",
                "order": "ElementLoader.FinaliseElementsTable: phase (state & Solid) descending, then signed SimHashes ascending",
                "count": len(entries),
                "gasDefaultMassKg": 1.0,
                "gasMaxMassKg": 1.8,
                "note": "gas maxMass is ElementLoader default metadata; SimDataInitializeFromCells accepts the high-mass probes below",
            },
            "cases": output_cases,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {len(output_cases)} cases to {args.output}", flush=True)
    finally:
        library.SIM_Shutdown()


if __name__ == "__main__":
    main()
