import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cjs = require('./resolve-godot.cjs');

export const SSOT_PATH = cjs.SSOT_PATH;
export const loadEngineSsot = cjs.loadEngineSsot;
export const realEngineExecutable = cjs.realEngineExecutable;
export const inspectGodotBinary = cjs.inspectGodotBinary;
export const resolveGodotBinary = cjs.resolveGodotBinary;
