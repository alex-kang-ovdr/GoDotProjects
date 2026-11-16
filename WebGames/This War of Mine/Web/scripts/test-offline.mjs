import './package-offline.mjs';
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const result=spawnSync(process.execPath,['--test','tests/ui.test.js'],{cwd:root,env:{...process.env,LAST_LIGHT_TEST_OFFLINE:'1'},stdio:'inherit'});
process.exit(result.status??1);
