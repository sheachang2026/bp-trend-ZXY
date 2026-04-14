#!/usr/bin/env node
const { execSync } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');

const APP_TOKEN = 'Q4pbb4IHyaEh76sf3ZFcmOQvnAh';
const TABLE_ID  = 'tblX0RyS4M5DqEKr';
const HTML_FILE = './index.html';

async function getFeishuToken() {
  const appId = 'cli_a92400c4f6b8dcb6';
  const appSecret = execSync('security find-generic-password -a "feishu" -s "feishu-app-secret" -w 2>/dev/null').toString().trim();
  const body = JSON.stringify({ app_id: appId, app_secret: appSecret });
  const res = JSON.parse(execSync(`curl -s -X POST -H "Content-Type: application/json" -d '${body}' "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"`));
  if (res.code !== 0) throw new Error('Token error: ' + JSON.stringify(res));
  return res.tenant_access_token;
}

async function fetchAllRecords(token) {
  const records = [];
  let pageToken = '';
  do {
    const params = pageToken ? `?page_token=${pageToken}&page_size=500` : '?page_size=500';
    const cmd = `curl -s -H "Authorization: Bearer ${token}" "https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records${params}"`;
    const res = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
    if (res.code !== 0) throw new Error('Feishu API error: ' + JSON.stringify(res));
    records.push(...res.data.items);
    pageToken = res.data.has_more ? res.data.page_token : '';
  } while (pageToken);
  return records;
}

function formatRecord(item) {
  const f = item.fields;
  const dateStr = f['日期'];
  if (!dateStr) return null;
  let label;
  try {
    const d = new Date(dateStr + 'T00:00:00');
    label = `${d.getMonth()+1}月${d.getDate()}日`;
  } catch { return null; }
  const sys = parseInt(f['收缩压'], 10);
  const dia = parseInt(f['舒张压'], 10);
  const hrField = f['心率'];
  const hr = hrField != null && hrField !== '' ? parseInt(hrField, 10) : null;
  if (isNaN(sys) || isNaN(dia)) return null;
  return { date: dateStr, label, sys, dia, hr: isNaN(hr) ? null : hr };
}

function updateHtml(records) {
  const html = readFileSync(HTML_FILE, 'utf8');
  const rawEntries = records.map(r => `    { date: '${r.date}', label: '${r.label}', sys: ${r.sys}, dia: ${r.dia}, hr: ${r.hr == null ? 'null' : r.hr} }`).join(',\n');
  const rawPattern = /\/\* ── Data ─+ \*\/\s*const RAW = \[[\s\S]*?\];/;
  const newRaw = `/* ── Data ─────────────────────────────────────────────────── */\n  const RAW = [\n${rawEntries}\n  ];`;
  let newHtml = html.replace(rawPattern, newRaw);
  const dates = records.map(r => r.date).sort();
  const oldest = dates[0];
  const newest = dates[dates.length - 1];
  const total = records.length;
  const fmt = d => { const dt = new Date(d + 'T00:00:00'); return `${dt.getMonth()+1}月${dt.getDate()}日`; };
  const rangeStr = `${fmt(oldest)} — ${fmt(newest)}`;
  const metaPattern = /(<p class="page-header__meta">)[^<]*(<\/p>)/;
  newHtml = newHtml.replace(metaPattern, `<p class="page-header__meta">${rangeStr} · 共${total}条记录</p>`);
  const today = new Date();
  const todayStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`;
  const footerPattern = /(数据来源：飞书多维表格 · 最后更新：)[^<]*(<\/p>)/;
  newHtml = newHtml.replace(footerPattern, `$1${todayStr}$2`);
  writeFileSync(HTML_FILE, newHtml, 'utf8');
  console.log(`[sync] Updated with ${records.length} records (${oldest} → ${newest})`);
}

(async () => {
  try {
    const token = await getFeishuToken();
    const rawRecords = await fetchAllRecords(token);
    const formatted = rawRecords.map(formatRecord).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
    if (formatted.length === 0) { console.warn('[sync] No valid records found'); return; }
    updateHtml(formatted);
    console.log('[sync] Done!');
  } catch (err) {
    console.error('[sync] Error:', err.message);
    process.exit(1);
  }
})();
