/*!
 * 주택용 전기요금 계산 엔진 v2
 * 기준: 한전ON 전기요금계산기 계산 방식 (2026-10-22 확인, 실계산 대조)
 *  - 기본요금·전력량요금·기후환경요금·연료비조정액: 원 미만 절사
 *  - 복지할인 대상 가구가 월 200kWh 이하 사용 시 감액: 저압 4,000원 / 고압 2,500원
 *  - 정액 복지할인: min(한도, 전기요금계 - 감액). 한도는 7~8월 별도
 *  - 정률 할인(30%): (전기요금계 - 감액) × 30%, 원 미만 절사. 대가족·출산·다자녀는 월 16,000원 한도
 *  - 복지할인과 대가족류 할인이 겹치면 큰 쪽 하나만 적용
 *  - 부가가치세: 할인 후 전기요금계 × 10%, 원 미만 4사5입
 *  - 전력산업기반기금: 할인 후 전기요금계 × 2.7%, 10원 미만 절사
 *  - 청구금액: 10원 미만 절사 (TV수신료 제외)
 *  - 자동이체 할인(선택): 전기요금계 - min(1,000원, 전월 납부액 × 1%)
 */
(function (root) {
  'use strict';

  var RATES = {
    low: {
      label: '주택용 저압',
      base: [910, 1600, 7300],
      price10: [1200, 2146, 3073],
      super10: 7362,
      smallDeduct: 4000
    },
    high: {
      label: '주택용 고압',
      base: [730, 1260, 6060],
      price10: [1050, 1740, 2423],
      super10: 6013,
      smallDeduct: 2500
    }
  };

  var CLIMATE10 = 90;
  var FUEL10 = 50;
  var VAT_RATE = 0.1;
  var FUND_PERMIL = 27;
  var SUPER_LIMIT = 1000;

  // 복지할인 (한 가구 1개)
  var WELFARE = {
    none:      { label: '해당 없음' },
    disabled:  { label: '장애인(중증)', fixed: [16000, 20000] },
    merit:     { label: '국가·독립·5·18 민주유공자', fixed: [16000, 20000] },
    livingMed: { label: '기초생활수급자(생계·의료)', fixed: [16000, 20000] },
    livingHou: { label: '기초생활수급자(주거·교육)', fixed: [10000, 12000] },
    nearPoor:  { label: '차상위계층', fixed: [8000, 10000] },
    facility:  { label: '사회복지시설', pct: 30, cap: null }
  };
  // 대가족류 할인
  var FAMILY = {
    none:        { label: '해당 없음' },
    large5:      { label: '5인 이상 가구', pct: 30, cap: 16000 },
    birth:       { label: '출산가구(3세 미만 영아)', pct: 30, cap: 16000 },
    multiChild:  { label: '3자녀 이상 가구', pct: 30, cap: 16000 },
    lifeSupport: { label: '생명유지장치 사용', pct: 30, cap: null }
  };

  function seasonOf(month) {
    if (month === 7 || month === 8) return 'summer';
    if (month === 12 || month === 1 || month === 2) return 'winter';
    return 'other';
  }
  function tiersFor(month) { return seasonOf(month) === 'summer' ? [300, 450] : [200, 400]; }
  function hasSuperUser(month) { var s = seasonOf(month); return s === 'summer' || s === 'winter'; }

  function discountAmount(rule, base, summer) {
    if (!rule || (!rule.fixed && !rule.pct) || base <= 0) return 0;
    if (rule.fixed) return Math.min(rule.fixed[summer ? 1 : 0], base);
    var d = Math.floor(base * rule.pct / 100);
    if (rule.cap) d = Math.min(d, rule.cap);
    return Math.min(d, base);
  }

  function calc(kwh, opts) {
    opts = opts || {};
    var type = opts.type === 'high' ? 'high' : 'low';
    var month = Number(opts.month) || 10;
    var r = RATES[type];
    kwh = Math.max(0, Math.floor(Number(kwh) || 0));
    var welfareKey = WELFARE[opts.welfare] ? opts.welfare : 'none';
    var familyKey = FAMILY[opts.family] ? opts.family : 'none';

    var t = tiersFor(month);
    var superOn = hasSuperUser(month) && kwh > SUPER_LIMIT;
    var q1 = Math.min(kwh, t[0]);
    var q2 = Math.max(0, Math.min(kwh, t[1]) - t[0]);
    var q3 = Math.max(0, (superOn ? SUPER_LIMIT : kwh) - t[1]);
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
    lines.forEach(function (l) { l.amount = l.kwh * l.price10 / 10; energy10 += l.kwh * l.price10; });
    var energy = Math.floor(energy10 / 10);
    var climate = Math.floor(kwh * CLIMATE10 / 10);
    var fuel = Math.floor(kwh * FUEL10 / 10);
    var gross = base + energy + climate + fuel;

    // 할인
    var eligible = welfareKey !== 'none' || familyKey !== 'none';
    var smallDeduct = (eligible && kwh <= 200) ? Math.min(r.smallDeduct, gross) : 0;
    var afterDeduct = gross - smallDeduct;
    var summer = seasonOf(month) === 'summer';
    var dW = discountAmount(WELFARE[welfareKey], afterDeduct, summer);
    var dF = discountAmount(FAMILY[familyKey], afterDeduct, summer);
    var discount = Math.max(dW, dF);
    var discountFrom = discount === 0 ? null : (dW >= dF ? WELFARE[welfareKey].label : FAMILY[familyKey].label);

    var subtotal = afterDeduct - discount;

    // 자동이체 할인
    var autopay = 0;
    if (opts.autopay) {
      var prev = Number(opts.prevBill);
      if (!(prev > 0)) prev = null;
      autopay = prev === null ? 0 : Math.min(1000, Math.floor(prev * 0.01), subtotal);
    }
    var billBase = subtotal - autopay;

    var vat = Math.floor(billBase * VAT_RATE + 0.5);
    var fund = Math.floor(billBase * FUND_PERMIL / 1000 / 10) * 10;
    var total = Math.floor((billBase + vat + fund) / 10) * 10;

    var nextLimit = stage === 1 ? t[0] : (stage === 2 ? t[1] : (hasSuperUser(month) && kwh <= SUPER_LIMIT ? SUPER_LIMIT : null));

    return {
      type: type, typeLabel: r.label, month: month, season: seasonOf(month), tiers: t,
      kwh: kwh, stage: superOn ? 4 : stage, lines: lines,
      base: base, energy: energy, climate: climate, fuel: fuel, gross: gross,
      smallDeduct: smallDeduct, discount: discount, discountFrom: discountFrom,
      welfareDiscount: dW, familyDiscount: dF,
      subtotal: subtotal, autopay: autopay, billBase: billBase,
      vat: vat, fund: fund, total: total,
      perKwh: kwh ? total / kwh : 0,
      toNext: nextLimit === null ? null : nextLimit - kwh
    };
  }

  // 가전 사용량(월, kWh). period: 'day' | 'week' | 'month'
  function applianceKwh(watt, hours, period) {
    var w = Math.max(0, Number(watt) || 0), h = Math.max(0, Number(hours) || 0);
    var perPeriod = w * h / 1000;
    if (period === 'week') return perPeriod * 30 / 7;
    if (period === 'month') return perPeriod;
    return perPeriod * 30;
  }

  // 한전ON '사용제품 요금계산' 예시값 (2026-10-22 확인)
  var APPLIANCES = [
    { name: '에어컨', w: 1000, h: 6, p: 'day' },
    { name: '냉장고', w: 200, h: 24, p: 'day' },
    { name: '세탁기', w: 500, h: 1, p: 'day' },
    { name: 'TV', w: 200, h: 4, p: 'day' },
    { name: '건조기', w: 1500, h: 14, p: 'week' },
    { name: '전기장판', w: 300, h: 7, p: 'day' },
    { name: '전기포트', w: 1500, h: 1, p: 'day' },
    { name: '전기밥솥', w: 500, h: 2, p: 'day' },
    { name: '선풍기', w: 100, h: 8, p: 'day' },
    { name: '로봇청소기', w: 200, h: 1, p: 'day' },
    { name: '음향기기', w: 100, h: 2, p: 'day' },
    { name: '전자레인지', w: 1200, h: 3.5, p: 'week' },
    { name: '오븐', w: 1500, h: 3.5, p: 'week' },
    { name: '에어프라이어', w: 1500, h: 3.5, p: 'week' },
    { name: '전기다리미', w: 1000, h: 3.5, p: 'week' },
    { name: '헤어드라이어', w: 1200, h: 1.75, p: 'week' },
    { name: '커피메이커', w: 600, h: 1.75, p: 'week' },
    { name: '주방용 믹서기', w: 200, h: 3.5, p: 'week' }
  ];

  // 공공 전기차 충전요금 (기후에너지환경부, 2026-08-01 시행)
  var EV_PUBLIC = [
    { id: 'slow', label: '완속 (30kW 미만)', price: 295.0 },
    { id: 'm30', label: '급속 30~50kW 미만', price: 307.2 },
    { id: 'm50', label: '급속 50~100kW 미만', price: 325.6 },
    { id: 'm100', label: '급속 100~200kW 미만', price: 348.4 },
    { id: 'm200', label: '초급속 200kW 이상', price: 393.1 }
  ];

  var api = {
    calc: calc, seasonOf: seasonOf, tiersFor: tiersFor, applianceKwh: applianceKwh,
    RATES: RATES, WELFARE: WELFARE, FAMILY: FAMILY, APPLIANCES: APPLIANCES, EV_PUBLIC: EV_PUBLIC,
    CONST: { climate: CLIMATE10 / 10, fuel: FUEL10 / 10, vat: VAT_RATE, fund: FUND_PERMIL / 1000, superLimit: SUPER_LIMIT },
    BASIS_DATE: '2026년 10월 22일'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ElecCalc = api;
})(this);
