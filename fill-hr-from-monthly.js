#!/usr/bin/env node
/**
 * fill-hr-from-monthly.js
 * 华为运动健康无法导出逐条心率，只能拿到月均脉搏。
 * 用 10 月月均脉搏 67 bpm 回填 10 月所有缺失心率的记录，
 * 并在备注中标注"心率为月均值参考"。
 */
const https = require('https');

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const APP_TOKEN = 'Q4pbb4IHyaEh76sf3ZFcmOQvnAh';
const TABLE_ID = 'tblX0RyS4M5DqEKr';
const TARGET_MONTH = '2026-10';
const HR_VALUE = 67;
const HR_NOTE = '心率为华为健康月均值参考(67bpm)';

function requestOnce(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = https.request({ hostname: 'open.feishu.cn', path, method, headers, timeout: 30000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json: ' + d.slice(0, 200))); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function request(path, method, body, token) {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try { return await requestOnce(path, method, body, token); }
    catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

const get = (p, t) => request(p, 'GET', null, t);
const post = (p, b, t) => request(p, 'POST', b, t);
const patch = (p, b, t) => request(p, 'PUT', b, t);

(async () => {
  const tok = (await post('/open-apis/auth/v3/tenant_access_token/internal', { app_id: APP_ID, app_secret: APP_SECRET })).tenant_access_token;

  // 拉全量
  let all = [], pageToken = '';
  do {
    const q = pageToken ? `?page_token=${pageToken}&page_size=500` : '?page_size=500';
    const r = await get(`/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records${q}`, tok);
    all.push(...r.data.items);
    pageToken = r.data.has_more ? r.data.page_token : '';
  } while (pageToken);

  const targets = all.filter(it => {
    const f = it.fields;
    const d = f['日期'];
    return d && d.startsWith(TARGET_MONTH) && (f['心率'] == null || f['心率'] === '');
  });

  console.log(`[fill] ${TARGET_MONTH} 缺失心率记录: ${targets.length}`);

  for (const it of targets) {
    const f = it.fields;
    const note = f['备注'] ? `${f['备注']} · ${HR_NOTE}` : HR_NOTE;
    const r = await patch(
      `/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${it.record_id}`,
      { fields: { '心率': HR_VALUE, '备注': note } },
      tok
    );
    if (r.code !== 0) console.error('update failed', it.record_id, JSON.stringify(r));
  }
  console.log(`[fill] done, updated ${targets.length}`);
})();
