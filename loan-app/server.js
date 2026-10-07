'use strict';
// 융자취급신청관리 API + 정적 파일 서버 (외부 패키지 없음)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('./public/lib/xlsx.full.min.js');
const { open, ValidationError } = require('./db');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_JSON = 1024 * 1024;          // 1MB
const MAX_FILE = 20 * 1024 * 1024;     // 첨부 20MB
const ID_RE = /^SN-\d{4}-\d{6}$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}
function json(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, '요청 크기가 너무 큽니다.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  try { return JSON.parse((await readBody(req, MAX_JSON)).toString('utf8') || '{}'); }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, '잘못된 JSON 형식입니다.'); }
}
function attachment(name) {
  return `attachment; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const EXCEL_COLUMNS = [
  ['융자취급신청번호', r => r.id], ['융자지원결정번호', r => r.decisionNo], ['대여기관', r => r.lender],
  ['신청구분', r => r.reqType], ['운용기금명', r => r.fund], ['융자방식', r => r.loanType], ['구역명', r => r.area],
  ['신청인', r => r.applicant], ['대표자', r => r.ceo],
  ['사업기간', r => (r.bizFrom || r.bizTo) ? `${r.bizFrom.replace(/-/g, '.')} ~ ${r.bizTo.replace(/-/g, '.')}` : ''],
  ['신청일자', r => r.applyDate], ['신청금액', r => r.amount === '' ? '' : Number(r.amount)],
  ['융자기간', r => r.period === '' ? '' : r.period + '년'], ['융자번호', r => r.loanNo], ['분할차수', r => r.splitNo]
];
function buildExcel(rows) {
  const header = ['순번', ...EXCEL_COLUMNS.map(c => c[0])];
  const body = rows.map((r, i) => [i + 1, ...EXCEL_COLUMNS.map(c => c[1](r))]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = header.map(h => ({ wch: h === '사업기간' ? 24 : Math.max(10, h.length * 2 + 2) }));
  const amtCol = header.indexOf('신청금액');
  for (let i = 1; i <= body.length; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: i, c: amtCol })];
    if (cell && cell.t === 'n') cell.z = '#,##0';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '신청내역');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function searchParams(url) {
  const p = url.searchParams, q = {};
  for (const k of ['year', 'seq', 'area', 'applicant', 'from', 'to']) {
    const v = (p.get(k) || '').trim();
    if (v) q[k] = v;
  }
  return q;
}

function createApp(repo) {
  async function api(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); // ['api','applications',id?,'file'?]
    if (parts[1] !== 'applications') throw new HttpError(404, '없는 경로입니다.');
    const [, , id, sub] = parts;

    if (!id) {
      if (req.method === 'GET') return json(res, 200, repo.search(searchParams(url)));
      if (req.method === 'POST') return json(res, 201, repo.create(await readJson(req)));
      throw new HttpError(405, '허용되지 않는 메서드입니다.');
    }
    if (id === 'export.xlsx' && !sub && req.method === 'GET') {
      const name = `융자취급신청목록_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
      return send(res, 200, buildExcel(repo.search(searchParams(url))), {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachment(name)
      });
    }
    if (!ID_RE.test(id) || parts.length > 4 || (sub && sub !== 'file')) throw new HttpError(404, '없는 경로입니다.');

    if (sub === 'file') {
      if (req.method === 'GET') {
        const f = repo.getFile(id);
        if (!f) throw new HttpError(404, '첨부파일이 없습니다.');
        return send(res, 200, Buffer.from(f.content), { 'Content-Type': f.mime, 'Content-Disposition': attachment(f.fileName) });
      }
      if (req.method === 'PUT') {
        let name = '';
        try { name = decodeURIComponent(req.headers['x-file-name'] || ''); } catch (e) { /* 아래에서 처리 */ }
        name = path.basename(name).slice(0, 200);
        if (!name) throw new HttpError(400, '파일명이 없습니다.');
        const content = await readBody(req, MAX_FILE);
        const mime = String(req.headers['content-type'] || 'application/octet-stream').slice(0, 100);
        if (!repo.saveFile(id, name, mime, content)) throw new HttpError(404, '신청 건이 없습니다.');
        return json(res, 200, repo.get(id));
      }
      throw new HttpError(405, '허용되지 않는 메서드입니다.');
    }

    if (req.method === 'GET') {
      const r = repo.get(id);
      return r ? json(res, 200, r) : json(res, 404, { error: '신청 건이 없습니다.' });
    }
    if (req.method === 'PUT') {
      const r = repo.update(id, await readJson(req));
      return r ? json(res, 200, r) : json(res, 404, { error: '신청 건이 없습니다.' });
    }
    if (req.method === 'DELETE') {
      return repo.remove(id) ? send(res, 204, '') : json(res, 404, { error: '신청 건이 없습니다.' });
    }
    throw new HttpError(405, '허용되지 않는 메서드입니다.');
  }

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '');
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'Not Found');
      send(res, 200, buf, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    });
  }

  return http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { return send(res, 400, ''); }
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof ValidationError) return json(res, 400, { error: e.message });
      if (e instanceof HttpError) return json(res, e.status, { error: e.message });
      if (e instanceof URIError) return json(res, 400, { error: '잘못된 요청입니다.' });
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: '서버 오류가 발생했습니다.' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'loan.db');
  const repo = open(dbFile);
  createApp(repo).listen(port, () => {
    console.log(`융자취급신청관리 서버: http://localhost:${port}  (DB: ${dbFile})`);
  });
}

module.exports = { createApp };
