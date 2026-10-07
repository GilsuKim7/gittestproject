'use strict';
const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('../public/lib/xlsx.full.min.js');
const { open } = require('../db');
const { createApp } = require('../server');

let server, base, repo;
test.before(async () => {
  repo = open(':memory:');
  server = createApp(repo);
  await new Promise(r => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
test.after(() => { server.close(); repo.close(); });

const NEW = { bizCode: '111', fund: '주택사업특별회계', applyDate: '2026-10-07', applicant: '김철수',
  amount: '1,234,567', period: '3', area: '반포1', loanType: '담보부융자' };
const post = body => fetch(`${base}/api/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('기본 데이터가 조회된다', async () => {
  const list = await (await fetch(`${base}/api/applications`)).json();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].id, 'SN-2025-000001');
  assert.strictEqual(list[0].amount, 900000000);
});

test('등록 → 수정 → 조회 조건 → 삭제', async () => {
  const res = await post(NEW);
  assert.strictEqual(res.status, 201);
  const rec = await res.json();
  assert.strictEqual(rec.id, 'SN-2026-000001');
  assert.strictEqual(rec.amount, 1234567);
  assert.strictEqual((await (await post(NEW)).json()).id, 'SN-2026-000002');

  const upd = await fetch(`${base}/api/applications/${rec.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...NEW, applicant: '박영희' }) });
  assert.strictEqual((await upd.json()).applicant, '박영희');

  const q = async s => (await (await fetch(`${base}/api/applications?${s}`)).json()).map(r => r.id);
  assert.deepStrictEqual(await q('applicant=' + encodeURIComponent('박')), ['SN-2026-000001']);
  assert.deepStrictEqual(await q('year=2026&seq=2'), ['SN-2026-000002']);
  assert.deepStrictEqual(await q('from=2025-01-01&to=2025-12-31'), []);
  assert.deepStrictEqual(await q('area=' + encodeURIComponent('개포')), ['SN-2025-000001']);

  assert.strictEqual((await fetch(`${base}/api/applications/${rec.id}`, { method: 'DELETE' })).status, 204);
  assert.strictEqual((await fetch(`${base}/api/applications/${rec.id}`)).status, 404);
});

test('필수값 누락 시 400', async () => {
  const res = await post({ ...NEW, applicant: '' });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /융자신청인/);
});

test('첨부파일 업로드/다운로드', async () => {
  const name = '신청서.pdf';
  const put = await fetch(`${base}/api/applications/SN-2025-000001/file`, { method: 'PUT',
    headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(name) }, body: Buffer.from('hello') });
  assert.strictEqual((await put.json()).fileName, name);
  const get = await fetch(`${base}/api/applications/SN-2025-000001/file`);
  assert.strictEqual(await get.text(), 'hello');
  assert.match(get.headers.get('content-disposition'), /filename\*=UTF-8''/);
});

test('엑셀 다운로드는 조회 조건을 반영한다', async () => {
  const res = await fetch(`${base}/api/applications/export.xlsx?area=` + encodeURIComponent('개포'));
  assert.strictEqual(res.status, 200);
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['신청내역'], { header: 1 });
  assert.strictEqual(rows[0][1], '융자취급신청번호');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1][12], 900000000);
});

test('정적 파일 경로 이탈 차단', async () => {
  const res = await fetch(`${base}/..%2fdb.js`);
  assert.notStrictEqual(res.status, 200);
});
