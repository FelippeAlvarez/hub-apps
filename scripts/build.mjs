// Robô da Central de Aplicativos: lista os repositórios do dono, confere as páginas,
// confere os projetos externos, criptografa o resultado e gera dist/index.html.
import fs from 'node:fs';
import path from 'node:path';
import { encryptStr, decryptStr } from './crypto-util.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const OWNER = process.env.HUB_OWNER || 'FelippeAlvarez';
const TOKEN = process.env.HUB_READ_TOKEN || '';
const PW = process.env.HUB_PASSWORD || '';
const MOCK = process.env.MOCK ? JSON.parse(fs.readFileSync(process.env.MOCK, 'utf8')) : null;
if (!PW) { console.error('Falta o segredo HUB_PASSWORD.'); process.exit(1); }

const TOPIC_CAT = { 'hub-juridico': 'juridico', 'hub-condominio': 'condominio', 'hub-docs': 'docs', 'hub-golfe': 'golfe', 'hub-pessoal': 'pessoal' };
const log = [];
const note = (s) => { log.push(s); console.log(s); };

async function gh(p) {
  if (MOCK) { if (p in MOCK.api) return MOCK.api[p]; const e = new Error('404 ' + p); e.status = 404; throw e; }
  const base = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'hub-apps-robot' };
  let r = await fetch('https://api.github.com' + p, { headers: { ...base, ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) } });
  if (r.status === 401 && TOKEN) r = await fetch('https://api.github.com' + p, { headers: base }); // chave vencida: segue só com o público
  if (!r.ok) { const e = new Error(p + ' -> ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
async function live(u) {
  if (MOCK) return MOCK.live?.[u] ?? true;
  try { const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(12000) }); return r.ok; } catch { return false; }
}
let publicOnly = false;
async function listPaged(base) {
  const out = [];
  for (let page = 1; page < 10; page++) {
    const chunk = await gh(`${base}&page=${page}`);
    if (!Array.isArray(chunk)) throw new Error('resposta inesperada');
    out.push(...chunk);
    if (chunk.length < 100) break;
  }
  return out;
}
async function listOwn() {
  if (TOKEN) {
    try { return await listPaged('/user/repos?affiliation=owner&per_page=100'); }
    catch { /* chave sem alcance de usuário (ex.: a chave automática do Actions): segue só com públicos */ }
  }
  publicOnly = true;
  return listPaged(`/users/${OWNER}/repos?per_page=100`);
}
const pretty = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const cfg = JSON.parse(decryptStr(fs.readFileSync(path.join(ROOT, 'data', 'config.enc'), 'utf8'), PW));

// ---------- Meus repositórios ----------
const repos = await listOwn();
const mirrors = new Map();
const apps = [];
const novos = [], semPagina = [];
for (const r of repos) {
  const low = r.name.toLowerCase();
  if (low === 'hub-apps') continue;
  if (low.startsWith('espelho-')) { mirrors.set(low, r.html_url); continue; }
  const o = cfg.overrides?.[r.name] || {};
  if (o.hide || (r.topics || []).includes('hub-ignorar')) continue;
  const topicCat = (r.topics || []).map((t) => TOPIC_CAT[t]).find(Boolean);
  const known = !!cfg.overrides?.[r.name];
  const cat = o.cat || topicCat || 'novos';
  let url = o.url ?? null;
  if (url === null) {
    let cand = null;
    if (r.has_pages) { try { cand = (await gh(`/repos/${OWNER}/${r.name}/pages`)).html_url; } catch { cand = `https://${OWNER.toLowerCase()}.github.io/${r.name}/`; } }
    else if (r.homepage) cand = r.homepage;
    if (cand) { if (await live(cand)) url = cand; else semPagina.push(r.name + ' (' + cand + ' fora do ar)'); }
  }
  if (!known && !topicCat) novos.push(r.name);
  apps.push({ id: low, name: o.name || pretty(r.name), desc: o.desc || r.description || 'Sem descrição no GitHub.', cat, tag: o.tag || (r.private ? 'Privado' : url ? 'Web' : 'Sem página'), url, repo: r.html_url, priv: !!r.private, novo: !known && !topicCat, pushed: r.pushed_at, launch: o.launch || null, note: o.note || (r.private && !url ? 'Repositório privado — sem endereço público.' : '') });
}
if (publicOnly) {
  note('Modo só repositórios públicos (sem chave de leitura): repositórios privados novos não são detectados.');
  const seen = new Set(apps.map((a) => a.id));
  for (const [name, o] of Object.entries(cfg.overrides || {})) {
    if (o.hide || seen.has(name.toLowerCase())) continue;
    apps.push({ id: name.toLowerCase(), name: o.name || pretty(name), desc: o.desc || 'Sem descrição.', cat: o.cat || 'novos', tag: o.tag || 'Privado', url: o.url || null, repo: `https://github.com/${OWNER}/${name}`, priv: true, novo: false, fixo: true, pushed: null, launch: o.launch || null, note: o.note || 'Repositório privado — sem endereço público.' });
  }
}
apps.sort((a, b) => a.name.localeCompare(b.name, 'pt'));

// ---------- Projetos externos ----------
const externos = [];
const problemas = [];
for (const e of cfg.externos || []) {
  const short = e.full.split('/')[1];
  let status = 'ok', licApi = null, stars = null, pushed = null, html = 'https://github.com/' + e.full;
  try {
    const r = await gh('/repos/' + e.full);
    licApi = r.license?.spdx_id || null; stars = r.stargazers_count ?? null; pushed = r.pushed_at || null; html = r.html_url || html;
    if (r.archived) status = 'arquivado';
  } catch (err) { status = err.status === 404 ? 'nao_localizado' : 'sem_verificacao'; }
  if (status !== 'ok') problemas.push(`${e.full}: ${status}`);
  externos.push({ id: 'x-' + short.toLowerCase(), n: e.n, name: short, full: e.full, grupo: e.grupo, tipo: e.tipo || 'app', desc: e.oque, lic: e.lic, licApi, reuso: e.reuso, aviso: e.aviso, req: e.req, status, stars, pushed, repo: html, mirror: mirrors.get('espelho-' + short.toLowerCase()) || e.mirror || null });
}

const data = { generated: new Date().toISOString(), apps, externos, config: cfg };
const payload = encryptStr(JSON.stringify(data), PW);
const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'static'))) fs.copyFileSync(path.join(ROOT, 'static', f), path.join(dist, f));
let t = fs.readFileSync(path.join(ROOT, 'template.html'), 'utf8');
t = t.replace('__PAYLOAD__', payload).replace('__BUILD__', data.generated.slice(0, 10));
fs.writeFileSync(path.join(dist, 'index.html'), t);

note(`Apps próprios: ${apps.length} (novos a classificar: ${novos.length ? novos.join(', ') : 'nenhum'})`);
if (semPagina.length) note('Páginas fora do ar: ' + semPagina.join('; '));
note(`Externos: ${externos.length}; espelhados na sua conta: ${externos.filter((x) => x.mirror).length}`);
if (problemas.length) note('Externos com problema: ' + problemas.join('; '));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Central de Aplicativos\n' + log.map((l) => '- ' + l).join('\n') + '\n');
