#!/usr/bin/env node
const https = require('https');

const APP_TOKEN = 'Q4pbb4IHyaEh76sf3ZFcmOQvnAh';
const TABLE_ID  = 'tblX0RyS4M5DqEKr';

async function getFeishuToken() {
  const appId = 'cli_a92400c4f6b8dcb6';
  const appSecret = 'pE1E7Sgu5Ehzp5ARKcdHVcMlK06PdEJG';
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
      https.get(opts, res => {
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('JSON parse error: ' + data)); }
        });
      }).on('error', reject);
    });

    if (res.data && res.data.items) {
      records.push(...res.data.items);
    }
    pageToken = res.data?.page_token;
  } while (pageToken);

  return records;
}

function formatRecord(item) {
  const f = item.fields;
  if (!f) return null;
  const date = f['日期'] || f['血压记录'];
  if (!date) return null;
  const dateStr = typeof date === 'string' ? date : String(date);
  const sysStr = String(f['收缩压'] || '');
  const diaStr = String(f['舒张压'] || '');
  const hrStr = String(f['心率'] || '');
  const sys = parseInt(sysStr, 10);
  const dia = parseInt(diaStr, 10);
  const hr = parseInt(hrStr, 10);
  if (isNaN(sys) || isNaN(dia) || isNaN(hr)) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const label = `${d.getMonth()+1}月${d.getDate()}日`;
  return { date: dateStr, label, sys, dia, hr };
}

(async () => {
  const token = await getFeishuToken();
  const rawRecords = await fetchAllRecords(token);
  console.log('Total raw records:', rawRecords.length);
  const formatted = rawRecords.map(formatRecord).filter(Boolean);
  console.log('Total formatted records:', formatted.length);
  formatted.forEach(r => console.log(' -', r.date, r.sys, r.dia, r.hr));
})().catch(console.error);
