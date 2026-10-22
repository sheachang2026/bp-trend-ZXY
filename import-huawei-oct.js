#!/usr/bin/env node
/**
 * import-huawei-oct.js
 * 将华为健康 App 导出的血压记录（2026-09-15 ~ 2026-10-22）批量写入飞书 Bitable。
 * 数据来源：阿姨提供的华为运动健康截图。
 */
const https = require('https');

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const APP_TOKEN = 'Q4pbb4IHyaEh76sf3ZFcmOQvnAh';
const TABLE_ID = 'tblX0RyS4M5DqEKr';

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = https.request({ hostname: 'open.feishu.cn', path, method: 'POST', headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function token() {
  const r = await post('/open-apis/auth/v3/tenant_access_token/internal', { app_id: APP_ID, app_secret: APP_SECRET });
  if (r.code !== 0) throw new Error('token error ' + JSON.stringify(r));
  return r.tenant_access_token;
}

// [日期, 时间, 收缩压, 舒张压, 备注]
const ROWS = [
  ['2026-09-15','06:28',114,80,'早晨测量'],
  ['2026-09-23','06:58',117,79,'早晨测量'],
  ['2026-09-29','07:00',120,83,'早晨测量'],
  ['2026-10-04','17:05',152,90,'下午测量 · 血压偏高'],
  ['2026-10-05','05:36',129,92,'早晨测量 · 血压偏高'],
  ['2026-10-05','19:42',135,92,'晚间测量 · 血压偏高'],
  ['2026-10-06','06:59',130,83,'早晨测量'],
  ['2026-10-06','22:00',121,84,'晚间测量'],
  ['2026-10-07','07:46',129,87,'早晨测量'],
  ['2026-10-07','21:41',122,84,'晚间测量'],
  ['2026-10-08','07:00',114,82,'早晨测量'],
  ['2026-10-08','21:45',125,82,'晚间测量'],
  ['2026-10-09','07:12',119,84,'早晨测量'],
  ['2026-10-10','06:29',118,84,'早晨测量'],
  ['2026-10-10','22:03',117,82,'晚间测量'],
  ['2026-10-11','07:16',122,84,'早晨测量'],
  ['2026-10-11','21:24',118,83,'晚间测量'],
  ['2026-10-12','07:09',116,85,'早晨测量'],
  ['2026-10-13','06:54',116,76,'早晨测量'],
  ['2026-10-13','21:39',111,74,'晚间测量'],
  ['2026-10-14','07:24',111,77,'早晨测量'],
  ['2026-10-14','21:59',115,79,'晚间测量'],
  ['2026-10-15','07:23',113,80,'早晨测量'],
  ['2026-10-15','21:25',117,79,'晚间测量'],
  ['2026-10-16','07:22',114,72,'早晨测量'],
  ['2026-10-16','21:37',125,81,'晚间测量'],
  ['2026-10-17','06:55',114,81,'早晨测量'],
  ['2026-10-17','21:30',119,73,'晚间测量'],
  ['2026-10-18','07:21',104,76,'早晨测量'],
  ['2026-10-18','22:16',118,76,'晚间测量'],
  ['2026-10-19','07:15',119,78,'早晨测量'],
  ['2026-10-19','20:50',115,77,'晚间测量'],
  ['2026-10-20','07:26',111,75,'早晨测量'],
  ['2026-10-20','22:24',109,76,'晚间测量'],
  ['2026-10-21','07:15',109,78,'早晨测量'],
  ['2026-10-21','22:55',119,77,'晚间测量'],
  ['2026-10-22','07:00',123,78,'早晨测量'],
];

(async () => {
  const t = await token();
  const records = ROWS.map(([d, time, sys, dia, note]) => ({
    fields: {
      '血压记录': `${d} ${time}`,
      '日期': d,
      '收缩压': sys,
      '舒张压': dia,
      '备注': note,
    },
  }));

  let created = 0;
  for (let i = 0; i < records.length; i += 25) {
    const chunk = records.slice(i, i + 25);
    const r = await post(
      `/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/batch_create`,
      { records: chunk },
      t
    );
    if (r.code !== 0) {
      console.error('batch_create error:', JSON.stringify(r));
      process.exit(1);
    }
    created += r.data.records.length;
    console.log(`[import] batch ${i / 25 + 1}: +${r.data.records.length} records`);
  }
  console.log(`[import] total created: ${created}`);
})();
