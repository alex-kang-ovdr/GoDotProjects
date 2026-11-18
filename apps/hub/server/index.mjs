import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.mjs';

const at = process.argv.indexOf('--config');
if (at < 0 || !process.argv[at+1]) { console.error('Usage: node server/index.mjs --config /absolute/path/config.json'); process.exit(1); }
let app;
try {
  const config = JSON.parse(readFileSync(resolve(process.argv[at+1]),'utf8').replace(/^\uFEFF/,''));
  app=createApp(config);
  const addresses=await app.listen();
  console.log(JSON.stringify({event:'listening',public:addresses.public,admin:addresses.admin,googleEnabled:Boolean(config.google?.clientId && config.google?.clientSecret && config.google?.redirectUri)}));
} catch(error) { console.error('Server startup failed:',error.message);if(app)await app.close();process.exit(1); }
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await app.close();process.exit(0);});
