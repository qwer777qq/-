/*!
 * 주택용 전기요금 계산 엔진
 * 기준: 한전ON 전기요금계산기 계산 방식(2026-10-22 확인)
 *  - 전력량요금·기본요금·기후환경요금·연료비조정액: 원 미만 절사
 *  - 부가가치세: 전기요금계 × 10%, 원 미만 4사5입
 *  - 전력산업기반기금: 전기요금계 × 2.7%, 10원 미만 절사
 *  - 청구금액: 10원 미만 절사 (TV수신료·복지할인·자동이체할인 제외)
 */
(function (root) {
  'use strict';

  var RATES = {
    low: {
      label: '주택용 저압',
      base: [910, 1600, 7300],
      price10: [1200, 2146, 3073], // 원/kWh × 10 (120.0 / 214.6 / 307.3)
      super10: 7362                // 736.2
    },
    high: {
      label: '주택용 고압',
      base: [730, 1260, 6060],
      price10: [1050, 1740, 2423], // 105.0 / 174.0 / 242.3
      super10: 6013                // 601.3 (한전ON 계산기 적용값)
    }
  };

  var CLIMATE10 = 90;  // 기후환경요금 9.0원/kWh
  var FUEL10 = 50;     // 연료비조정단가 +5.0원/kWh (2026년 4분기)
  var VAT_RATE = 0.1;
  var FUND_PERMIL = 27; // 2.7%
  var SUPER_LIMIT = 1000;

  function seasonOf(month) {
    if (month === 7 || month === 8) return 'summer';
    if (month === 12 || month === 1 || month === 2) return 'winter';
    return 'other';
  }

  function tiersFor(month) {
    return seasonOf(month) === 'summer' ? [300, 450] : [200, 400];
  }

  function hasSuperUser(month) {
    var s = seasonOf(month);
    return s === 'summer' || s === 'winter';
  }

  function calc(kwh, opts) {
    opts = opts || {};
    var type = opts.type === 'high' ? 'high' : 'low';
    var month = Number(opts.month) || 10;
    var r = RATES[type];
    kwh = Math.max(0, Math.floor(Number(kwh) || 0));

    var t = tiersFor(month);
    var superOn = hasSuperUser(month) && kwh > SUPER_LIMIT;

    // 구간별 사용량
    var q1 = Math.min(kwh, t[0]);
    var q2 = Math.max(0, Math.min(kwh, t[1]) - t[0]);
    var q3top = superOn ? SUPER_LIMIT : kwh;
    var q3 = Math.max(0, q3top - t[1]);
    var qs = superOn ? kwh - SUPER_LIMIT : 0;

    var stage = kwh > t[1] ? 3 : (kwh > t[0] ? 2 : 1);
    var base = r.base[stage - 1];

    var lines = [
      { name: '1단계', kwh: q1, price10: r.price10[0] },
      { name: '2단계', kwh: q2, price10: r.price10[1] },
      { name: '3단계', kwh: q3, price10: r.price10[2] }
    ];
    if (superOn) lines.push({ name: '슈퍼유저', kwh: qs, price10: r.super10 });

    var energy10 = 0;
    lines.forEach(function (l) {
      l.amount = l.kwh * l.price10 / 10;
      energy10 += l.kwh * l.price10;
    });
    var energy = Math.floor(energy10 / 10);
    var climate = Math.floor(kwh * CLIMATE10 / 10);
    var fuel = Math.floor(kwh * FUEL10 / 10);

    var subtotal = base + energy + climate + fuel;             // 전기요금계
    var vat = Math.floor(subtotal * VAT_RATE + 0.5);           // 원 미만 4사5입
    var fund = Math.floor(subtotal * FUND_PERMIL / 1000 / 10) * 10; // 10원 미만 절사
    var total = Math.floor((subtotal + vat + fund) / 10) * 10; // 10원 미만 절사

    var nextLimit = stage === 1 ? t[0] : (stage === 2 ? t[1] : (hasSuperUser(month) && kwh <= SUPER_LIMIT ? SUPER_LIMIT : null));

    return {
      type: type,
      typeLabel: r.label,
      month: month,
      season: seasonOf(month),
      tiers: t,
      kwh: kwh,
      stage: superOn ? 4 : stage,
      lines: lines,
      base: base,
      energy: energy,
      climate: climate,
      fuel: fuel,
      subtotal: subtotal,
      vat: vat,
      fund: fund,
      total: total,
      perKwh: kwh ? total / kwh : 0,
      toNext: nextLimit === null ? null : nextLimit - kwh
    };
  }

  var api = {
    calc: calc,
    seasonOf: seasonOf,
    tiersFor: tiersFor,
    RATES: RATES,
    CONST: { climate: CLIMATE10 / 10, fuel: FUEL10 / 10, vat: VAT_RATE, fund: FUND_PERMIL / 1000, superLimit: SUPER_LIMIT },
    BASIS: '2026년 10월 22일 확인 · 한국전력공사 주택용 전기요금표 및 한전ON 계산 방식'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ElecCalc = api;
})(this);
