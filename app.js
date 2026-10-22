/* 공통 UI 도우미: 숫자 형식, 결과 표·계단 그래프 렌더링 */
(function (root) {
  'use strict';
  var EC = root.ElecCalc;
  var fmt = function (n) { return Math.round(n).toLocaleString('ko-KR'); };
  var TIER_COLOR = ['var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)'];
  var STAGE_NAME = ['1단계', '2단계', '3단계', '슈퍼유저'];
  var num = function (v) { var s = String(v == null ? '' : v).replace(/[^\d.]/g, ''); return s === '' ? null : Number(s); };

  function currentMonth() { try { return new Date().getMonth() + 1; } catch (e) { return 10; } }

  function stairsSVG(r) {
    var t = r.tiers, rate = EC.RATES[r.type], peak = r.season !== 'other';
    var maxK = Math.max(peak ? 1150 : 700, Math.ceil(r.kwh * 1.08 / 50) * 50);
    var steps = [
      { from: 0, to: t[0], p: rate.price10[0] / 10 },
      { from: t[0], to: t[1], p: rate.price10[1] / 10 },
      { from: t[1], to: peak ? Math.min(1000, maxK) : maxK, p: rate.price10[2] / 10 }
    ];
    if (peak && maxK > 1000) steps.push({ from: 1000, to: maxK, p: rate.super10 / 10 });
    var W = 700, H = 150, padB = 26, maxP = peak ? rate.super10 / 10 : rate.price10[2] / 10;
    var x = function (k) { return k / maxK * W; };
    var y = function (p) { return H - padB - (p / maxP) * (H - padB - 14); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="누진 구간별 단가와 현재 사용량">';
    steps.forEach(function (st, i) {
      var filled = Math.max(0, Math.min(r.kwh, st.to) - st.from);
      s += '<rect x="' + x(st.from) + '" y="' + y(st.p) + '" width="' + (x(st.to) - x(st.from)) + '" height="' + (H - padB - y(st.p)) + '" fill="' + TIER_COLOR[i] + '" opacity=".18"/>';
      if (filled > 0) s += '<rect x="' + x(st.from) + '" y="' + y(st.p) + '" width="' + (x(st.from + filled) - x(st.from)) + '" height="' + (H - padB - y(st.p)) + '" fill="' + TIER_COLOR[i] + '"/>';
      s += '<text x="' + (x(st.from) + 4) + '" y="' + (y(st.p) - 5) + '" font-size="13" font-weight="700" fill="currentColor">' + st.p.toFixed(1) + '원</text>';
      if (st.from > 0) s += '<text x="' + x(st.from) + '" y="' + (H - 8) + '" font-size="12" text-anchor="middle" fill="currentColor" opacity=".7">' + st.from + '</text>';
    });
    var mx = x(Math.min(r.kwh, maxK));
    s += '<line class="marker" x1="' + mx + '" x2="' + mx + '" y1="4" y2="' + (H - padB) + '" stroke="currentColor" stroke-width="2.5"/>';
    s += '<text x="' + Math.min(Math.max(mx, 30), W - 30) + '" y="' + (H - 8) + '" font-size="13" font-weight="800" text-anchor="middle" fill="currentColor">' + r.kwh + 'kWh</text></svg>';
    return s;
  }

  function breakdownRows(r) {
    var rows = '';
    rows += '<tr><td>기본요금<span class="sub">' + STAGE_NAME[Math.min(r.stage, 3) - 1] + ' 구간 정액</span></td><td class="amt">' + fmt(r.base) + '원</td></tr>';
    var lt = r.lines.filter(function (l) { return l.kwh > 0; }).map(function (l) { return l.name + ' ' + fmt(l.kwh) + 'kWh × ' + (l.price10 / 10).toFixed(1) + '원'; }).join(', ');
    rows += '<tr><td>전력량요금<span class="sub">' + (lt || '사용량 없음') + '</span></td><td class="amt">' + fmt(r.energy) + '원</td></tr>';
    rows += '<tr><td>기후환경요금<span class="sub">' + fmt(r.kwh) + 'kWh × 9원</span></td><td class="amt">' + fmt(r.climate) + '원</td></tr>';
    rows += '<tr><td>연료비조정액<span class="sub">' + fmt(r.kwh) + 'kWh × 5원 (2026년 4분기)</span></td><td class="amt">' + fmt(r.fuel) + '원</td></tr>';
    if (r.smallDeduct) rows += '<tr class="minus"><td>200kWh 이하 감액<span class="sub">할인 대상 가구, 월 200kWh 이하 사용</span></td><td class="amt">−' + fmt(r.smallDeduct) + '원</td></tr>';
    if (r.discount) rows += '<tr class="minus"><td>' + r.discountFrom + ' 할인<span class="sub">여러 할인에 해당하면 큰 금액 하나만 적용</span></td><td class="amt">−' + fmt(r.discount) + '원</td></tr>';
    rows += '<tr class="sum"><td>전기요금계</td><td class="amt">' + fmt(r.subtotal) + '원</td></tr>';
    if (r.autopay) rows += '<tr class="minus"><td>자동이체 할인<span class="sub">전월 납부액의 1%, 최대 1,000원</span></td><td class="amt">−' + fmt(r.autopay) + '원</td></tr>';
    rows += '<tr><td>부가가치세<span class="sub">10%, 원 미만 반올림</span></td><td class="amt">' + fmt(r.vat) + '원</td></tr>';
    rows += '<tr><td>전력산업기반기금<span class="sub">2.7%, 10원 미만 버림</span></td><td class="amt">' + fmt(r.fund) + '원</td></tr>';
    rows += '<tr class="grand"><td>청구 예상액<span class="sub">10원 미만 버림, TV수신료 제외</span></td><td class="amt">' + fmt(r.total) + '원</td></tr>';
    return rows;
  }

  function nextText(r) {
    if (r.stage === 4) return '1,000kWh를 넘긴 ' + fmt(r.kwh - 1000) + 'kWh에 슈퍼유저 단가가 붙었습니다.';
    if (r.toNext === null) return '가장 높은 누진 구간입니다.';
    var n = r.stage === 1 ? '2단계' : (r.stage === 2 ? '3단계' : '슈퍼유저 구간');
    return n + '까지 ' + fmt(r.toNext) + 'kWh 남았습니다.';
  }

  function fillMonths(sel) {
    if (!sel) return;
    var names = {1:'1월 (동계)',2:'2월 (동계)',7:'7월 (하계 완화)',8:'8월 (하계 완화)',12:'12월 (동계)'};
    var h = '';
    for (var m = 1; m <= 12; m++) h += '<option value="' + m + '">' + (names[m] || m + '월') + '</option>';
    sel.innerHTML = h;
    sel.value = String(currentMonth());
  }

  function fillOptions(sel, obj) {
    if (!sel) return;
    sel.innerHTML = Object.keys(obj).map(function (k) { return '<option value="' + k + '">' + obj[k].label + '</option>'; }).join('');
  }

  root.UI = { fmt: fmt, num: num, stairsSVG: stairsSVG, breakdownRows: breakdownRows, nextText: nextText,
    TIER_COLOR: TIER_COLOR, STAGE_NAME: STAGE_NAME, fillMonths: fillMonths, fillOptions: fillOptions, currentMonth: currentMonth };

  // 광고 슬롯 초기화 (광고 스크립트가 있는 운영판에서만 동작)
  try { document.querySelectorAll('ins.adsbygoogle').forEach(function () { (root.adsbygoogle = root.adsbygoogle || []).push({}); }); } catch (e) {}
})(this);
