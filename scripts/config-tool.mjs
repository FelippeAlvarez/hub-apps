// Uso: HUB_PASSWORD=... node scripts/config-tool.mjs decrypt saida.json
//      HUB_PASSWORD=... node scripts/config-tool.mjs encrypt entrada.json
import fs from 'node:fs';
import path from 'node:path';
import { encryptStr, decryptStr } from './crypto-util.mjs';
const [mode, file] = process.argv.slice(2);
const pw = process.env.HUB_PASSWORD;
const enc = path.join(import.meta.dirname, '..', 'data', 'config.enc');
if (!pw || !file || !['encrypt', 'decrypt'].includes(mode)) { console.error('Uso: HUB_PASSWORD=... node config-tool.mjs encrypt|decrypt arquivo.json'); process.exit(1); }
if (mode === 'decrypt') fs.writeFileSync(file, decryptStr(fs.readFileSync(enc, 'utf8'), pw));
else { JSON.parse(fs.readFileSync(file, 'utf8')); fs.writeFileSync(enc, encryptStr(fs.readFileSync(file, 'utf8'), pw)); }
console.log('ok');
