$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$godotProject = Join-Path $projectRoot 'Godot'
$gameSource = Join-Path $projectRoot 'Projects/TappyChicken/Scripts/Game.gd'
$smokeScript = Join-Path $projectRoot 'Saved/Tests/tappy-chicken-smoke.gd'
$logPath = Join-Path $projectRoot 'Saved/Tests/godot-game-validation.log'

$candidates = @(
    $env:GODOT_BIN,
    (Join-Path $projectRoot 'Godot/bin/godot.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
if (-not $candidates) {
    foreach ($folder in @((Split-Path -Parent $projectRoot), (Join-Path $projectRoot '../../../GoDotProjects'))) {
        $resolvedFolder = [System.IO.Path]::GetFullPath($folder)
        if (Test-Path -LiteralPath $resolvedFolder) {
            $candidate = Get-ChildItem -LiteralPath $resolvedFolder -Filter 'Godot_v4.*_win64_console.exe' -File |
                Sort-Object Name | Select-Object -Last 1
            if ($candidate) { $candidates = @($candidate.FullName); break }
        }
    }
}
if (-not $candidates) {
    $command = Get-Command godot, godot4 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { $candidates = @($command.Source) }
}
if (-not $candidates) { throw 'Godot executable was not found. Set GODOT_BIN or install Godot 4.7+.' }
$godot = [string]($candidates | Select-Object -First 1)
if (-not (Test-Path -LiteralPath (Join-Path $godotProject 'project.godot'))) {
    throw "Godot project file was not found: $godotProject"
}
if (-not (Test-Path -LiteralPath $gameSource)) { throw "Game rules were not found: $gameSource" }

$testDirectory = Split-Path -Parent $smokeScript
New-Item -ItemType Directory -Path $testDirectory -Force | Out-Null
@"
extends SceneTree

func _initialize() -> void:
	var source := FileAccess.get_file_as_string("$($gameSource.Replace('\', '/'))")
	if source.is_empty():
		_fail("Could not read the standalone game source")
		return
	var game_script := GDScript.new()
	game_script.source_code = source
	var parse_result := game_script.reload()
	if parse_result != OK:
		_fail("Game.gd failed to parse (error %d)" % parse_result)
		return
	var game: Object = game_script.new()
	var state: Dictionary = game.call("reset", {
		"difficulty": "hard", "gravity": "bad", "speed": 900,
		"gap": 70, "interval": "0.1", "seed": "5.9", "best": "-1",
	})
	if state.settings.difficulty != "hard" or state.settings.speed != 450.0 or state.settings.gap != 95.0:
		_fail("Difficulty profile or numeric clamping differs from the expected rules")
		return
	if state.settings.gravity != 1050.0 or state.settings.interval != 0.5 or state.settings.seed != 5 or state.settings.best != 0:
		_fail("Invalid settings did not fall back or clamp as expected")
		return
	state = game.call("reset", {})
	state = game.call("input", "flap")
	if state.state != "playing" or state.bird.vy != -345.0:
		_fail("Flap did not start play with the configured impulse")
		return
	state = game.call("input", "pause")
	var paused_y: float = state.bird.y
	state = game.call("update", 0.04)
	if state.state != "paused" or state.bird.y != paused_y or absf(state.elapsed - 0.04) > 0.000001:
		_fail("Paused update changed gameplay state or failed to advance elapsed time")
		return
	game.call("input", "resume")
	for index in range(23):
		state = game.call("update", 0.04)
	if state.pipes.size() != 1 or state.seed != 87628868 or absf(state.pipes[0].x - 503.2) > 0.000001:
		_fail("Seeded pipe spawn did not match the expected LCG sequence")
		return
	state.world.width = 1
	state.bird.y = -100
	state.settings.speed = 1
	state.pipes[0].x = -100
	var fresh: Dictionary = game.call("snapshot")
	if fresh.world.width != 480 or fresh.bird.y == -100 or fresh.settings.speed != 170.0 or fresh.pipes[0].x == -100:
		_fail("Snapshot contains mutable references to game state")
		return
	print("Tappy Chicken GDScript smoke passed")
	quit(0)

func _fail(message: String) -> void:
	push_error(message)
	quit(1)
"@ | Set-Content -LiteralPath $smokeScript -Encoding utf8

New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
Set-Content -LiteralPath $logPath -Value "Godot: $godot`r`nProject: $godotProject`r`n" -Encoding utf8
& $godot --headless --editor --path $godotProject --import --quit *>> $logPath
if ($LASTEXITCODE -ne 0) { throw "Godot editor import failed. See $logPath" }
& $godot --headless --path $godotProject --script $smokeScript *>> $logPath
if ($LASTEXITCODE -ne 0) { throw "GDScript game validation failed. See $logPath" }
Get-Content -LiteralPath $logPath | Select-Object -Last 20
