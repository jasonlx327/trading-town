/* Trading 小镇 v2（海滨城市 · 四象限）— 交易团队像素看板
 * 只读团队日志/快照（本地服务器或公开版的脱敏 data JSON）；本页不连接任何交易所、不含 Key、不下单。
 * 没有数据时显示 0 / —，绝不生成假数字。纸上账本与实盘账本永远分开。 */
'use strict';
const W = 1280, H = 720, P = 2;
const cv = document.getElementById('town'), ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
let CFG = null, FONT = '', FILES = null, S = 2;
const IMG = {};
const STATE = { us: null, crypto: null, feed: [], seen: new Set(), firstLoad: true, checkedAt: null };
const ROLES = ['strategist', 'risk', 'trader', 'data'];
const DISTRICTS = ['us', 'crypto'];
/* ---------- 工具 ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); if (row.some(x => x !== '')) rows.push(row); }
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0].map(s => s.trim().replace(/^\uFEFF/, ''));
  return { header, rows: rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}
// 数据来源两种模式：本地服务器（/__files + 直接读 CSV）或公开静态版（CFG.dataBundle 指向一个 JSON，内含已脱敏的文件文本）
let BUNDLE = null;
const SITE_ROOT = new URL('../', location.href).href;
const rel = url => new URL(url, location.href).href.replace(SITE_ROOT, '').split('?')[0];
const DATA_DIRS = ['logs/', 'data/', 'reports/', 'backtest/'];
async function refreshFileList() {
  if (CFG && CFG.dataBundle) {
    try { const r = await fetch(CFG.dataBundle + '?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) { BUNDLE = await r.json(); FILES = new Set(Object.keys(BUNDLE.files || {}).map(k => '/' + k)); } } catch { /* 保留上一次成功的数据 */ }
    return;
  }
  try { const r = await fetch('/__files', { cache: 'no-store' }); FILES = r.ok ? new Set(await r.json()) : null; } catch { FILES = null; }
}
const absPath = url => '/' + rel(url);
const exists = url => { if (!FILES) return true; const p = rel(url); const listed = DATA_DIRS.some(d => p.startsWith(d)) || (!BUNDLE && p.startsWith('town-assets/')); return listed ? FILES.has('/' + p) : true; };
async function fetchText(url) {
  if (!url || !exists(url)) return null;
  if (BUNDLE && DATA_DIRS.some(d => rel(url).startsWith(d))) return BUNDLE.files[rel(url)] ?? null;
  try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) return null; return await r.text(); } catch { return null; }
}
async function fetchCSV(url) { const t = await fetchText(url); return t == null ? null : parseCSV(t); }
async function fetchJSON(url) { const t = await fetchText(url); if (t == null) return null; try { return JSON.parse(t); } catch { return null; } }
const num = v => { if (v === undefined || v === null || v === '') return null; const n = Number(String(v).replace(/[%,$\s]/g, '')); return Number.isFinite(n) ? n : null; };
const cstDate = s => { if (!s) return null; const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/); if (!m) return null; return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}+08:00`); };
const fmt = (v, d = 2, suf = '') => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) + suf;
const pct = (v, d = 2) => v == null || !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kwMatch = (s, kws) => { s = String(s || '').toLowerCase(); return !!s && (kws || []).some(k => s.includes(k.toLowerCase())); };
const etToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const hhmm = d => d ? d.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const short = s => String(s || '').replace(/^\.\.\//, '');
function tradingDaysUntil(dateStr) { // 美东今天(不含) 到 目标日(含) 的工作日数
  const t = new Date(etToday() + 'T12:00:00Z'), d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d)) return null; if (d < t) return -1; let n = 0;
  for (const x = new Date(t); x < d;) { x.setUTCDate(x.getUTCDate() + 1); const wd = x.getUTCDay(); if (wd && wd !== 6) n++; }
  return n;
}

/* ---------- 素材 ---------- */
function loadImg(key, src) {
  return new Promise(res => { if (!src || !exists(src)) { IMG[key] = null; return res(); } const im = new Image(); im.onload = () => { IMG[key] = im; res(); }; im.onerror = () => { IMG[key] = null; res(); }; im.src = src; });
}
const dimSrc = src => src.replace(/\.png$/, '_dim.png');
async function loadAssets() {
  const a = CFG.assets, ps = [];
  (a.ground?.frames || []).forEach((src, i) => ps.push(loadImg('g:' + i, src)));
  for (const [k, v] of Object.entries(a.buildings || {})) ps.push(loadImg('b:' + k, v.src));
  for (const [k, v] of Object.entries(a.characters || {})) ps.push(loadImg('cs:' + k, v.sheet));
  ps.push(loadImg('cs:trader_paper', a.traderPaperSheet), loadImg('shadow', a.shadow));
  for (const [k, v] of Object.entries(a.states || {})) {
    if (v.srcPattern) v.states.forEach(st => ps.push(loadImg(`s:${k}:${st}`, v.srcPattern.replace('{state}', st))));
    else ps.push(loadImg('s:' + k, v.src));
  }
  for (const d of CFG.layout.decor || []) { if (!(d.src in IMG)) ps.push(loadImg(d.src, d.src)); if (d.crypto && !(dimSrc(d.src) in IMG)) ps.push(loadImg(dimSrc(d.src), dimSrc(d.src))); }
  if (a.font && a.font.src && exists(a.font.src)) ps.push((async () => { try { const f = new FontFace(a.font.family, `url(${a.font.src})`); await f.load(); document.fonts.add(f); FONT = `"${a.font.family}",`; } catch {} })());
  await Promise.all(ps);
}
/* ---------- 数据加载与分析 ---------- */
function decisionOf(r) {
  const d = r.risk_decision; if (!d) return null;
  if (kwMatch(d, CFG.decision.rejectKeywords)) return 'rejected';
  if (kwMatch(d, CFG.decision.approveKeywords)) return 'approved';
  return 'pending';
}
const isLive = r => kwMatch(r.mode, CFG.ledger.liveModeKeywords);
const isFill = r => (num(r.filled_qty) || 0) > 0;
const isCountedFill = r => isFill(r) && !kwMatch(r.type, ['convert', 'dust', 'transfer', '兑换', '划转']) && !kwMatch(r.order_kind, ['stop', '止损', 'convert', 'dust']) && String(r.counts_toward_daily_cap || '').trim().toLowerCase() !== 'no';
const isPreauthStop = r => !!r.preauth_stop_price || kwMatch(r.order_kind, ['stop', '止损']) || kwMatch(r.type, ['stop', '止损']);
function ledgerOf(rows, last) {
  const fills = rows.filter(isCountedFill);
  const closed = rows.filter(r => num(r.realized_pnl_usd) != null);
  const wins = closed.filter(r => num(r.realized_pnl_usd) > 0).length;
  const fees = rows.reduce((s, r) => { const v = num(r.fee_in_quote) ?? num(r.fee); return v == null ? s : (s ?? 0) + v; }, null);
  const realized = closed.reduce((s, r) => s + num(r.realized_pnl_usd), 0);
  const by = {};
  for (const r of closed) { const k = r.strategy_id || '(未标注)'; (by[k] ||= { n: 0, sum: 0, pctSum: 0, pctN: 0 }); by[k].n++; by[k].sum += num(r.realized_pnl_usd); const p = num(r.realized_pnl_pct_equity); if (p != null) { by[k].pctSum += p; by[k].pctN++; } }
  return { rows: rows.length, fills: fills.length, closed: closed.length, wins, winRate: closed.length ? wins / closed.length : null, fees, realized: closed.length ? realized : null, byStrategy: by, lastTime: last };
}
async function loadDistrict(id) {
  const src = CFG.districts[id].sources || {};
  let reconUrl = null;
  if (src.reconDir && FILES) { const base = absPath(src.reconDir); const list = [...FILES].filter(f => f.startsWith(base + (src.reconPrefix || ''))).sort(); if (list.length) reconUrl = SITE_ROOT + list[list.length - 1].slice(1); }
  const latestOf = prefix => { if (!prefix || !FILES) return null; const base = absPath(prefix); const l = [...FILES].filter(f => f.startsWith(base) && f.endsWith('.json')).sort(); return l.length ? SITE_ROOT + l[l.length - 1].slice(1) : null; };
  const sg = src.snapshotGlobs || {}, fundUrl = latestOf(sg.funding), acctUrl = latestOf(sg.account);
  const [fund, acct] = await Promise.all([fundUrl ? fetchJSON(fundUrl) : null, acctUrl ? fetchJSON(acctUrl) : null]);
  const [trades, hb, holdings, signal, halt, earnings, recon] = await Promise.all([
    fetchCSV(src.tradeLog), fetchCSV(src.heartbeat), fetchCSV(src.holdings), fetchJSON(src.researchSignal),
    fetchText(src.haltFlag), fetchCSV(src.earnings), reconUrl ? fetchCSV(reconUrl) : null,
  ]);
  const d = { id, src, trades, hb, holdings, signal, reconUrl };
  // 最新账户快照（只取资产名/数量/时间；不含任何账户标识）
  d.snapshot = null;
  if (fund || acct) {
    const items = [];
    for (const a of (fund?.assets || [])) { const q = (num(a.free) || 0) + (num(a.locked) || 0) + (num(a.freeze) || 0); if (q > 0) items.push({ asset: a.asset, ticker: a.stockTicker || null, qty: q, wallet: '资金账户' }); }
    for (const a of (acct?.balances || [])) { const q = (num(a.free) || 0) + (num(a.locked) || 0); if (q > 0) items.push({ asset: a.asset, ticker: null, qty: q, wallet: '现货账户' }); }
    const t = [fund?.taken_at, acct?.taken_at].filter(Boolean).sort().pop();
    d.snapshot = { items, taken: t ? new Date(t) : null, fundFile: fundUrl, acctFile: acctUrl };
  }
  d.tradeRows = trades ? trades.rows : [];
  d.hbRows = hb ? hb.rows : [];
  d.hasData = d.tradeRows.length > 0 || d.hbRows.length > 0;
  const lastTradeTime = d.tradeRows.length ? d.tradeRows[d.tradeRows.length - 1].record_time_cst : null;
  // 两本账永不合并
  d.paper = ledgerOf(d.tradeRows.filter(r => !isLive(r)), lastTradeTime);
  d.live = ledgerOf(d.tradeRows.filter(isLive), lastTradeTime);
  // 心跳
  const lastHb = d.hbRows[d.hbRows.length - 1] || null; d.lastHb = lastHb;
  d.hbTime = lastHb ? cstDate(lastHb.ts_cst) : null;
  d.byTicker = {}; for (const r of d.hbRows) if (r.ticker) d.byTicker[r.ticker] = r;
  const staleMs = CFG.data.staleMinutes * 60e3;
  const ageMs = d.hbTime ? Date.now() - d.hbTime.getTime() : null;
  const oldPx = Object.values(d.byTicker).filter(r => (num(r.price_age_sec) ?? 0) > CFG.data.staleMinutes * 60).map(r => r.ticker);
  // 对账
  d.recon = { file: reconUrl, mismatch: false, reason: '' };
  if (recon) for (const r of recon.rows) {
    const m = (r.match ?? r.matched ?? '').toLowerCase();
    if (['false', 'no', '0', 'n'].includes(m) || kwMatch(r.status, ['mismatch', '不符', '差异']) || Math.abs(num(r.diff_usd) ?? 0) > 0.5) { d.recon.mismatch = true; d.recon.reason = r.notes || r.status || r.item || '对账差异'; break; }
  }
  d.stale = !lastHb || ageMs > staleMs || oldPx.length > 0 || d.recon.mismatch;
  d.staleReason = !lastHb ? '无心跳数据' : ageMs > staleMs ? `心跳 ${Math.round(ageMs / 60000)} 分钟未更新` : oldPx.length ? `报价过期: ${oldPx.join(',')}` : d.recon.mismatch ? `对账不符: ${d.recon.reason}` : '';
  // 回撤分级
  d.dd = lastHb ? (num(lastHb.drawdown_pct) != null ? Math.abs(num(lastHb.drawdown_pct)) : null) : null;
  d.tier = d.dd == null ? null : [...CFG.risk.drawdownTiers].reverse().find(t => d.dd >= t.min);
  // 风控暂停（halt.flag 存在 / 心跳状态 / 日志 halt 事件且之后无 resume）/ 30% 硬停
  let logHalt = false;
  for (const r of d.tradeRows) { if (kwMatch(r.type, CFG.risk.resumeKeywords)) logHalt = false; else if (kwMatch(r.type, CFG.risk.haltStatusKeywords)) logHalt = true; }
  const hbHalt = lastHb && kwMatch(lastHb.status, CFG.risk.haltStatusKeywords);
  d.riskHalt = halt != null || hbHalt || logHalt || (d.dd != null && d.dd >= CFG.risk.hardStopDrawdown);
  d.riskHaltReason = halt != null ? `halt.flag: ${halt.trim().slice(0, 60) || '(存在)'}` : hbHalt ? `心跳状态 ${lastHb.status}` : logHalt ? '日志 halt 事件' : d.riskHalt ? `回撤 ≥${CFG.risk.hardStopDrawdown}% 全面停止` : '';
  // 每日休市（美东交易日；次日自动解除）
  const today = etToday(), todayUTC = new Date().toISOString().slice(0, 10);
  const dayOf = r => r.trade_day_utc ? r.trade_day_utc === todayUTC : r.trade_day_et === today; // 加密按 UTC 日，美股按美东交易日
  const todayClosed = d.tradeRows.filter(r => dayOf(r) && num(r.realized_pnl_usd) != null);
  const lastN = todayClosed.slice(-CFG.risk.dailyHalt.consecutiveLosses);
  const streak = lastN.length === CFG.risk.dailyHalt.consecutiveLosses && lastN.every(r => num(r.realized_pnl_usd) < 0);
  const dayLoss = lastHb && dayOf(lastHb) && num(lastHb.daily_pnl_pct) != null && num(lastHb.daily_pnl_pct) <= CFG.risk.dailyHalt.dailyLossPct;
  d.dailyHalt = streak || dayLoss;
  d.dailyHaltReason = streak ? `今日连续 ${CFG.risk.dailyHalt.consecutiveLosses} 笔亏损` : dayLoss ? `今日亏损 ${lastHb.daily_pnl_pct}%` : '';
  // 风控章
  d.approvedSignals = new Set(d.tradeRows.filter(r => r.signal_id && decisionOf(r) === 'approved').map(r => r.signal_id));
  const decs = d.tradeRows.filter(r => decisionOf(r) && !isFill(r));
  const ld = decs[decs.length - 1] || d.tradeRows.filter(decisionOf).slice(-1)[0];
  d.stamp = ld ? { state: decisionOf(ld), reason: ld.notes || ld.risk_decision, signal: ld.signal_id, time: ld.record_time_cst } : null;
  // 持仓 / 对比
  const base = CFG.baseline, hold = holdings ? holdings.rows : [];
  d.positions = (id === 'us' ? base.tickers : Object.keys(d.byTicker)).map(tk => {
    const h = hold.find(r => r.ticker === tk), b = d.byTicker[tk];
    const qtyHb = b ? num(b.position_qty) : null;
    const snapIt = d.snapshot ? d.snapshot.items.find(it => it.ticker === tk) : null;
    const qty = qtyHb ?? (snapIt ? snapIt.qty : null) ?? (h ? num(h.qty) : null);
    const price = b ? num(b.last_price) : null;
    const cost = h ? num(h.avg_cost_usd) : null;
    const bid = b ? num(b.bid) : null, ask = b ? num(b.ask) : null;
    const spread = bid != null && ask != null && ask > 0 ? (ask - bid) / ((ask + bid) / 2) : (b && num(b.spread_pct) != null ? num(b.spread_pct) / 100 : null);
    const e = earnings ? earnings.rows.find(r => r.ticker === tk) : null;
    let win = null; if (e && e.next_earnings_date) { const st = /confirm|确认/i.test(e.status) ? 'confirmed' : 'estimated'; const n = tradingDaysUntil(e.next_earnings_date); win = n != null && n >= 0 && n <= CFG.data.earningsWindowDays[st]; }
    return { tk, qty, qtySrc: qtyHb != null ? `heartbeat.csv · ${b.ts_cst}` : snapIt ? `${short(d.snapshot.fundFile).replace(/^.*\//, '')} · ${hhmm(d.snapshot.taken)}` : h ? `holdings-baseline.csv · ${h.as_of_cst}` : '—', price, priceSrc: b ? `heartbeat.csv(${b.data_source || '—'}) · ${b.ts_cst}` : '无心跳', value: qty != null && price != null ? qty * price : null, cost, baseQty: h ? num(h.qty) : null, spread, e, inWindow: win };
  });
  d.equity = lastHb ? num(lastHb.equity_usd) : null;
  d.cumRet = d.equity != null && id === 'us' ? d.equity / base.equity_usd - 1 : null;
  const dn = id === 'us' && d.positions.length && d.positions.every(p => p.baseQty != null && p.price != null) ? d.positions.reduce((s, p) => s + p.baseQty * p.price, 0) : null;
  d.doNothing = dn; d.doNothingRet = dn != null ? dn / base.equity_usd - 1 : null;
  const spy = d.hbRows.filter(r => r.ticker === CFG.benchmark.ticker && num(r.last_price) != null);
  d.spyRet = spy.length >= 2 ? num(spy[spy.length - 1].last_price) / num(spy[0].last_price) - 1 : null;
  d.spySrc = spy.length ? `heartbeat.csv SPY ${spy[0].ts_cst} → ${spy[spy.length - 1].ts_cst}` : '心跳无 SPY 行';
  d.visuals = d.hasData || !CFG.districts[id].hideVisualsWithoutData;
  return d;
}

/* ---------- 事件 ---------- */
function classify(r) {
  const fill = isFill(r);
  const meet = !fill && (kwMatch(r.type, CFG.meeting.typeKeywords) || !!r.risk_decision || !!r.signal_id);
  return { isTrade: fill, isMeet: meet, decision: decisionOf(r), live: isLive(r) };
}
function gateOK(d, r) { return decisionOf(r) === 'approved' || (r.signal_id && d.approvedSignals.has(r.signal_id)) || isPreauthStop(r); }
function buildFeed() {
  const feed = [];
  for (const id of DISTRICTS) {
    const d = STATE[id], dn = CFG.districts[id].name;
    d.tradeRows.forEach((r, i) => {
      const c = classify(r);
      const parts = [isLive(r) ? '[实盘]' : '[纸上]', r.type, r.order_kind, r.side, r.ticker, r.filled_qty && `成交 ${r.filled_qty}`, r.avg_fill_price && `@${r.avg_fill_price}`, r.fee && `费 ${r.fee}`, r.risk_decision && `风控:${r.risk_decision}`, r.signal_id && `信号 ${r.signal_id}`, r.realized_pnl_usd && `盈亏 ${r.realized_pnl_usd}`, r.notes].filter(Boolean);
      if (c.isTrade && !gateOK(d, r)) parts.push('（未见风控绿章 → 交易员不出发）');
      feed.push({ seq: i, key: `${id}:t:${i}:${r.record_time_cst}:${r.order_id}:${r.type}`, district: id, dn, row: r, time: cstDate(r.record_time_cst), ts: r.record_time_cst, text: parts.join(' · '), ...c });
    });
    d.hbRows.forEach((r, i) => feed.push({ seq: i, key: `${id}:h:${i}:${r.ts_cst}:${r.ticker}`, district: id, dn, row: r, time: cstDate(r.ts_cst), ts: r.ts_cst, text: `心跳 ${r.status || ''} ${r.ticker || ''} ${r.last_price ? '价 ' + r.last_price : ''} ${r.equity_usd ? '权益 ' + r.equity_usd : ''} ${r.notes || ''}`.trim(), isTrade: false, isMeet: false }));
  }
  feed.sort((a, b) => ((b.time?.getTime() || 0) - (a.time?.getTime() || 0)) || (b.seq - a.seq));
  STATE.feed = feed;
}
/* ---------- 事件 → 动画 ---------- */
const anyVis = () => DISTRICTS.filter(id => STATE[id] && STATE[id].visuals);
const haltedAny = () => anyVis().some(id => STATE[id].riskHalt);
const dailyAny = () => anyVis().some(id => STATE[id].dailyHalt);
async function refresh() {
  await refreshFileList();
  const [us, crypto] = await Promise.all([loadDistrict('us'), loadDistrict('crypto')]);
  STATE.us = us; STATE.crypto = crypto; STATE.checkedAt = new Date();
  buildFeed();
  const now = Date.now(), fresh = STATE.feed.filter(e => !STATE.seen.has(e.key));
  STATE.feed.forEach(e => STATE.seen.add(e.key));
  const recent = e => e.time && (now - e.time.getTime()) < CFG.meeting.recentHours * 3600e3;
  const pool = (STATE.firstLoad ? fresh.filter(recent) : fresh).filter(e => STATE[e.district].visuals);
  const meet = pool.find(e => e.isMeet);
  const fill = pool.find(e => e.isTrade && gateOK(STATE[e.district], e.row));
  if (meet) startMeeting(meet, fill || null);
  else if (fill) startTradeRun(fill);
  STATE.firstLoad = false;
  await loadRants(); await loadCards();
  if (BUNDLE) document.getElementById('dataGen').textContent = ` · 公开版数据包生成于 ${hhmm(new Date(BUNDLE.generated_at))} 北京（每 30 分钟自动刷新余额与价格；成交在日志同步后更新）`;
  renderPanels(); renderFeed();
}

/* ---------- 布局 / 路线（全部来自 CFG.layout，原生像素） ---------- */
const B = k => { const L = CFG.layout.buildings[k], a = CFG.assets.buildings[k]; return { x: L.x, y: L.bottom - a.size[1], w: a.size[0], h: a.size[1], bottom: L.bottom, door: [L.x + a.door[0], L.bottom - a.size[1] + a.door[1]] }; };
const R = k => CFG.layout.routes[k];
const PLZ = k => R(k).length - 2; // 广场点索引
const HUBDOOR = () => { const r = R('trader'); return r[r.length - 1]; };

/* ---------- 角色 ---------- */
const chars = [];
const fx = { meeting: null, trade: null };
function makeChars() {
  for (const role of ROLES) { const d = R(role)[0]; chars.push({ role, x: d[0], y: d[1], q: [], seg: 0, node: 'route', mode: 'wander', wait: 1 + Math.random() * 3, face: 'down', phase: Math.floor(Math.random() * 4), hidden: false, speed: 16 + Math.random() * 4 }); }
}
function onRouteSeg(c) { const r = R(c.role); for (let i = 0; i < r.length - 1; i++) { const [ax, ay] = r[i], [bx, by] = r[i + 1]; if (c.x >= Math.min(ax, bx) - 0.5 && c.x <= Math.max(ax, bx) + 0.5 && c.y >= Math.min(ay, by) - 0.5 && c.y <= Math.max(ay, by) + 0.5) return i; } return 0; }
function toPlaza(c) { // 从当前位置走到广场点
  if (c.node === 'warroom') return R('warroom').slice(1, PLZ('warroom') + 1);
  if (c.node === 'hub') return [R(c.role)[PLZ(c.role)]];
  const r = R(c.role), i = onRouteSeg(c); return r.slice(i + 1, PLZ(c.role) + 1);
}
const plazaTo = k => R(k).slice(0, PLZ(k)).reverse(); // 广场 → 某建筑门
function go(c, pts, mode, node) { c.q = pts.map(p => [p[0], p[1]]); c.mode = mode; c.dest = node; c.hidden = false; c.wait = 0; }
function startMeeting(ev, pendingFill) {
  fx.meeting = { ev, until: null, arrived: 0, pendingFill };
  for (const c of chars) { if (c.mode === 'inside') continue; go(c, toPlaza(c).concat(plazaTo('warroom')), 'meeting', 'warroom'); }
}
function startTradeRun(ev) {
  if (haltedAny()) return; // 风控暂停：交易员留在楼内
  const t = chars.find(c => c.role === 'trader'); if (t.mode === 'inside') return;
  fx.trade = { ev, until: null, live: ev.live };
  go(t, toPlaza(t).concat([HUBDOOR()]), 'hub', 'hub');
}
function goHome(c, mode = 'wander') {
  let pts;
  if (c.node === 'route') { const r = R(c.role), i = onRouteSeg(c); pts = r.slice(1, i + 1).reverse().concat([r[0]]); }
  else pts = toPlaza(c).concat(plazaTo(c.role));
  go(c, pts, mode === 'inside' ? 'goinside' : 'return', 'home');
}
function pickWander(c) {
  const r = R(c.role), maxSeg = Math.max(0, PLZ(c.role) - 2), j = Math.floor(Math.random() * (maxSeg + 1)), f = Math.random();
  const T = [r[j][0] + (r[j + 1][0] - r[j][0]) * f, r[j][1] + (r[j + 1][1] - r[j][1]) * f].map(Math.round);
  const i = onRouteSeg(c);
  const pts = j >= i ? r.slice(i + 1, j + 1).concat([T]) : r.slice(j + 1, i + 1).reverse().concat([T]);
  go(c, pts, 'wander', 'route');
}
function updateChars(dt, now) {
  const m = fx.meeting;
  if (m && m.until && now > m.until) {
    fx.meeting = null; m.ev.done = true;
    const t = chars.find(c => c.role === 'trader');
    const ok = m.pendingFill && (m.ev.decision === 'approved' || gateOK(STATE[m.pendingFill.district], m.pendingFill.row));
    for (const c of chars) if (c.node === 'warroom') { c.hidden = false; if (!(ok && c === t)) goHome(c); }
    if (ok) startTradeRun(m.pendingFill); // 绿章后交易员才出发去 Hub
  }
  const tr = fx.trade;
  if (tr && tr.until && now > tr.until) { fx.trade = null; const t = chars.find(c => c.role === 'trader'); if (t.node === 'hub') goHome(t); }
  // 风控暂停：交易员回楼内，直到用户恢复
  const t = chars.find(c => c.role === 'trader');
  if (haltedAny() && t.mode !== 'inside' && t.mode !== 'goinside' && t.node !== 'warroom') { fx.trade = null; goHome(t, 'inside'); }
  if (!haltedAny() && t.mode === 'inside') { t.mode = 'wander'; t.hidden = false; t.wait = 0.5; }
  for (const c of chars) {
    if (c.hidden) continue;
    if (!c.q.length) { if (c.mode === 'wander' || c.mode === 'return') { c.mode = 'wander'; c.wait -= dt; if (c.wait <= 0) pickWander(c); } continue; }
    const [tx, ty] = c.q[0], dx = tx - c.x, dy = ty - c.y, dist = Math.hypot(dx, dy), s = c.speed * dt;
    if (dist <= s) {
      c.x = tx; c.y = ty; c.q.shift();
      if (!c.q.length) {
        c.node = c.dest === 'home' ? 'route' : c.dest;
        if (c.mode === 'meeting') { c.hidden = true; m && (m.arrived++, m.until = m.until || now + CFG.meeting.durationSeconds * 1000); }
        else if (c.mode === 'hub') { if (fx.trade && !fx.trade.until) fx.trade.until = now + CFG.tradeEvent.durationSeconds * 1000; c.face = 'up'; }
        else if (c.mode === 'goinside') { c.mode = 'inside'; c.hidden = true; }
        else { c.wait = 1.5 + Math.random() * 4; c.face = 'down'; }
      }
      continue;
    }
    c.x += dx / dist * s; c.y += dy / dist * s;
    c.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
}


/* ---------- 摸鱼角 · 吐槽墙（data/rants.json，改数据不改代码） ---------- */
let RANTS = null, RANT_SIG = '', RANT_BUBBLE = null, rantTimers = [];
async function loadRants() {
  if (!CFG.rants) return;
  const r = await fetchJSON(CFG.rants.src); if (!r || !Array.isArray(r.rants)) return;
  const sig = JSON.stringify(r); if (sig === RANT_SIG) return; RANT_SIG = sig; RANTS = r; renderRantWall();
}
const rantsOf = bot => (RANTS?.rants || []).filter(x => x.bot === bot && x.text);
function renderRantWall() {
  const wrap = document.getElementById('rants'); if (!wrap || !RANTS) return;
  rantTimers.forEach(clearInterval); rantTimers = [];
  document.getElementById('rantMeta').textContent = RANTS.updated ? `更新于 ${RANTS.updated}` : '';
  const bots = Object.entries(RANTS.bots || {}).filter(([k]) => rantsOf(k).length);
  wrap.innerHTML = bots.map(([k, b]) => {
    const av = b.sprite ? `<div class="av" style="background-image:url('${esc(b.sprite)}')"></div>` : `<div class="av badge" style="background:${esc(b.color)}">${esc(b.badge || b.name[0])}</div>`;
    return `<div class="rant" data-bot="${esc(k)}" style="--c:${esc(b.color || '#d9a21b')}">${av}<div class="rb"><div class="rn">${esc(b.name)} <small>${esc(b.title || '')}</small></div><div class="rt"></div><div class="rd"></div></div></div>`;
  }).join('');
  const cyc = (CFG.rants.cardCycleSeconds || 9) * 1000;
  wrap.querySelectorAll('.rant').forEach((el, i) => {
    const list = rantsOf(el.dataset.bot); let n = Math.floor(Math.random() * list.length);
    const show = () => { const t = el.querySelector('.rt'), d = el.querySelector('.rd'); t.classList.add('fade'); setTimeout(() => { const x = list[n++ % list.length]; t.textContent = `“${x.text}”`; d.textContent = `${x.date || ''} · ${(n - 1) % list.length + 1}/${list.length}`; t.classList.remove('fade'); }, 350); };
    show(); setTimeout(() => rantTimers.push(setInterval(show, cyc)), i * 1300); // 错开换条
    el.onclick = show;
  });
}
function tickBubble(now) {
  if (!RANTS || !CFG.rants) return;
  if (RANT_BUBBLE && now < RANT_BUBBLE.until) return;
  if (RANT_BUBBLE && now < RANT_BUBBLE.until + (CFG.rants.bubbleEverySeconds - CFG.rants.bubbleSeconds) * 1000) return;
  const cand = chars.filter(c => !c.hidden && rantsOf(c.role).length && c.mode !== 'meeting' && !(c.role === 'trader' && fx.trade));
  if (!cand.length) return;
  const c = cand[Math.floor(Math.random() * cand.length)], l = rantsOf(c.role);
  RANT_BUBBLE = { c, text: l[Math.floor(Math.random() * l.length)].text, until: now + CFG.rants.bubbleSeconds * 1000 };
}
function wrapText(s, max) { const out = []; let cur = ''; for (const ch of s) { cur += ch; if (cur.length >= max && /[，。、！？：；,.!?)\s]/.test(ch)) { out.push(cur); cur = ''; } else if (cur.length >= max + 4) { out.push(cur); cur = ''; } } if (cur) out.push(cur); return out.slice(0, 5); }
function drawBubble(now) {
  const b = RANT_BUBBLE; if (!b || now > b.until || b.c.hidden) return;
  const lines = wrapText(b.text, 11), lh = 28; ctx.font = `${FONT ? 24 : 20}px ${FONT}"Noto Sans CJK SC",sans-serif`;
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 20, h = lines.length * lh + 12;
  let x = X(b.c.x) - w / 2, y = X(b.c.y - 30) - h - 14; x = Math.max(4, Math.min(W - w - 4, x)); if (y < 4) y = X(b.c.y) + 12;
  const px = (a, b2, c2, d, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(a), Math.round(b2), Math.round(c2), Math.round(d)); };
  px(x - 2, y - 2, w + 4, h + 4, '#1a1423'); px(x, y, w, h, '#f4ecd8'); px(x, y + h - 3, w, 3, '#d8ccb0');
  const tx = Math.max(x + 8, Math.min(x + w - 16, X(b.c.x) - 4)); px(tx, y + h + 2, 8, 4, '#1a1423'); px(tx + 2, y + h, 4, 4, '#f4ecd8'); px(tx + 2, y + h + 4, 4, 4, '#1a1423');
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1a1423';
  lines.forEach((l, i) => ctx.fillText(l, x + 10, y + 6 + lh / 2 + i * lh));
}
function drawRantSign() { // 海滩上的「摸鱼角」小牌子
  const s = CFG.rants?.sign || [322, 304]; const x = X(s[0]), y = X(s[1]);
  ctx.fillStyle = '#1a1423'; ctx.fillRect(x - 44, y - 12, 88, 24); ctx.fillStyle = '#2b2433'; ctx.fillRect(x - 42, y - 10, 84, 20); ctx.fillStyle = '#d9a21b'; ctx.fillRect(x - 42, y - 10, 84, 2);
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - 3, y + 12, 6, 14);
  text('☕ 摸鱼角', x, y + 1, '#f5d44a', 12);
}

/* ---------- 绘制 ---------- */
const X = v => Math.round(v * S);
function text(s, x, y, col = '#fff', size = 12, align = 'center') {
  ctx.font = `${FONT ? 12 * Math.max(1, Math.round(size / 12)) : size}px ${FONT}"Noto Sans CJK SC","PingFang SC",sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a1423'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function img(im, nx, ny, opt = {}) { // 原生坐标左上角
  if (!im) return; const fr = opt.frames || 1, fw = im.width / fr, f = opt.frame || 0;
  ctx.save(); if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
  let x = X(nx), y = X(ny); const w = X(fw), h = X(im.height);
  if (opt.flipX || opt.flipY) { ctx.translate(x + (opt.flipX ? w : 0), y + (opt.flipY ? h : 0)); ctx.scale(opt.flipX ? -1 : 1, opt.flipY ? -1 : 1); x = 0; y = 0; }
  ctx.drawImage(im, f * fw, 0, fw, im.height, x, y, w, h); ctx.restore();
}
const animF = (fps, n, t) => Math.floor(t * fps) % n;
function bshadow(nx, ny, w, h) { ctx.fillStyle = 'rgba(26,20,35,.23)'; ctx.fillRect(X(nx + 6), X(ny + h - 8), X(w - 3), X(10)); }
function drawBuilding(k, t) {
  const b = B(k), a = CFG.assets.buildings[k], im = IMG['b:' + k];
  bshadow(b.x, b.y, b.w, b.h);
  if (im) img(im, b.x, b.y, { frames: a.frames || 1, frame: a.frames ? animF(a.fps || 4, a.frames, t) : 0 });
  else { ctx.fillStyle = '#6b6a7a'; ctx.fillRect(X(b.x), X(b.y), X(b.w), X(b.h)); text(k, X(b.x + b.w / 2), X(b.y + b.h / 2)); }
  const st = CFG.assets.states;
  const at = (key, extra = {}) => { const s = st[key]; if (!s) return; img(extra.im || IMG['s:' + key], b.x + s.offset[0], b.y + s.offset[1], extra); };
  if (k === 'hub') drawHubOverlay(b, t, at);
  if (k === 'risk') { const d = worstRisk(); const state = d ? d.state : 'off'; at('riskLamp', { im: IMG[`s:riskLamp:${state}`], frames: 2, frame: state === 'off' ? 0 : animF(2, 2, t) }); }
  if (k === 'data') { const stale = dataStale(); at(stale ? 'dataLampStale' : 'dataLampOk'); if (stale) img(IMG['s:iconStale'], b.x + b.w / 2 - 8, b.y - 18); }
  if (k === 'warroom') drawWarRoomOverlay(b, t);
  if (k === 'trader' && haltedAny()) text('交易员留守（风控暂停）', X(b.x + b.w / 2), X(b.y) - 10, '#f28a8a');
}
function worstRisk() { // 可见街区中回撤最深者；无数据/过期 → 灯灭
  let best = null;
  for (const id of anyVis()) { const d = STATE[id]; if (d.tier && !d.stale) { const r = { state: d.tier.state, dd: d.dd, id }; if (!best || r.dd > best.dd) best = r; } }
  return best;
}
const dataStale = () => { const v = anyVis(); return !v.length || v.some(id => STATE[id].stale); };
function drawHubOverlay(b, t, at) {
  if (dailyAny()) at('hubClosed');
  if (haltedAny()) at('hubBarricade', { frames: 2, frame: animF(2, 2, t) });
  // 屏幕：轮播真实数据（无数据显示 —）
  const [sx, sy, sw, sh] = CFG.assets.buildings.hub.screenRect, lines = hubLines();
  const line = lines[Math.floor(t / 3) % lines.length];
  ctx.save(); ctx.beginPath(); ctx.rect(X(b.x + sx), X(b.y + sy), X(sw), X(sh)); ctx.clip();
  text(line.s, X(b.x + sx + sw / 2), X(b.y + sy + sh / 2) + 1, line.c || '#f5d44a', 12); ctx.restore();
  if (fx.trade) { const tr = fx.trade; text(`${CFG.districts[tr.ev.district].name}${tr.live ? '实盘' : '纸上'}成交 ${tr.ev.row.side || ''} ${tr.ev.row.ticker || ''}`, X(b.x + b.w / 2), X(b.y) - 12, '#f5d44a'); }
}
function hubLines() {
  const us = STATE.us, L = [];
  if (haltedAny()) L.push({ s: '风控暂停', c: '#f28a8a' }); else if (dailyAny()) L.push({ s: '今日休市', c: '#f28a8a' }); else L.push({ s: us.hasData ? '● 运行中' : '待数据', c: '#3fd86a' });
  let eqHub = us.equity; if (eqHub == null) { try { eqHub = CARDS?.equity?.equity ?? null; } catch (_) { eqHub = null; } }
  L.push({ s: '权益 ' + (eqHub != null ? '$' + fmt(eqHub, 0) : '—') });
  const fills = us.paper.fills + us.live.fills + STATE.crypto.paper.fills + STATE.crypto.live.fills;
  L.push({ s: `成交 ${fills} 笔` });
  for (const p of us.positions) if (p.qty != null) L.push({ s: `${p.tk} ${fmt(p.qty, 2)}`, c: '#a0f0f0' });
  return L;
}
function latestStamp() { const c = anyVis().map(id => STATE[id].stamp).filter(Boolean); c.sort((a, b) => (cstDate(a.time)?.getTime() || 0) - (cstDate(b.time)?.getTime() || 0)); return c.pop() || null; }
function drawWarRoomOverlay(b, t) {
  const st = CFG.assets.states, m = fx.meeting, s = latestStamp();
  if (!m && !s) return;
  const bd = st.reviewBoardCard, bx = b.x + bd.offset[0], by = b.y + bd.offset[1];
  img(IMG['s:reviewBoardCard'] || IMG['s:reviewBoard'], bx, by);
  const [rx, ry, rw, rh] = st.reasonStrip.textRectInBoard;
  let msg = '', col = '#fff1a8';
  if (m) { const inside = chars.filter(c => c.node === 'warroom' && c.hidden).length; msg = `审议中 ${inside}人 ${m.ev.row.ticker || ''}`; }
  else if (s.state === 'approved' || s.state === 'rejected') {
    const ok = s.state === 'approved', sp = ok ? st.stampApprove : st.stampReject;
    img(IMG[ok ? 's:stampApprove' : 's:stampReject'], bx + sp.offsetInBoard[0], by + sp.offsetInBoard[1]);
    msg = `${s.signal || ''} ${s.reason || ''}`.trim(); col = ok ? '#3fd86a' : '#f28a8a';
  } else msg = `待审 ${s.signal || ''}`;
  img(IMG['s:reasonStrip'], bx + st.reasonStrip.offsetInBoard[0], by + st.reasonStrip.offsetInBoard[1]);
  ctx.save(); ctx.beginPath(); ctx.rect(X(bx + rx), X(by + ry), X(rw), X(rh)); ctx.clip();
  text(msg, X(bx + rx) + 2, X(by + ry + rh / 2) + 1, col, 12, 'left'); ctx.restore();
}
function drawDecor(d) {
  const dim = d.crypto && !(STATE.crypto && STATE.crypto.hasData);
  const im = (dim && IMG[dimSrc(d.src)]) || IMG[d.src]; if (!im) return;
  img(im, d.x, d.bottom - im.height, { flipX: d.flipX, flipY: d.flipY });
  if (d.tag === 'billboard' && STATE.us && STATE.us.positions.some(p => p.inWindow)) img(IMG['s:iconEarnings'], d.x + 40, d.bottom - im.height - 8);
}
function drawChar(c, t) {
  if (c.hidden) return;
  const ac = CFG.assets.characters[c.role], moving = c.q.length > 0;
  const run = c.role === 'trader' && c.mode === 'hub' && fx.trade, paper = run && !fx.trade.live;
  const sheet = (paper && IMG['cs:trader_paper']) || IMG['cs:' + c.role];
  const [ax, ay] = ac.anchor, row = Math.max(0, ac.rows.indexOf(c.face));
  const cols = moving ? ac.walkCols : ac.idleCols, col = cols[Math.floor(t * (moving ? ac.walkFps : ac.idleFps) + c.phase) % cols.length];
  const sh = IMG['shadow']; if (sh) img(sh, c.x - 8, c.y - 3);
  if (sheet) { ctx.save(); if (paper && !IMG['cs:trader_paper']) ctx.globalAlpha = 0.55; ctx.drawImage(sheet, col * ac.frameW, row * ac.frameH, ac.frameW, ac.frameH, X(c.x - ax), X(c.y - ay), X(ac.frameW), X(ac.frameH)); ctx.restore(); }
  if (paper) text('纸上', X(c.x + 16), X(c.y - 20), '#a0f0f0', 12, 'left');
}
function frame(nowT) {
  const dt = Math.min(0.1, (nowT - lastT) / 1000); lastT = nowT; const t = nowT / 1000;
  updateChars(dt, Date.now());
  const g = IMG['g:' + animF(CFG.assets.ground.fps || 4, (CFG.assets.ground.frames || []).length || 1, t)] || IMG['g:0'];
  if (g) ctx.drawImage(g, 0, 0, W, H); else { ctx.fillStyle = '#5fa84a'; ctx.fillRect(0, 0, W, H); }
  const items = [];
  for (const k of Object.keys(CFG.layout.buildings)) items.push({ y: CFG.layout.buildings[k].bottom, d: () => drawBuilding(k, t) });
  for (const d of CFG.layout.decor) items.push({ y: d.bottom, d: () => drawDecor(d) });
  for (const c of chars) items.push({ y: c.y + 4, d: () => drawChar(c, t) });
  items.push({ y: (CFG.rants?.sign || [322, 304])[1] + 26, d: drawRantSign });
  items.sort((a, b) => a.y - b.y).forEach(o => o.d());
  drawHover(t); tickBubble(Date.now()); drawBubble(Date.now());
  for (const l of CFG.layout.sideLabels || []) { const off = l.district === 'crypto' && !STATE.crypto.hasData; text(l.text + (off ? '（待接入）' : ''), X(l.x), X(l.y), off ? '#a7a9b8' : '#fff1a8'); }
  document.getElementById('clock').textContent = new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) + ' 北京时间';
  requestAnimationFrame(frame);
}
let lastT = performance.now();
/* ---------- 面板（每个数字都带来源 + 更新时间） ---------- */
const KEY_ROWS = new Set(['总资产 USD', '起始资产 USD']);
function row(label, val, src, time, stale) { const tip = `来源: ${src || '—'}${time ? ' · ' + time : ''}`; return `<div class="r${stale ? ' stale' : ''}${KEY_ROWS.has(label) ? ' key' : ''}" title="${esc(tip)}"><span>${label}<em class="src-i">ⓘ</em></span><b>${val}</b><i>${esc(src)}${time ? ' · ' + esc(time) : ''}</i></div>`; }
document.addEventListener('click', e => { const r = e.target.closest && e.target.closest('.r'); if (r) r.classList.toggle('open'); });
function ledgerHTML(name, L, stale) {
  const t = L.lastTime || null, src = 'trade-log.csv';
  let h = `<div class="ledger"><h4>${name}</h4>` +
    row('成交笔数', L.fills, src, t) + row('已平仓', L.closed, src, t) +
    row('胜率', L.winRate == null ? '—' : (L.winRate * 100).toFixed(1) + '%', src + ' realized_pnl_usd', t) +
    row('总手续费', fmt(L.fees), src + ' fee', t) + row('已实现盈亏', fmt(L.realized), src, t);
  const ks = Object.keys(L.byStrategy);
  h += ks.length ? ks.map(k => { const s = L.byStrategy[k]; return row(`期望/笔 ${esc(k)}`, `${fmt(s.sum / s.n)} USD${s.pctN ? ` (${fmt(s.pctSum / s.pctN, 3, '%')})` : ''} ×${s.n}`, src + ' strategy_id', t); }).join('') : row('每策略期望', '—', src + '（无平仓记录）', t);
  return h + '</div>';
}
function renderPanels() {
  const chk = hhmm(STATE.checkedAt);
  for (const id of DISTRICTS) {
    const d = STATE[id], dc = CFG.districts[id], el = document.getElementById('panel-' + id);
    const tag = d.hasData ? '<span class="tag live">真实日志</span>' : `<span class="tag wait">${esc(dc.placeholderLabel)}</span>`;
    const hbT = d.lastHb ? d.lastHb.ts_cst : null, hbSrc = d.hb ? 'heartbeat.csv' : `${short(dc.sources.heartbeat)} 不存在`;
    const st = d.stale && d.hasData;
    let h = `<h3>${esc(dc.name)} ${tag}${st ? ' <span class="tag stale">数据过期</span>' : ''}${d.riskHalt && d.visuals ? ' <span class="tag halt">风控暂停</span>' : ''}${d.dailyHalt && d.visuals ? ' <span class="tag halt">今日休市</span>' : ''}</h3>`;
    if (st) h += `<div class="warn">⚠ ${esc(d.staleReason)}</div>`;
    if (id === 'crypto' && !d.hasData) {
      h += `<div class="muted">加密货币纸上交易数据尚未产生 — 不显示交易动画。<br>等待 ${esc(short(dc.sources.tradeLog))}（与 trade-log.csv 同列）· 检查于 ${chk}</div>`;
      el.innerHTML = h; continue;
    }
    const B = CFG.baseline;
    h += '<div class="sec">账户总览</div>';
    h += row('总资产 USD', fmt(d.equity), hbSrc + ' equity_usd', hbT || `检查 ${chk}`, st);
    if (id === 'us') {
      h += row('起始资产 USD', fmt(B.equity_usd), B.source, B.as_of_cst + ' 北京');
      h += row('累计收益', pct(d.cumRet), '总资产 ÷ 起始', hbT, st);
    }
    h += row('当前回撤', d.dd == null ? '—' : fmt(d.dd, 2, '%') + (d.tier ? ` <span style="color:${d.tier.color}">●${esc(d.tier.label)}</span>` : ''), hbSrc + ' drawdown_pct', hbT, st);
    h += row('今日盈亏', d.lastHb ? fmt(num(d.lastHb.daily_pnl_pct), 2, '%') : '—', hbSrc + ' daily_pnl_pct', hbT, st);
    h += row('今日计数订单', d.lastHb ? (d.lastHb.orders_today_capped || 0) : 0, hbSrc, hbT, st);
    if (id === 'us') {
      h += '<div class="sec">对比（同一起点 ' + esc(B.as_of_cst) + ' 北京）</div>';
      h += row('本策略', pct(d.cumRet), 'heartbeat.csv', hbT, st);
      h += row('什么都不做(持有 LITE/TSLA)', pct(d.doNothingRet), '基线股数 × 心跳最新价', hbT, st);
      h += row('SPY', pct(d.spyRet), d.spySrc, '', st);
    }
    h += '<div class="sec">持仓</div><table class="pos"><tr><th>标的</th><th>股数</th><th>价格</th><th>市值</th><th>盈亏</th><th>价差</th><th>下次财报</th></tr>';
    for (const p of d.positions) {
      const pnl = p.cost != null && p.price != null && p.qty != null ? fmt((p.price - p.cost) * p.qty) : (p.cost == null ? '未知<small>(成本未知)</small>' : '—');
      const e = p.e ? `${esc(p.e.next_earnings_date)} <small>${/confirm|确认/i.test(p.e.status) ? '已确认' : '预估'}</small>${p.inWindow ? ' <span class="ew">⚠财报窗口</span>' : ''}` : '—';
      h += `<tr class="${st ? 'stale' : ''}"><td>${esc(p.tk)}</td><td title="${esc(p.qtySrc)}">${fmt(p.qty, 4)}</td><td title="${esc(p.priceSrc)}">${fmt(p.price)}</td><td>${fmt(p.value)}</td><td>${pnl}</td><td>${p.spread == null ? '—' : fmt(p.spread * 100, 3, '%')}</td><td title="${p.e ? esc(p.e.source + ' · ' + (p.e.updated_cst || '')) : '无财报日历文件'}">${e}</td></tr>`;
      h += `<tr class="srcrow"><td colspan="7">股数: ${esc(p.qtySrc)} · 价格/价差: ${esc(p.priceSrc)} · 财报: ${p.e ? esc((p.e.source || '') + ' ' + (p.e.updated_cst || '')) : esc(short(dc.sources.earnings || '')) + ' 不存在'}</td></tr>`;
    }
    h += '</table>';
    if (d.snapshot) {
      h += `<div class="sec">最新账户快照 <span class="muted">${esc(hhmm(d.snapshot.taken))} 北京 · ${esc(rel(d.snapshot.fundFile || d.snapshot.acctFile || ''))}</span></div><table class="pos"><tr><th>资产</th><th>账户</th><th>数量</th></tr>`;
      h += d.snapshot.items.map(it => `<tr><td>${esc(it.asset)}${it.ticker ? ` <small>(${esc(it.ticker)})</small>` : ''}</td><td>${esc(it.wallet)}</td><td>${fmt(it.qty, it.qty < 1 ? 6 : 4)}</td></tr>`).join('') + '</table>';
      h += '<div class="muted">快照只有数量没有价格；估值需心跳价格（当前无价格数据）。</div>';
    }
    h += '<div class="ledgers">' + ledgerHTML('纸上账本 PAPER', d.paper, st) + ledgerHTML('实盘账本 LIVE', d.live, st) + '</div>';
    h += `<div class="muted">来源文件: ${esc(short(dc.sources.tradeLog))} ${d.trades ? `(${d.tradeRows.length} 行)` : '(不存在)'} · ${esc(short(dc.sources.heartbeat))} ${d.hb ? `(${d.hbRows.length} 行)` : '(不存在)'} · 对账 ${d.reconUrl ? esc(rel(d.reconUrl)) : '无 recon 文件'} · 检查于 ${chk}</div>`;
    el.innerHTML = h;
  }
}
function renderFeed() {
  const ul = document.getElementById('feed'), f = STATE.feed, sys = [];
  for (const id of DISTRICTS) { const d = STATE[id], n = CFG.districts[id].name; if (!d.trades) sys.push(`${n}: ${short(d.src.tradeLog)} 尚不存在 — ${CFG.districts[id].placeholderLabel}`); else if (!d.tradeRows.length) sys.push(`${n}: ${short(d.src.tradeLog)} 暂无记录（0 行）`); if (d.hb && !d.hbRows.length) sys.push(`${n}: ${short(d.src.heartbeat)} 暂无心跳（0 行）`); if (d.visuals && d.riskHalt) sys.push(`${n}: 风控暂停 — ${d.riskHaltReason}（仅用户可恢复）`); if (d.visuals && d.dailyHalt) sys.push(`${n}: 今日休市 — ${d.dailyHaltReason}`); }
  const us = STATE.us; if (us.signal) { const k = Object.keys(us.signal.signals || {})[0]; if (k) sys.push(`策略官研究信号（回测输出，非交易）as_of ${us.signal.as_of}: ${k} → ${Object.entries(us.signal.signals[k].weights || {}).map(([a, w]) => `${a} ${(w * 100).toFixed(0)}%`).join(' ')}`); }
  document.getElementById('feedMeta').textContent = `${f.length} 条日志事件 · 检查于 ${hhmm(STATE.checkedAt)}`;
  ul.innerHTML = sys.map(s => `<li><span class="t">[系统]</span>${esc(s)}</li>`).join('') +
    (f.length ? f.slice(0, 200).map((e, i) => `<li class="ev" data-i="${i}"><span class="t">${esc(e.ts || '—')}</span><span class="d">${esc(e.dn)}</span>${e.isMeet ? '🏛 ' : ''}${e.isTrade ? '💱 ' : ''}${esc(e.text)}</li>`).join('') : '<li class="muted">暂无真实日志事件 — 角色在小镇闲逛</li>');
  ul.querySelectorAll('li.ev').forEach(li => li.onclick = () => { const e = STATE.feed[+li.dataset.i], d = STATE[e.district]; if (!d.visuals) return; if (e.isMeet) startMeeting(e, null); else if (e.isTrade && gateOK(d, e.row)) startTradeRun(e); });
}
/* ---------- 建筑信息卡（数据来自 data/town-cards.json，发布时生成；缺数据显示「暂无」） ---------- */
let CARDS = null, HOVER = null;
async function loadCards() { if (CFG.cards) { const c = await fetchJSON(CFG.cards.src); if (c) CARDS = c; } }
const NA = '暂无';
const bjNow = () => new Date(Date.now() + 8 * 3600e3); // 用 UTC 字段读北京时间
function nextRun(sc) {
  if (!sc) return NA;
  const [hh, mm] = sc.time.split(':').map(Number), n = bjNow();
  for (let add = 0; add < 8; add++) {
    const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + add, hh, mm));
    const wd = d.getUTCDay(); if (sc.days === 'weekdays' && (wd === 0 || wd === 6)) continue;
    if (d > n) { const mins = Math.round((d - n) / 60000), dayL = add === 0 ? '今天' : add === 1 ? '明天' : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
      return `${dayL} ${sc.time} 北京（${mins >= 60 ? Math.floor(mins / 60) + ' 小时 ' : ''}${mins % 60} 分钟后）${sc.days === 'weekdays' ? ' · 美股交易日' : ' · 每天'}`; }
  }
  return NA;
}
const bjT = s => { if (!s) return NA; return String(s).replace('T', ' ').replace(/\+08:00$/, '') + ' 北京'; };
const cRow = (k, v, cls = '') => `<div class="cr ${cls}"><span>${k}</span><b>${v == null || v === '' ? NA : v}</b></div>`;
const money = v => v == null ? NA : '$' + fmt(v, 2);
function goalBar(C) {
  const g = C?.goal, e = C?.equity;
  if (!g || !g.base || !g.target) return cRow('翻倍目标', NA);
  const p = e && e.goalProgressPct != null ? Math.max(0, Math.min(100, e.goalProgressPct)) : null;
  return `<div class="goal"><div class="gl"><span>翻倍目标（${esc(g.deadline || '')}）</span><b>${money(g.base)} → ${money(g.target)}</b></div>
    <div class="gbar"><i style="width:${p == null ? 0 : Math.max(1, p)}%"></i></div>
    <div class="gs">当前 ${e && e.equity != null ? money(e.equity) : NA} · 进度 ${p == null ? NA : fmt(e.goalProgressPct, 2) + '%'} · 还差 ${e && e.toTarget != null ? money(e.toTarget) : NA}${e && e.ts ? ` · ${esc(bjT(e.ts))}` : ''}</div></div>`;
}
function rulesBlock(R) {
  if (!R || !R.version) return cRow('风控限额', NA);
  const v = x => x == null ? NA : x + '%';
  return `<div class="csec">现行风控限额（RULES.md ${esc(R.version)}${R.effective ? ' · ' + esc(R.effective) + '生效' : ''}）</div><div class="rules">
    <div><span>单笔最大亏损</span><b>${v(R.perTradePct)}</b></div><div><span>单只标的上限</span><b>${v(R.perAssetPct)}</b></div>
    <div><span>加密合计上限</span><b>${v(R.cryptoPct)}</b></div><div><span>单日停手线</span><b>${v(R.dailyStopPct)}</b></div>
    <div><span>回撤全停线</span><b>${v(R.ddHaltPct)}</b></div><div><span>交易类型</span><b>${R.spotOnly ? '只做现货' : NA}</b></div></div>`;
}
function decLine(d) { return d ? `<b class="ev">${esc(d.eventZh || d.event || '')}</b> ${esc(d.signal || '')}<br><span class="dt">${esc(d.detail || '')}</span><br><small>${esc(bjT(d.ts))} · ${esc(d.by || '')}</small>` : NA; }
function rantFor(bot) { const l = rantsOf(bot); if (!l.length) return ''; const x = l[Math.floor(Math.random() * l.length)]; return `<div class="crant"><span>☕ 摸鱼角</span>“${esc(x.text)}”</div>`; }
function showDetail(k) {
  const C = CARDS, names = { hub: 'Trading Hub 交易所', warroom: 'WAR ROOM 会议室', strategist: '策略官 STRATEGIST', risk: '风控官 RISK', trader: '交易员 TRADER', data: '数据官 DATA' };
  const colors = { hub: '#d9a21b', warroom: '#9aa0b4', strategist: '#3f74c8', risk: '#d24a4a', trader: '#e8862a', data: '#7a4ac8' };
  const role = C?.roles?.[k] || '';
  let h = '';
  if (!C) h = cRow('信息卡数据', NA + '（data/town-cards.json 未生成）');
  else if (k === 'strategist') {
    const s = C.signal;
    h += cRow('当前状态', s ? (s.pendingRisk ? '<span class="warnc">最新信号待风控官审核</span>' : '已出信号') : NA);
    h += `<div class="csec">最新信号</div>` + (s ? `<div class="cbox"><b>${esc(s.title)}</b><br><small>${esc(s.file)} · 文件更新 ${esc(s.mtime)} 北京</small>${s.context ? `<p>${esc(s.context)}</p>` : ''}${s.firstSteps?.length ? '<ol>' + s.firstSteps.map(x => `<li>${esc(x)}</li>`).join('') + '</ol>' : ''}${s.sections?.length ? `<small>章节：${s.sections.map(esc).join(' / ')}</small>` : ''}</div>` : `<div class="cbox">${NA}</div>`);
    h += cRow('下次例行', nextRun(C.schedule?.strategist) + (C.schedule?.strategist ? ` · ${esc(C.schedule.strategist.what)}` : ''));
    h += rantFor('strategist');
  } else if (k === 'risk') {
    const dd = C.equity?.drawdownPct, tier = dd == null ? null : [...CFG.risk.drawdownTiers].reverse().find(t => dd >= t.min);
    h += cRow('当前状态', haltedAny() ? '<span class="warnc">风控暂停中（仅用户可恢复）</span>' : '自动审核中');
    h += cRow('当前回撤', dd == null ? NA : `${fmt(dd, 2)}% <span style="color:${tier.color}">● ${esc(tier.label)}</span>`);
    h += `<div class="csec">最近一次审核</div><div class="cbox">${decLine(C.riskLast)}</div>`;
    h += rulesBlock(C.rules);
    h += cRow('下次运行', '随信号触发（无固定时间）');
    h += rantFor('risk');
  } else if (k === 'trader') {
    const f = C.fills?.length ? C.fills[C.fills.length - 1] : null;
    h += cRow('当前状态', haltedAny() ? '<span class="warnc">风控暂停：留守楼内</span>' : fx.trade ? '正在 Hub 成交' : '待命');
    h += cRow('最新成交', f ? `${esc(f.market)} ${esc(f.side)} ${esc(f.ticker)} ${esc(f.qty)} @ ${esc(f.price)}${f.stop ? ` · 止损 ${esc(f.stop)}` : ''} · ${esc(f.mode || '')}<br><small>${esc(bjT(f.ts))}</small>` : '暂无成交（成交记录 0 笔）');
    h += `<div class="csec">最近动作</div><div class="cbox">${decLine(C.traderLast)}</div>`;
    h += cRow('下次执行', nextRun(C.schedule?.trader) + (C.schedule?.trader ? ` · ${esc(C.schedule.trader.what)}` : ''));
    h += rantFor('trader');
  } else if (k === 'data') {
    const e = C.equity || {};
    h += cRow('当前状态', dataStale() ? '<span class="warnc">心跳缺失/过期（数据灯灰）</span>' : '数据新鲜');
    h += cRow('最新权益', e.equity != null ? `${money(e.equity)}<br><small>${esc(bjT(e.ts))}</small>` : NA, 'big');
    h += cRow('资产最高点', money(e.hwm)) + cRow('当前回撤', e.drawdownPct == null ? NA : fmt(e.drawdownPct, 2) + '%') + cRow('今日盈亏', e.dayPnlPct == null ? NA : fmt(e.dayPnlPct, 2) + '%');
    h += goalBar(C);
    if (e.source) h += `<div class="cnote">口径：${esc(e.source)}（${esc(e.file || 'data/equity-hwm.csv')}）</div>`;
    h += cRow('下次例行', nextRun(C.schedule?.data) + (C.schedule?.data ? ` · ${esc(C.schedule.data.what)}` : ''));
    h += rantFor('data');
  } else if (k === 'hub') {
    h += cRow('当前状态', haltedAny() ? '<span class="warnc">路障：风控全停</span>' : dailyAny() ? '<span class="warnc">今日休市</span>' : '开放（本页只读，不连接交易所）');
    h += `<div class="csec">持仓（最新快照${C.holdingsAt ? ' · ' + esc(hhmm(new Date(C.holdingsAt))) + ' 北京' : ''}）</div>`;
    h += C.holdings?.length ? `<table class="ctab"><tr><th>资产</th><th>账户</th><th>数量</th></tr>${C.holdings.map(x => `<tr><td>${esc(x.asset)}${x.ticker ? ` <small>${esc(x.ticker)}</small>` : ''}</td><td>${esc(x.wallet)}</td><td>${fmt(x.qty, x.qty < 1 ? 6 : 4)}</td></tr>`).join('')}</table>` : `<div class="cbox">${NA}</div>`;
    h += rulesBlock(C.rules) + goalBar(C);
    h += cRow('成交笔数', C.fillCount == null ? NA : `${C.fillCount}${C.fillsToday != null && C.fillsTodayCap ? `（今日 ${C.fillsToday}/${C.fillsTodayCap}）` : ''}`);
    h += rantFor('designer');
  } else if (k === 'warroom') {
    h += cRow('当前状态', fx.meeting ? '审议中' : '空闲');
    h += `<div class="csec">最近一次决策</div><div class="cbox">${decLine(C.decisionLast)}</div>`;
    h += cRow('最新提案', C.signal ? esc(C.signal.title) : NA);
    h += cRow('Atlas 下发目标', nextRun(C.schedule?.atlas));
    h += rantFor('atlas');
  }
  const m = document.getElementById('card');
  m.querySelector('.cbody').innerHTML = `<div class="chead" style="--c:${colors[k]}"><h2>${esc(names[k])}</h2><div class="crole">${esc(role)}</div></div>${h}<div class="cfoot">数据生成于 ${C ? esc(bjT(C.generated_at.slice(0, 16))) : NA} · 只显示真实记录，缺数据写「暂无」</div>`;
  m.hidden = false; document.body.classList.add('cardopen'); m.querySelector('.cclose').focus({ preventScroll: true });
}
function closeCard() { const m = document.getElementById('card'); m.hidden = true; document.body.classList.remove('cardopen'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
function hitBuilding(ev) {
  const r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width / S, y = (ev.clientY - r.top) * H / r.height / S;
  const ks = Object.keys(CFG.layout.buildings).sort((a, b) => CFG.layout.buildings[b].bottom - CFG.layout.buildings[a].bottom);
  for (const k of ks) { const b = B(k); if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { k, x, y }; }
  return { k: null, x, y };
}
cv.addEventListener('mousemove', ev => { if (!CFG) return; const h = hitBuilding(ev), sg = CFG.rants?.sign || [322, 304]; HOVER = h.k; cv.style.cursor = h.k || (Math.abs(h.x - sg[0]) < 24 && Math.abs(h.y - sg[1]) < 16) ? 'pointer' : 'default'; });
cv.addEventListener('mouseleave', () => { HOVER = null; });
function drawHover(t) {
  if (!HOVER) return; const b = B(HOVER), a = 0.6 + 0.4 * Math.sin(t * 6);
  ctx.save(); ctx.strokeStyle = `rgba(245,212,74,${a})`; ctx.lineWidth = 4; ctx.strokeRect(X(b.x) - 4, X(b.y) - 4, X(b.w) + 8, X(b.h) + 8); ctx.restore();
  text('点击查看信息卡', X(b.x + b.w / 2), X(b.y) - 14, '#f5d44a');
}
cv.addEventListener('click', ev => {
  const h = hitBuilding(ev), sg = CFG.rants?.sign || [322, 304];
  if (!h.k && Math.abs(h.x - sg[0]) < 24 && Math.abs(h.y - sg[1]) < 16) return document.getElementById('rantwall').scrollIntoView({ behavior: 'smooth' });
  if (h.k) showDetail(h.k);
});
(async function main() {
  CFG = await fetchJSON('town-config.json');
  if (!CFG) { document.body.insertAdjacentHTML('afterbegin', '<p style="color:red">town-config.json 加载失败</p>'); return; }
  S = CFG.layout.scale || 2;
  document.getElementById('refreshSec').textContent = CFG.refreshSeconds;
  const tg = document.getElementById('srcToggle'), setSrc = on => { document.body.classList.toggle('showsrc', on); tg.textContent = on ? '隐藏数据来源' : '显示数据来源'; try { localStorage.setItem('town.showsrc', on ? '1' : '0'); } catch {} };
  let on0 = false; try { on0 = localStorage.getItem('town.showsrc') === '1'; } catch {}
  setSrc(on0); tg.onclick = () => setSrc(!document.body.classList.contains('showsrc'));
  document.getElementById('card').addEventListener('click', e => { if (e.target.id === 'card' || e.target.closest('.cclose')) closeCard(); });
  await refreshFileList(); await loadAssets(); makeChars(); await refresh();
  setInterval(refresh, CFG.refreshSeconds * 1000);
  window.__townReady = true;
  requestAnimationFrame(frame);
})();
