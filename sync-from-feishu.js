#!/usr/bin/env node
/**
 * sync-from-feishu.js
 * Fetches all blood pressure records from the Feishu Bitable
 * and updates the RAW array in index.html.
 *
 * Usage: node sync-from-feishu.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const APP_TOKEN = 'Q4pbb4IHyaEh76sf3ZFcmOQvnAh';
const TABLE_ID  = 'tblX0RyS4M5DqEKr';
const HTML_FILE = path.join(__dirname, 'index.html');

// ── Feishu API helper ──────────────────────────────────────────
function feishuGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'open.feishu.cn',
      path,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${process.env.FEISHU_BOT_TOKEN || ''}`, 'Content-Type': 'application/json' }
    };
    let data = '';
    https.get(opts, res => {
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data)); }
      });
    }).on('error', reject);
  });
}

async function getFeishuToken() {
  // Use tenant access token via app credentials
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('FEISHU_APP_ID and FEISHU_APP_SECRET env vars are required');
  }
  const body = JSON.stringify({ app_id: appId, app_secret: appSecret });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.feishu.cn',
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.code !== 0) reject(new Error('Token error: ' + JSON.stringify(json)));
        else resolve(json.tenant_access_token);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchAllRecords(token) {
  const records = [];
  let pageToken = '';

  do {
    const params = pageToken ? `?page_token=${pageToken}&page_size=500` : '?page_size=500';
    const res = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'open.feishu.cn',
        path: `/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records${params}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      };
      let data = '';
      https.get(opts, r => {
        r.on('data', c => data += c);
        r.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('JSON parse error: ' + data)); }
        });
      }).on('error', reject);
    });

    if (res.code !== 0) throw new Error('Feishu API error: ' + JSON.stringify(res));
    records.push(...res.data.items);
    pageToken = res.data.has_more ? res.data.page_token : '';
  } while (pageToken);

  return records;
}

// ── Format record ───────────────────────────────────────────────
function formatRecord(item) {
  const f = item.fields;
  const dateStr = f['日期'];
  if (!dateStr) return null;

  // Parse "2026-03-29" → "3月29日"
  let label;
  try {
    const d = new Date(dateStr + 'T00:00:00');
    label = `${d.getMonth()+1}月${d.getDate()}日`;
  } catch {
    return null;
  }

  const sys = parseInt(f['收缩压'], 10);
  const dia = parseInt(f['舒张压'], 10);
  const hrField = f['心率'];
  const hr = hrField != null && hrField !== '' ? parseInt(hrField, 10) : null;

  if (isNaN(sys) || isNaN(dia)) return null;

  return {
    date: dateStr,
    label,
    sys,
    dia,
    hr: isNaN(hr) ? null : hr,
  };
}

// ── Update HTML file ───────────────────────────────────────────
function updateHtml(records) {
  const html = fs.readFileSync(HTML_FILE, 'utf8');

  // Build new RAW JS literal
  const rawEntries = records
    .map(r => `    { date: '${r.date}', label: '${r.label}', sys: ${r.sys}, dia: ${r.dia}, hr: ${r.hr == null ? 'null' : r.hr} }`)
    .join(',\n');

  // Replace RAW array
  const rawPattern = /\/\* ── Data ─+ \*\/\s*const RAW = \[[\s\S]*?\];/;
  const newRaw = `/* ── Data ─────────────────────────────────────────────────── */\n  const RAW = [\n${rawEntries}\n  ];`;
  const newHtml = html.replace(rawPattern, newRaw);

  // Update header meta
  const dates = records.map(r => r.date).sort();
  const oldest = dates[0];
  const newest = dates[dates.length - 1];
  const total = records.length;

  // Format date range
  const fmt = d => {
    const dt = new Date(d + 'T00:00:00');
    return `${dt.getMonth()+1}月${dt.getDate()}日`;
  };

  const rangeStr = `${fmt(oldest)} — ${fmt(newest)}`;
  const metaPattern = /(<p class="page-header__meta">)[^<]*(<\/p>)/;
  const newMeta = `<p class="page-header__meta">${rangeStr} · 共${total}条记录</p>`;
  const finalHtml = newHtml.replace(metaPattern, newMeta);

  // Update footer
  const today = new Date();
  const todayStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`;
  const footerPattern = /(数据来源：飞书多维表格 · 最后更新：)[^<]*(<\/p>)/;
  const finalHtml2 = finalHtml.replace(footerPattern, `$1${todayStr}$2`);

  fs.writeFileSync(HTML_FILE, finalHtml2, 'utf8');
  console.log(`[sync] Updated with ${records.length} records (${oldest} → ${newest})`);
}

// ── Main ────────────────────────────────────────────────────
(async () => {
  try {
    console.log('[sync] Fetching Feishu token...');
    const token = await getFeishuToken();

    console.log('[sync] Fetching records from Bitable...');
    const rawRecords = await fetchAllRecords(token);

    console.log('[sync] Formatting records...');
    const formatted = rawRecords
      .map(formatRecord)
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (formatted.length === 0) {
      console.warn('[sync] No valid records found, skipping update');
      return;
    }

    console.log('[sync] Updating HTML file...');
    updateHtml(formatted);

    console.log('[sync] Done!');
  } catch (err) {
    console.error('[sync] Error:', err.message);
    process.exit(1);
  }
})();
