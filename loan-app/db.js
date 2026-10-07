'use strict';
// SQLite 저장소 (Node.js 내장 node:sqlite 사용, 외부 패키지 없음)
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// 화면 필드명 ↔ DB 컬럼명
const FIELDS = {
  id: 'apply_no', decisionNo: 'decision_no', lender: 'lender', reqType: 'req_type',
  fund: 'fund', loanType: 'loan_type', area: 'area', applicant: 'applicant', applicantCode: 'applicant_code',
  ceo: 'ceo', bizFrom: 'biz_from', bizTo: 'biz_to', applyDate: 'apply_date', amount: 'amount',
  period: 'period', loanNo: 'loan_no', splitNo: 'split_no', bizCode: 'biz_code', bizName: 'biz_name',
  bizZip: 'biz_zip', bizAddr1: 'biz_addr1', bizAddr2: 'biz_addr2', zip: 'zip', addr1: 'addr1', addr2: 'addr2',
  tel: 'tel', govAmt: 'gov_amt', paidAmt: 'paid_amt', buildCost: 'build_cost', account: 'account', bank: 'bank',
  fileName: 'file_name', createdAt: 'created_at', updatedAt: 'updated_at'
};
const NUMERIC = ['amount', 'govAmt', 'paidAmt', 'period'];
// 클라이언트가 수정할 수 있는 필드 (번호·첨부·시각은 서버가 관리)
const EDITABLE = Object.keys(FIELDS).filter(k => !['id', 'fileName', 'createdAt', 'updatedAt'].includes(k));
const REQUIRED = [['bizCode', '사업장'], ['fund', '운용기금'], ['applyDate', '융자취급신청일자'],
  ['applicant', '융자신청인'], ['amount', '융자취급신청금액'], ['period', '융자기간']];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS loan_application (
  apply_no       TEXT PRIMARY KEY,           -- 융자취급신청번호 SN-YYYY-NNNNNN
  decision_no    TEXT NOT NULL DEFAULT '',   -- 융자지원결정번호
  lender         TEXT NOT NULL DEFAULT '',   -- 대여기관
  req_type       TEXT NOT NULL DEFAULT '',   -- 신청구분
  fund           TEXT NOT NULL,              -- 운용기금
  loan_type      TEXT NOT NULL DEFAULT '',   -- 융자방식
  area           TEXT NOT NULL DEFAULT '',   -- 구역명
  applicant      TEXT NOT NULL,              -- 융자신청인
  applicant_code TEXT NOT NULL DEFAULT '',
  ceo            TEXT NOT NULL DEFAULT '',   -- 대표자
  biz_from       TEXT NOT NULL DEFAULT '',   -- 사업시행기간 시작
  biz_to         TEXT NOT NULL DEFAULT '',   -- 사업시행기간 종료
  apply_date     TEXT NOT NULL,              -- 융자취급신청일자
  amount         INTEGER NOT NULL,           -- 융자취급신청금액(원)
  period         INTEGER NOT NULL,           -- 융자기간(년)
  loan_no        TEXT NOT NULL DEFAULT '',   -- 융자번호
  split_no       TEXT NOT NULL DEFAULT '',   -- 분할차수
  biz_code       TEXT NOT NULL,              -- 사업장 코드
  biz_name       TEXT NOT NULL DEFAULT '',
  biz_zip        TEXT NOT NULL DEFAULT '',
  biz_addr1      TEXT NOT NULL DEFAULT '',
  biz_addr2      TEXT NOT NULL DEFAULT '',
  zip            TEXT NOT NULL DEFAULT '',   -- 신청자 주소
  addr1          TEXT NOT NULL DEFAULT '',
  addr2          TEXT NOT NULL DEFAULT '',
  tel            TEXT NOT NULL DEFAULT '',
  gov_amt        INTEGER,                    -- 지방자치단체승인금액
  paid_amt       INTEGER,                    -- 이미 지급받은 융자총액
  build_cost     TEXT NOT NULL DEFAULT '',   -- 건축공사비여부
  account        TEXT NOT NULL DEFAULT '',   -- 계좌번호
  bank           TEXT NOT NULL DEFAULT '',   -- 은행
  file_name      TEXT NOT NULL DEFAULT '',   -- 첨부파일명
  created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS ix_loan_apply_date ON loan_application(apply_date);
CREATE TABLE IF NOT EXISTS loan_attachment (
  apply_no  TEXT PRIMARY KEY REFERENCES loan_application(apply_no) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime      TEXT NOT NULL DEFAULT 'application/octet-stream',
  content   BLOB NOT NULL
);`;

const SEED = {
  id: 'SN-2025-000001', decisionNo: '2025-00001', lender: '서울특별시', reqType: '추진위원회',
  fund: '주택사업특별회계', loanType: '신용융자', area: '개포우성4', applicant: '홍길동', applicantCode: '00000001',
  ceo: '이기자', bizFrom: '2025-01-02', bizTo: '2028-01-02', applyDate: '2024-10-01', amount: 900000000,
  period: 5, bizCode: '029466', bizName: '대치4동추진위원회', bizZip: '5526', bizAddr1: '강릉 강릉시',
  bizAddr2: '11(홍제동)', zip: '5526', addr1: '강릉 강릉시', addr2: '11(홍제동)', tel: '02-111-2222',
  govAmt: 900000000, paidAmt: 0, buildCost: '포함', account: '111-22-3333', bank: '기업은행'
};

class ValidationError extends Error {}

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  if (db.prepare('SELECT COUNT(*) AS n FROM loan_application').get().n === 0) insertRow(db, SEED);
  return makeRepo(db);
}

function toRecord(row) {
  if (!row) return null;
  const r = {};
  for (const [k, col] of Object.entries(FIELDS)) r[k] = row[col] == null ? '' : row[col];
  return r;
}

function insertRow(db, rec) {
  const keys = Object.keys(rec).filter(k => FIELDS[k]);
  db.prepare(`INSERT INTO loan_application (${keys.map(k => FIELDS[k]).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .run(...keys.map(k => rec[k]));
}

// 입력값 정리 + 검증
function clean(input) {
  const out = {};
  for (const k of EDITABLE) {
    if (!(k in input)) continue;
    let v = input[k] == null ? '' : String(input[k]).trim();
    if (NUMERIC.includes(k)) {
      v = v.replace(/[^\d]/g, '');
      v = v === '' ? null : Number(v);
      if (v !== null && !Number.isSafeInteger(v)) throw new ValidationError('숫자 값이 너무 큽니다.');
    } else if (v.length > 200) {
      throw new ValidationError('입력값이 너무 깁니다.');
    }
    out[k] = v;
  }
  for (const [k, label] of REQUIRED) {
    if (out[k] === '' || out[k] == null) throw new ValidationError(label + '을(를) 입력하세요.');
  }
  for (const k of ['applyDate', 'bizFrom', 'bizTo']) {
    if (out[k] && !/^\d{4}-\d{2}-\d{2}$/.test(out[k])) throw new ValidationError('날짜 형식이 올바르지 않습니다.');
  }
  if (out.bizFrom && out.bizTo && out.bizFrom > out.bizTo) throw new ValidationError('사업시행기간을 확인하세요.');
  return out;
}

function makeRepo(db) {
  const tx = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  return {
    search(q = {}) {
      const where = [], args = [];
      if (q.year) { where.push('apply_no LIKE ?'); args.push(`SN-${q.year}-%`); }
      if (q.seq) {
        const n = q.seq.replace(/\D/g, '');
        if (n) { where.push("CAST(substr(apply_no, 9) AS INTEGER) = ?"); args.push(Number(n)); }
      }
      if (q.area) { where.push('area LIKE ?'); args.push(`%${q.area}%`); }
      if (q.applicant) { where.push('applicant LIKE ?'); args.push(`%${q.applicant}%`); }
      if (q.from) { where.push('apply_date >= ?'); args.push(q.from); }
      if (q.to) { where.push('apply_date <= ?'); args.push(q.to); }
      const sql = 'SELECT * FROM loan_application' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY apply_no';
      return db.prepare(sql).all(...args).map(toRecord);
    },

    get(id) {
      return toRecord(db.prepare('SELECT * FROM loan_application WHERE apply_no = ?').get(id));
    },

    create(input) {
      const rec = Object.assign({ lender: '서울특별시', reqType: '추진위원회' }, clean(input));
      return tx(() => {
        const year = (rec.applyDate || '').slice(0, 4) || String(new Date().getFullYear());
        const { m } = db.prepare("SELECT MAX(CAST(substr(apply_no, 9) AS INTEGER)) AS m FROM loan_application WHERE apply_no LIKE ?")
          .get(`SN-${year}-%`);
        rec.id = `SN-${year}-${String((m || 0) + 1).padStart(6, '0')}`;
        insertRow(db, rec);
        return this.get(rec.id);
      });
    },

    update(id, input) {
      const rec = clean(input);
      const keys = Object.keys(rec);
      const res = db.prepare(`UPDATE loan_application SET ${keys.map(k => FIELDS[k] + ' = ?').join(', ')},
        updated_at = datetime('now', 'localtime') WHERE apply_no = ?`).run(...keys.map(k => rec[k]), id);
      return res.changes ? this.get(id) : null;
    },

    remove(id) {
      return db.prepare('DELETE FROM loan_application WHERE apply_no = ?').run(id).changes > 0;
    },

    saveFile(id, fileName, mime, content) {
      return tx(() => {
        if (!this.get(id)) return false;
        db.prepare(`INSERT INTO loan_attachment (apply_no, file_name, mime, content) VALUES (?, ?, ?, ?)
          ON CONFLICT(apply_no) DO UPDATE SET file_name = excluded.file_name, mime = excluded.mime, content = excluded.content`)
          .run(id, fileName, mime, content);
        db.prepare("UPDATE loan_application SET file_name = ?, updated_at = datetime('now', 'localtime') WHERE apply_no = ?").run(fileName, id);
        return true;
      });
    },

    getFile(id) {
      return db.prepare('SELECT file_name AS fileName, mime, content FROM loan_attachment WHERE apply_no = ?').get(id) || null;
    },

    close() { db.close(); }
  };
}

module.exports = { open, ValidationError };
