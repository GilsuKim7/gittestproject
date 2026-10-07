// 융자취급신청관리 - 데이터는 브라우저 localStorage에 저장됩니다.
(function () {
  'use strict';

  var STORE_KEY = 'loanApplications';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form');
  var selectedId = null;

  var SEED = [{
    id: 'SN-2025-000001', decisionNo: '2025-00001', lender: '서울특별시', reqType: '추진위원회',
    fund: '주택사업특별회계', loanType: '신용융자', area: '개포우성4', applicant: '홍길동', applicantCode: '00000001',
    ceo: '이기자', bizFrom: '2025-01-02', bizTo: '2028-01-02', applyDate: '2024-10-01', amount: '900000000',
    period: '5', loanNo: '', splitNo: '', bizCode: '029466', bizName: '대치4동추진위원회', bizZip: '5526',
    bizAddr1: '강릉 강릉시', bizAddr2: '11(홍제동)', zip: '5526', addr1: '강릉 강릉시', addr2: '11(홍제동)',
    tel: '02-111-2222', govAmt: '900000000', paidAmt: '0', buildCost: '포함', account: '111-22-3333',
    bank: '기업은행', fileName: ''
  }];

  // ---------- 저장소 ----------
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 저장소 사용 불가 시 기본 데이터 사용 */ }
    return SEED.slice();
  }
  function save(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { toast('저장소에 기록할 수 없습니다.'); }
  }
  var data = load();

  // ---------- 유틸 ----------
  function digits(v) { return String(v == null ? '' : v).replace(/[^\d]/g, ''); }
  function comma(v) { var d = digits(v); return d ? Number(d).toLocaleString('ko-KR') : ''; }
  function dot(d) { return d ? d.replace(/-/g, '.') : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }
  function nextId() {
    var year = String(new Date().getFullYear()), max = 0;
    data.forEach(function (r) {
      var m = /^SN-(\d{4})-(\d{6})$/.exec(r.id);
      if (m && m[1] === year) max = Math.max(max, Number(m[2]));
    });
    return 'SN-' + year + '-' + String(max + 1).padStart(6, '0');
  }
  function bizPeriod(r) { return r.bizFrom || r.bizTo ? dot(r.bizFrom) + ' ~ ' + dot(r.bizTo) : ''; }

  // ---------- 조회 ----------
  function filtered() {
    var y = $('sYear').value.trim(), s = $('sSeq').value.trim();
    var area = $('sArea').value.trim(), ap = $('sApplicant').value.trim();
    var from = $('sFrom').value, to = $('sTo').value;
    return data.filter(function (r) {
      var parts = r.id.split('-');
      if (y && parts[1] !== y) return false;
      if (s && parts[2].indexOf(s) === -1 && Number(parts[2]) !== Number(s)) return false;
      if (area && (r.area || '').indexOf(area) === -1) return false;
      if (ap && (r.applicant || '').indexOf(ap) === -1) return false;
      if (from && (!r.applyDate || r.applyDate < from)) return false;
      if (to && (!r.applyDate || r.applyDate > to)) return false;
      return true;
    }).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  }

  var COLUMNS = [
    ['융자취급신청번호', function (r) { return r.id; }],
    ['융자지원결정번호', function (r) { return r.decisionNo; }],
    ['대여기관', function (r) { return r.lender; }],
    ['신청구분', function (r) { return r.reqType; }],
    ['운용기금명', function (r) { return r.fund; }],
    ['융자방식', function (r) { return r.loanType; }],
    ['구역명', function (r) { return r.area; }],
    ['신청인', function (r) { return r.applicant; }],
    ['대표자', function (r) { return r.ceo; }],
    ['사업기간', bizPeriod],
    ['신청일자', function (r) { return r.applyDate; }],
    ['신청금액', function (r) { return comma(r.amount); }, 'r'],
    ['융자기간', function (r) { return r.period ? r.period + '년' : ''; }],
    ['융자번호', function (r) { return r.loanNo; }],
    ['분할차수', function (r) { return r.splitNo; }]
  ];

  var current = [];
  function search() {
    current = filtered();
    $('totalCnt').textContent = current.length;
    var tbody = $('grid').tBodies[0];
    if (!current.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="' + (COLUMNS.length + 1) + '">조회된 데이터가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = current.map(function (r, i) {
      return '<tr data-id="' + esc(r.id) + '"' + (r.id === selectedId ? ' class="sel"' : '') + '><td>' + (i + 1) + '</td>' +
        COLUMNS.map(function (c) { return '<td' + (c[2] ? ' class="' + c[2] + '"' : '') + '>' + esc(c[1](r)) + '</td>'; }).join('') + '</tr>';
    }).join('');
  }

  $('grid').tBodies[0].addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    var rec = data.find(function (r) { return r.id === tr.dataset.id; });
    if (rec) { fillForm(rec); search(); }
  });

  // ---------- 상세 폼 ----------
  var MONEY = ['amount', 'govAmt', 'paidAmt'];
  function fillForm(rec) {
    selectedId = rec ? rec.id : null;
    form.reset();
    $('fileName').textContent = '';
    if (!rec) { form.id.value = ''; return; }
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'file') return;
      var v = rec[el.name] == null ? '' : rec[el.name];
      if (el.type === 'radio') el.checked = el.value === v;
      else el.value = MONEY.indexOf(el.name) > -1 ? comma(v) : v;
    });
    $('fileName').textContent = rec.fileName ? '첨부: ' + rec.fileName : '';
  }

  MONEY.concat(['period']).forEach(function (n) {
    form[n].addEventListener('input', function () {
      this.value = n === 'period' ? digits(this.value) : comma(this.value);
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form;
    var required = [['bizCode', '사업장'], ['fund', '운용기금'], ['applyDate', '융자취급신청일자'],
      ['applicant', '융자신청인'], ['amount', '융자취급신청금액'], ['period', '융자기간']];
    for (var i = 0; i < required.length; i++) {
      if (!String(f[required[i][0]].value).trim()) { toast(required[i][1] + '을(를) 입력하세요.'); f[required[i][0]].focus(); return; }
    }
    if (f.bizFrom.value && f.bizTo.value && f.bizFrom.value > f.bizTo.value) { toast('사업시행기간을 확인하세요.'); return; }

    var isNew = !f.id.value;
    var rec = isNew ? { id: nextId(), decisionNo: '', lender: '서울특별시', reqType: '추진위원회', loanNo: '', splitNo: '' }
      : data.find(function (r) { return r.id === f.id.value; });
    Array.prototype.forEach.call(f.elements, function (el) {
      if (!el.name || el.name === 'id' || el.type === 'file') return;
      if (el.type === 'radio') { if (el.checked) rec[el.name] = el.value; return; }
      rec[el.name] = MONEY.indexOf(el.name) > -1 ? digits(el.value) : el.value.trim();
    });
    if (f.file.files[0]) rec.fileName = f.file.files[0].name;
    if (isNew) data.push(rec);
    save(data);
    fillForm(rec);
    search();
    toast(isNew ? '등록되었습니다. (' + rec.id + ')' : '저장되었습니다.');
  });

  $('btnDelete').addEventListener('click', function () {
    if (!form.id.value) { toast('삭제할 항목을 목록에서 선택하세요.'); return; }
    if (!confirm(form.id.value + ' 건을 삭제하시겠습니까?')) return;
    data = data.filter(function (r) { return r.id !== form.id.value; });
    save(data); fillForm(null); search(); toast('삭제되었습니다.');
  });
  $('btnReset').addEventListener('click', function () {
    var rec = data.find(function (r) { return r.id === form.id.value; });
    fillForm(rec || null);
  });
  $('btnNew').addEventListener('click', function () { fillForm(null); search(); form.bizCode.focus(); });
  $('btnSearch').addEventListener('click', search);
  $('btnSearchReset').addEventListener('click', function () {
    ['sYear', 'sSeq', 'sArea', 'sApplicant', 'sFrom', 'sTo'].forEach(function (id) { $(id).value = ''; });
    search();
  });
  document.querySelector('.search-box').addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });

  // ---------- 엑셀 다운로드 ----------
  $('btnExcel').addEventListener('click', function () {
    var rows = filtered();
    if (!rows.length) { toast('다운로드할 데이터가 없습니다.'); return; }
    var header = ['순번'].concat(COLUMNS.map(function (c) { return c[0]; }));
    var body = rows.map(function (r, i) {
      return [i + 1].concat(COLUMNS.map(function (c) {
        return c[0] === '신청금액' ? (r.amount ? Number(r.amount) : '') : c[1](r);
      }));
    });
    var fname = '융자취급신청목록_' + new Date().toISOString().slice(0, 10).replace(/-/g, '');

    if (window.XLSX) {
      var ws = XLSX.utils.aoa_to_sheet([header].concat(body));
      ws['!cols'] = header.map(function (h) { return { wch: h === '사업기간' ? 24 : Math.max(10, h.length * 2 + 2) }; });
      var amtCol = header.indexOf('신청금액');
      for (var i = 1; i <= body.length; i++) {
        var cell = ws[XLSX.utils.encode_cell({ r: i, c: amtCol })];
        if (cell && cell.t === 'n') cell.z = '#,##0';
      }
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '신청내역');
      XLSX.writeFile(wb, fname + '.xlsx');
    } else {
      // 라이브러리를 불러오지 못한 경우(오프라인 등) CSV로 대체
      var csv = [header].concat(body).map(function (row) {
        return row.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
      }).join('\r\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = fname + '.csv';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
    toast(rows.length + '건 다운로드');
  });

  search();
})();
