import path from 'node:path';
import { exportRobloxPlaceToGodot } from './godot-exporter.mjs';

const [, , inputPath, outputDir] = process.argv;
if (!inputPath || !outputDir) {
  console.error('Usage: node port-cli.mjs <input.rbxlx> <outputDir>');
  process.exit(1);
}

const report = exportRobloxPlaceToGodot(path.resolve(inputPath), path.resolve(outputDir));
console.log(JSON.stringify({
  source: report.source_file,
  output: report.output_dir,
  ir_stats: report.ir_stats,
  scene_stats: report.scene_stats,
  kpis: report.kpis,
  diagnostics_count: report.diagnostics.length
}, null, 2));
