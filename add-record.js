#!/usr/bin/env node
/**
 * add-record.js — 快速录入一条血压记录到飞书 Bitable
 * 用法: node add-record.js 2026-10-23 123 77 65 "早晨测量 · 实时上报"
 */
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_TOKEN = 'Q4pbb4IHyaEh76sf3ZFcmOQvnAh';
const TABLE_ID = 'tblX0RyS4M5DqEKr';

// 优先用环境变量；否则从 OpenClaw 配置读取，避免密钥出现在命令行/脚本里
function loadCredentials() {
  if (process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET) {
    return { app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET };
  }
  const cfgPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const feishu = cfg.channels && cfg.channels.feishu;
  if (!feishu || !feishu.appId || !feishu.appSecret) {
    throw new Error('无法获取飞书凭据：请设置 FEISHU_APP_ID/FEISHU_APP_SECRET 或检查 ~/.openclaw/openclaw.json');
  }
  return { app_id: feishu.appId, app_secret: feishu.appSecret };
}

function req(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const r = https.request({ hostname: 'open.feishu.cn', path, method, headers, timeout: 30000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); } });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  const [dateArg, sys, dia, hr, note = ''] = process.argv.slice(2);
  if (!dateArg || !sys || !dia) {
    console.error('用法: node add-record.js <YYYY-MM-DD[ HH:MM]> <收缩压> <舒张压> [心率] [备注]');
    process.exit(1);
  }
  // 支持 "2026-10-22 21:30" 形式，带时间时标签会显示为 "10月22日 21:30"
  const [date, time] = dateArg.split(/\s+/);
  const t = (await req('/open-apis/auth/v3/tenant_access_token/internal', 'POST', loadCredentials())).tenant_access_token;

  const fields = {
    '血压记录': time ? `${date} ${time}` : date,
    '日期': date,
    '收缩压': Number(sys),
    '舒张压': Number(dia),
  };
  if (hr) fields['心率'] = Number(hr);
  if (note) fields['备注'] = note;

  const r = await req(`/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`, 'POST', { fields }, t);
  if (r.code !== 0) {
    console.error('create failed:', JSON.stringify(r));
    process.exit(1);
  }
  console.log(`[add] ${date}${time ? ' ' + time : ''} ${sys}/${dia}${hr ? ' ' + hr + 'bpm' : ''} -> record ${r.data.record.record_id}`);
})();
