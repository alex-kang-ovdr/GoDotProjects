"""Port the Tappy Chicken sample's atlas texels and PCM audio to Godot text assets."""

import argparse
import base64
import hashlib
import wave
from collections import defaultdict
from pathlib import Path

from PIL import Image


ATLAS_HASHES = {
    "T_TappyChicken_01": "03e89a47c6643489444315f03136fae7cd54ffde1c13e032c027432c8216010f",
    "T_TappyChicken_BG_02": "ff5affa9a131f2c639ad8f528ac945cc1519c6b3bca0b54851bc565566ffadde",
    "T_TappyChicken_UI_01": "2ccca877b6749a43ef723aed8a5ce37253e7058efb891d9c74524fd9d3afff5c",
    "T_Eggs_01": "acde23c150fb2f0e68ac1cc3a09a7c192bcdeae9bd6020a5190995343d021557",
    "TappyChickenfont_10_Page_0": "ea8d655170a81b3f90f1012fc04d2d962a7ddb332c8611ff49da63d141a308e1",
}

AUDIO_HASHES = {
    "SFX_Click_01.wav": "727fb916f9305aac3a8c852ab2c6cd61f0c211caae55dcec2188bcb3d1f8fbcf",
    "SFX_FlapWing_01.wav": "e8f4413cadbbb4e5facdd5435ba0abca94c9d4c60f154fa9cc9115349c2d1126",
    "SFX_FlapWing_02.wav": "8b1c074c9648c95b45374caeffb44415ec09d8f91b6ceea243b8b83c4edd9887",
    "SFX_FlapWing_03.wav": "525ecc6dcd221db0b13d0b74139b3ef9fb130c7d5feac679f43f92817c7a7dc0",
    "SFX_FlapWing_04.wav": "b3f6a3a9c629970a9a9d4d1bbeb6803254ce0fa83f32de4337e980d0cb441af0",
    "SFX_Score_01.wav": "be1a2987f7e976482abef612b1afa2a6e74fecbf2c1633d02b83afd1a9b1973d",
    "SFX_HitObstacle_01.WAV": "731858d5bf2dc11fdbc34dc507c47c59175ee753298277f7673847e26c4c536e",
    "SFX_HitGround_01.WAV": "d0688e8a19fa1e1a06b3e89c39eb3b6720748244dc2f27ed31f948adcc2bbcad",
}

# (left, top, right-exclusive, bottom-exclusive) in top-origin TGA pixels.
CROPS = {
    "T_TappyChicken_01": {
        "chicken": (0, 0, 32, 32),
        "chicken-wing-up": (32, 0, 64, 32),
        "chicken-wing-down": (64, 0, 96, 32),
        "chicken-hit": (96, 0, 128, 32),
    },
    "T_TappyChicken_BG_02": {
        "clouds-far": (0, 23, 512, 62),
        "clouds-near": (0, 76, 512, 125),
        "hills-far": (0, 128, 512, 190),
        "hills-near": (0, 197, 512, 254),
        "plants": (0, 266, 512, 318),
        "fence": (0, 340, 512, 384),
        "ground": (0, 415, 512, 512),
    },
    "T_TappyChicken_UI_01": {
        "logo": (0, 0, 133, 68),
        "play": (0, 68, 75, 112),
        "go": (0, 135, 63, 168),
        "scoreboard": (0, 176, 152, 256),
        "game-over": (0, 256, 132, 289),
        "pipe": (182, 0, 216, 255),
        "pipe-down": (220, 1, 254, 255),
    },
    "T_Eggs_01": {"egg": (0, 0, 32, 32)},
    "TappyChickenfont_10_Page_0": {},
}


def extract(source):
    for atlas_name, sprites in CROPS.items():
        directory = "Fonts" if atlas_name == "TappyChickenfont_10_Page_0" else "Textures"
        path = source / "SourceArt" / directory / (atlas_name + ".tga")
        if hashlib.sha256(path.read_bytes()).hexdigest() != ATLAS_HASHES[atlas_name]:
            raise ValueError(f"Unexpected source atlas for these coordinates: {path}")
        with Image.open(path) as atlas:
            for name, bounds in sprites.items():
                yield name, atlas.crop(bounds)
            if atlas_name == "T_TappyChicken_UI_01":
                # SM_TappyToFlappy covers a T shape in UV space. The adjacent
                # button and "New" lettering are outside the mesh.
                ready = Image.new("RGBA", (90, 62))
                ready.paste(atlas.crop((96, 112, 124, 150)), (31, 0))
                ready.paste(atlas.crop((65, 150, 155, 174)), (0, 38))
                yield "ready", ready
            if atlas_name == "TappyChickenfont_10_Page_0":
                digits = Image.new("RGBA", (80, 10))
                for digit, x in enumerate([1, 12, 18, 29, 40, 51, 62, 73, 84, 95]):
                    width = 4 if digit == 1 else 7
                    digits.paste(atlas.crop((x, 43, x + width, 53)), (digit * 8, 0))
                yield "digits", digits


def svg_for(image):
    """Write each horizontal run as a closed path, grouping identical RGBA values."""
    width, height = image.size
    pixels = image.load()
    paths = defaultdict(list)
    for y in range(height):
        x = 0
        while x < width:
            color = pixels[x, y]
            end = x + 1
            while end < width and pixels[end, y] == color:
                end += 1
            if color[3]:
                length = end - x
                paths[color].append(f"M{x} {y}h{length}v1h-{length}z")
            x = end
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
    ]
    for (r, g, b, a), runs in paths.items():
        opacity = "" if a == 255 else f' fill-opacity="{a / 255:.8f}"'
        lines.append(f'<path fill="#{r:02x}{g:02x}{b:02x}"{opacity} d="{"".join(runs)}"/>')
    return "\n".join([*lines, "</svg>", ""])


def resources(source):
    for name, image in extract(source):
        yield name + ".svg", svg_for(image), f"{image.width} × {image.height}"
    for filename, expected_hash in AUDIO_HASHES.items():
        path = source / "SourceArt" / "Audio" / filename
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
            raise ValueError(f"Unexpected source audio: {path}")
        with wave.open(str(path), "rb") as audio:
            if audio.getsampwidth() != 2 or audio.getnchannels() not in (1, 2):
                raise ValueError(f"Expected 16-bit mono or stereo PCM: {path}")
            rate = audio.getframerate()
            stereo = audio.getnchannels() == 2
            pcm = audio.readframes(audio.getnframes())
        encoded = base64.b64encode(pcm).decode("ascii")
        resource = (
            '[gd_resource type="AudioStreamWAV" format=4]\n\n[resource]\n'
            f'format = 1\nmix_rate = {rate}\nstereo = {str(stereo).lower()}\n'
            f'data = PackedByteArray("{encoded}")\n'
        )
        yield f"Audio/{path.stem}.tres", resource, f"{rate} Hz"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="TappyChicken directory containing SourceArt")
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "Templates/tappy-chicken/Assets")
    parser.add_argument("--check", action="store_true", help="Compare generated assets with existing text resources")
    options = parser.parse_args()
    for name, text, description in resources(options.source):
        path = options.output / name
        if options.check:
            if path.read_text(encoding="ascii") != text:
                raise SystemExit(f"Conversion differs: {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(text.encode("ascii"))
        print(f"{name:30} {description:10}  {len(text):7} bytes")


if __name__ == "__main__":
    main()
