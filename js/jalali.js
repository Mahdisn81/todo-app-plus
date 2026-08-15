/* ==========================================================================
   jalali.js — تقویم شمسی (جلالی) مشترک بین همه صفحات
   ------------------------------------------------------------------------
   - الگوریتم تبدیل تاریخ شمسی↔میلادی (بر پایه jalaali-js) که قبلاً داخل
     tasks.js تکرار شده بود، اکنون فقط یک‌جا تعریف شده تا در همه صفحات
     یکسان و قابل‌نگهداری بماند.
   - ویجت تقویم ماهانه (createCalendar) هم در داشبورد (index.html) و هم در
     صفحه تسک‌ها (tasks.html) بدون تکرار کد استفاده می‌شود.

   API:
     Jalali.toJalali(gy, gm, gd)      -> [jy, jm, jd]
     Jalali.toGregorian(jy, jm, jd)   -> { gy, gm, gd }
     Jalali.isLeap(jy)                -> boolean
     Jalali.monthLength(jy, jm)       -> تعداد روزهای ماه
     Jalali.monthInfo(jy, jm)         -> { days, firstWeekday }  (0 = شنبه)
     Jalali.monthName(jm)             -> 'فروردین'
     Jalali.today()                   -> [jy, jm, jd]
     Jalali.todayString()             -> '۱۴۰۳/۰۳/۱۸'
     Jalali.format(jy, jm, jd)        -> '۱۴۰۳/۰۳/۱۸'
     Jalali.normalizeDate(str)        -> تاریخ تایپ‌شده (فارسی/انگلیسی) نرمال‌شده
     Jalali.toFa(num)                 -> عدد فارسی (در صورت حضور store.js از آن استفاده می‌شود)
     Jalali.createCalendar(opts)      -> ویجت تقویم ماهانه
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- عددنویسی فارسی ---------- */
  var faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function toFa(num) {
    if (window.RGMStore && typeof window.RGMStore.toFa === 'function') {
      return window.RGMStore.toFa(num);
    }
    return String(num).replace(/\d/g, function (d) { return faDigits[d]; });
  }

  /* ---------- الگوریتم jalaali-js (تأییدشده با PersianCalendar .NET) ---------- */
  function jalDiv(a, b) { return ~~(a / b); }
  function jalMod(a, b) { return a - ~~(a / b) * b; }

  var JALALI_BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function jalCal(jy) {
    var bl = JALALI_BREAKS.length;
    var gy = jy + 621;
    var leapJ = -14;
    var jp = JALALI_BREAKS[0];
    var jm, jump = 0, n, i;
    for (i = 1; i < bl; i += 1) {
      jm = JALALI_BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + jalDiv(jump, 33) * 8 + jalDiv(jalMod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + jalDiv(n, 33) * 8 + jalDiv(jalMod(n, 33) + 3, 4);
    if (jalMod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    var leapG = jalDiv(gy, 4) - jalDiv((jalDiv(gy, 100) + 1) * 3, 4) - 150;
    var march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + jalDiv(jump + 4, 33) * 33;
    var leap = jalMod(jalMod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }

  function jalG2D(gy, gm, gd) {
    var d = jalDiv((gy + jalDiv(gm - 8, 6) + 100100) * 1461, 4) +
      jalDiv(153 * jalMod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - jalDiv(jalDiv(gy + 100100 + jalDiv(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function jalD2G(jdn) {
    var j = 4 * jdn + 139361631;
    j = j + jalDiv(jalDiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    var i = jalDiv(jalMod(j, 1461), 4) * 5 + 308;
    var gd = jalDiv(jalMod(i, 153), 5) + 1;
    var gm = jalMod(jalDiv(i, 153), 12) + 1;
    var gy = jalDiv(j, 1461) - 100100 + jalDiv(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }

  function jalJ2D(jy, jm, jd) {
    var r = jalCal(jy);
    return jalG2D(r.gy, 3, r.march) + (jm - 1) * 31 - jalDiv(jm, 7) * (jm - 7) + jd - 1;
  }

  /* تبدیل میلادی → شمسی (آلگوریتم مستقل، تأییدشده) */
  function toJalali(gy, gm, gd) {
    var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    var gy2 = (gm > 2) ? (gy + 1) : gy;
    var days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
      Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      jy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    var jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    var jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jy, jm, jd];
  }

  function toGregorian(jy, jm, jd) {
    return jalD2G(jalJ2D(jy, jm, jd));
  }

  function isLeap(jy) {
    return jalCal(jy).leap === 0;
  }

  function monthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeap(jy) ? 30 : 29;
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function format(jy, jm, jd) {
    return toFa(jy + '/' + pad2(jm) + '/' + pad2(jd));
  }

  var MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

  function monthName(jm) {
    return MONTHS[jm - 1];
  }

  function monthInfo(jy, jm) {
    var g = toGregorian(jy, jm, 1);
    var jsDay = new Date(g.gy, g.gm - 1, g.gd).getDay(); // 0=یکشنبه
    return { days: monthLength(jy, jm), firstWeekday: (jsDay + 1) % 7 }; // 0=شنبه
  }

  function today() {
    var now = new Date();
    return toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function todayString() {
    var t = today();
    return format(t[0], t[1], t[2]);
  }

  /* تبدیل تاریخِ تایپ‌شده با ارقام انگلیسی به قالب ذخیره‌شده (شمسی/فارسی) */
  function normalizeDate(str) {
    var s = String(str == null ? '' : str).trim();
    if (!s) return '';
    var m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (m) {
      return toFa(m[1] + '/' + pad2(Number(m[2])) + '/' + pad2(Number(m[3])));
    }
    return toFa(s);
  }

  var DOW = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  /* ========================================================================
     ویجت تقویم ماهانه — مشترک بین داشبورد و صفحه تسک‌ها

     opts:
       gridSel / monthLabelSel / prevSel / nextSel / todaySel / clearSel / infoSel
       renderDow: boolean  (ردیف روزهای هفته داخل grid — استفاده در داشبورد)
       leading: 'empty' | 'muted'  (نمایش سلول‌های ابتدای ماه که خالی‌اند)
       todaySelects: boolean  (دکمه «امروز» علاوه بر جابه‌جایی، تاریخ امروز را هم انتخاب کند)
       year / month: سال و ماه شروع (پیش‌فرض: ماه جاری)
       beforeRender: function()  (هر بار قبل از رندر کردن grid)
       dayClass: function(dateStr, jy, jm, jd) -> کلاس‌های اضافی روز
       dayLabel: function(jd) -> برچسب روز (پیش‌فرض: عدد فارسی)
       onSelect: function(dateStr)  (روزی انتخاب شد)
       onClear: function()  (فیلتر روز پاک شد)
     ==================================================================== */
  function createCalendar(opts) {
    var o = opts || {};
    var grid = document.querySelector(o.gridSel || '#calendarGrid');
    if (!grid) return null;

    var monthLabelEl = o.monthLabelSel ? document.querySelector(o.monthLabelSel) : null;
    var prevBtn = o.prevSel ? document.querySelector(o.prevSel) : null;
    var nextBtn = o.nextSel ? document.querySelector(o.nextSel) : null;
    var todayBtn = o.todaySel ? document.querySelector(o.todaySel) : null;
    var clearBtn = o.clearSel ? document.querySelector(o.clearSel) : null;
    var infoEl = o.infoSel ? document.querySelector(o.infoSel) : null;

    var now = today();
    var cal = {
      year: o.year != null ? o.year : now[0],
      month: o.month != null ? o.month : now[1],
      selectedDate: null
    };

    function render() {
      if (o.beforeRender) o.beforeRender();

      var info = monthInfo(cal.year, cal.month);
      var todayStr = todayString();
      var html = '';

      if (o.renderDow) {
        DOW.forEach(function (d) { html += '<div class="cal-dow">' + d + '</div>'; });
      }

      var i, d, dateStr, cls, label, extra;
      if (o.leading === 'muted') {
        var py = cal.month === 1 ? cal.year - 1 : cal.year;
        var pm = cal.month === 1 ? 12 : cal.month - 1;
        var pdays = monthLength(py, pm);
        for (i = 0; i < info.firstWeekday; i++) {
          html += '<div class="cal-day muted">' + toFa(pdays - info.firstWeekday + 1 + i) + '</div>';
        }
      } else {
        for (i = 0; i < info.firstWeekday; i++) {
          html += '<span class="cal-day empty"></span>';
        }
      }

      for (d = 1; d <= info.days; d++) {
        dateStr = format(cal.year, cal.month, d);
        cls = 'cal-day';
        if (dateStr === todayStr) cls += ' today';
        if (cal.selectedDate && dateStr === cal.selectedDate) cls += ' selected';
        if (o.dayClass) {
          extra = o.dayClass(dateStr, cal.year, cal.month, d);
          if (extra) cls += ' ' + extra;
        }
        label = o.dayLabel ? o.dayLabel(d) : toFa(d);
        html += '<span class="' + cls + '" data-date="' + dateStr + '" role="button" tabindex="0" aria-label="' + dateStr + '">' + label + '</span>';
      }

      grid.innerHTML = html;

      if (monthLabelEl) monthLabelEl.textContent = monthName(cal.month) + ' ' + toFa(cal.year);
      if (infoEl) infoEl.textContent = cal.selectedDate
        ? 'تسک‌های ' + cal.selectedDate
        : 'روزی را انتخاب کنید تا تسک‌های آن را ببینید';
      if (clearBtn) clearBtn.classList.toggle('hidden', !cal.selectedDate);
    }

    function select(dateStr) {
      cal.selectedDate = dateStr;
      render();
      if (o.onSelect) o.onSelect(dateStr);
    }

    function clearSelection() {
      cal.selectedDate = null;
      render();
      if (o.onClear) o.onClear();
    }

    function move(delta) {
      cal.month += delta;
      if (cal.month < 1) { cal.month = 12; cal.year -= 1; }
      if (cal.month > 12) { cal.month = 1; cal.year += 1; }
      render();
    }

    grid.addEventListener('click', function (e) {
      var cell = e.target.closest ? e.target.closest('.cal-day[data-date]') : null;
      if (cell) select(cell.dataset.date);
    });

    grid.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList &&
          e.target.classList.contains('cal-day') && e.target.dataset.date) {
        e.preventDefault();
        select(e.target.dataset.date);
      }
    });

    if (prevBtn) prevBtn.addEventListener('click', function () { move(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { move(1); });

    if (todayBtn) todayBtn.addEventListener('click', function () {
      var t = today();
      cal.year = t[0];
      cal.month = t[1];
      if (o.todaySelects) select(todayString());
      else render();
    });

    if (clearBtn) clearBtn.addEventListener('click', clearSelection);

    render();

    return {
      render: render,
      refresh: render,
      setSelected: function (dateStr) { cal.selectedDate = dateStr; render(); },
      clear: clearSelection,
      getSelected: function () { return cal.selectedDate; }
    };
  }

  window.Jalali = {
    toFa: toFa,
    toJalali: toJalali,
    toGregorian: toGregorian,
    isLeap: isLeap,
    monthLength: monthLength,
    monthInfo: monthInfo,
    monthName: monthName,
    MONTHS: MONTHS,
    today: today,
    todayString: todayString,
    format: format,
    normalizeDate: normalizeDate,
    createCalendar: createCalendar
  };
})();
