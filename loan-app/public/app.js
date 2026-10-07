// 융자취급신청관리 - 서버 API(/api/applications)와 연동
(function () {
  'use strict';

  var API = 'api/applications';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form');
  var selectedId = null;
  var current = [];

  // ---------- 유틸 ----------
  function digits(v) { return String(v == null ? '' : v).replace(/[^\d]/g, ''); }
  function comma(v) { var d = digits(v); return d ? Number(d).toLocaleString('ko-KR') : ''; }
  function dot(d) { return d ? d.replace(/-/g, '.') : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.remove('on'); }, 2000);
  }
  function bizPeriod(r) { return r.bizFrom || r.bizTo ? dot(r.bizFrom) + ' ~ ' + dot(r.bizTo) : ''; }

  function request(method, url, body, headers) {
    var opt = { method: method, headers: headers || {} };
    if (body !== undefined) {
      if (body instanceof Blob) opt.body = body;
      else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
    }
    return fetch(url, opt).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || ('요청 실패 (' + res.status + ')'));
        return data;
      });
    });
  }
  function fail(e) { toast(e.message || '서버와 통신할 수 없습니다.'); }

  // ---------- 조회 ----------
  function queryString() {
    var q = {
      year: $('sYear').value, seq: $('sSeq').value, area: $('sArea').value,
      applicant: $('sApplicant').value, from: $('sFrom').value, to: $('sTo').value
    };
    return Object.keys(q).filter(function (k) { return q[k].trim(); })
      .map(function (k) { return k + '=' + encodeURIComponent(q[k].trim()); }).join('&');
  }

  var COLUMNS = [
    function (r) { return r.id; }, function (r) { return r.decisionNo; }, function (r) { return r.lender; },
    function (r) { return r.reqType; }, function (r) { return r.fund; }, function (r) { return r.loanType; },
    function (r) { return r.area; }, function (r) { return r.applicant; }, function (r) { return r.ceo; },
    bizPeriod, function (r) { return r.applyDate; }, function (r) { return comma(r.amount); },
    function (r) { return r.period !== '' ? r.period + '년' : ''; }, function (r) { return r.loanNo; },
    function (r) { return r.splitNo; }
  ];
  var AMOUNT_COL = 11;

  function render() {
    $('totalCnt').textContent = current.length;
    var tbody = $('grid').tBodies[0];
    if (!current.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="' + (COLUMNS.length + 1) + '">조회된 데이터가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = current.map(function (r, i) {
      return '<tr data-id="' + esc(r.id) + '"' + (r.id === selectedId ? ' class="sel"' : '') + '><td>' + (i + 1) + '</td>' +
        COLUMNS.map(function (c, j) { return '<td' + (j === AMOUNT_COL ? ' class="r"' : '') + '>' + esc(c(r)) + '</td>'; }).join('') + '</tr>';
    }).join('');
  }

  function search() {
    var qs = queryString();
    return request('GET', API + (qs ? '?' + qs : '')).then(function (list) { current = list; render(); }).catch(fail);
  }

  $('grid').tBodies[0].addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    request('GET', API + '/' + encodeURIComponent(tr.dataset.id)).then(function (rec) { fillForm(rec); render(); }).catch(fail);
  });

  // ---------- 상세 폼 ----------
  var MONEY = ['amount', 'govAmt', 'paidAmt'];
  function fillForm(rec) {
    selectedId = rec ? rec.id : null;
    form.reset();
    var link = $('fileLink');
    link.hidden = true;
    if (!rec) { form.id.value = ''; return; }
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'file') return;
      var v = rec[el.name] == null ? '' : String(rec[el.name]);
      if (el.type === 'radio') el.checked = el.value === v;
      else el.value = MONEY.indexOf(el.name) > -1 ? comma(v) : v;
    });
    if (rec.fileName) {
      link.textContent = '첨부: ' + rec.fileName;
      link.href = API + '/' + encodeURIComponent(rec.id) + '/file';
      link.hidden = false;
    }
  }

  MONEY.concat(['period']).forEach(function (n) {
    form[n].addEventListener('input', function () {
      this.value = n === 'period' ? digits(this.value) : comma(this.value);
    });
  });

  function formData() {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.name === 'id' || el.type === 'file') return;
      if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; return; }
      out[el.name] = MONEY.indexOf(el.name) > -1 ? digits(el.value) : el.value.trim();
    });
    return out;
  }

  var REQUIRED = [['bizCode', '사업장'], ['fund', '운용기금'], ['applyDate', '융자취급신청일자'],
    ['applicant', '융자신청인'], ['amount', '융자취급신청금액'], ['period', '융자기간']];

  var saving = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (saving) return;
    for (var i = 0; i < REQUIRED.length; i++) {
      if (!String(form[REQUIRED[i][0]].value).trim()) { toast(REQUIRED[i][1] + '을(를) 입력하세요.'); form[REQUIRED[i][0]].focus(); return; }
    }
    if (form.bizFrom.value && form.bizTo.value && form.bizFrom.value > form.bizTo.value) { toast('사업시행기간을 확인하세요.'); return; }

    var isNew = !form.id.value;
    var file = form.file.files[0];
    saving = true;
    request(isNew ? 'POST' : 'PUT', isNew ? API : API + '/' + encodeURIComponent(form.id.value), formData())
      .then(function (rec) {
        if (!file) return rec;
        return request('PUT', API + '/' + encodeURIComponent(rec.id) + '/file', file, {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name)
        });
      })
      .then(function (rec) {
        fillForm(rec);
        toast(isNew ? '등록되었습니다. (' + rec.id + ')' : '저장되었습니다.');
        return search();
      })
      .catch(fail)
      .then(function () { saving = false; });
  });

  $('btnDelete').addEventListener('click', function () {
    var id = form.id.value;
    if (!id) { toast('삭제할 항목을 목록에서 선택하세요.'); return; }
    if (!confirm(id + ' 건을 삭제하시겠습니까?')) return;
    request('DELETE', API + '/' + encodeURIComponent(id))
      .then(function () { fillForm(null); toast('삭제되었습니다.'); return search(); })
      .catch(fail);
  });
  $('btnReset').addEventListener('click', function () {
    var id = form.id.value;
    if (!id) { fillForm(null); return; }
    request('GET', API + '/' + encodeURIComponent(id)).then(fillForm).catch(fail);
  });
  $('btnNew').addEventListener('click', function () { fillForm(null); render(); form.bizCode.focus(); });
  $('btnSearch').addEventListener('click', search);
  $('btnSearchReset').addEventListener('click', function () {
    ['sYear', 'sSeq', 'sArea', 'sApplicant', 'sFrom', 'sTo'].forEach(function (id) { $(id).value = ''; });
    search();
  });
  document.querySelector('.search-box').addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });

  // ---------- 엑셀 다운로드 (서버에서 xlsx 생성) ----------
  $('btnExcel').addEventListener('click', function () {
    if (!current.length) { toast('다운로드할 데이터가 없습니다.'); return; }
    var qs = queryString();
    var a = document.createElement('a');
    a.href = API + '/export.xlsx' + (qs ? '?' + qs : '');
    document.body.appendChild(a); a.click(); a.remove();
  });

  search();
})();
