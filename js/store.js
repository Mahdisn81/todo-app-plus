/* ==========================================================================
   رشد من — store.js
   لایه‌ی ذخیره‌سازی مشترک مبتنی بر localStorage
   همه‌ی صفحات (داشبورد، تسک‌ها، مالی، گزارش‌ها) از همین منبع داده می‌خوانند
   و هر تغییری (افزودن/ویرایش/حذف) بعد از رفرش هم باقی می‌ماند.

   استفاده:
     RGMStore.getGoals() / RGMStore.saveGoals(arr)
     RGMStore.getExpenses() / RGMStore.saveExpenses(arr)
     RGMStore.getFinance() / RGMStore.saveFinance(obj)
     RGMStore.getTasks() / RGMStore.saveTasks(arr) / RGMStore.nextTaskId()

   اگر localStorage در دسترس نباشد (مثل حالت مرور خصوصی)، یک کپی
   درون‌حافظه‌ای به‌عنوان fallback استفاده می‌شود تا اپ همچنان کار کند.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- کلیدهای ذخیره‌سازی ---------- */
  var KEYS = {
    tasks: 'rgm_tasks_v1',
    goals: 'rgm_goals_v1',
    expenses: 'rgm_expenses_v1',
    income: 'rgm_income_v1',
    finance: 'rgm_finance_v1'
  };

  /* ---------- داده‌ی اولیه (seed) — همان dummy data قبلی ---------- */
  var SEED = {
    tasks: [
      { id: 1, title: 'مطالعه کتاب خرده عادت‌ها', category: 'شخصی', priority: 'بالا', date: '۱۴۰۳/۰۳/۱۸', status: 'completed', timeSpent: 2700 },
      { id: 2, title: 'ورزش صبحگاهی', category: 'سلامتی', priority: 'متوسط', date: '۱۴۰۳/۰۳/۱۸', status: 'completed', timeSpent: 1800 },
      { id: 3, title: 'کار روی پروژه طراحی سایت', category: 'کاری', priority: 'بالا', date: '۱۴۰۳/۰۳/۱۹', status: 'in-progress',
        subtasks: [
          { id: 1, title: 'طراحی هدر صفحه', category: 'کاری', priority: 'بالا', date: '۱۴۰۳/۰۳/۱۹', status: 'completed', timeSpent: 5400 },
          { id: 2, title: 'پیاده‌سازی فوتر', category: 'کاری', priority: 'متوسط', date: '۱۴۰۳/۰۳/۲۰', status: 'pending' }
        ] },
      { id: 4, title: 'یادگیری دوره جدید UI/UX', category: 'یادگیری', priority: 'متوسط', date: '۱۴۰۳/۰۳/۲۰', status: 'overdue' },
      { id: 5, title: 'خرید مواد غذایی', category: 'شخصی', priority: 'پایین', date: '۱۴۰۳/۰۳/۲۰', status: 'pending' },
      { id: 6, title: 'تماس با مشاور', category: 'شخصی', priority: 'بالا', date: '۱۴۰۳/۰۳/۲۱', status: 'pending' },
      { id: 7, title: 'بررسی گزارش ماهانه', category: 'کاری', priority: 'متوسط', date: '۱۴۰۳/۰۳/۲۲', status: 'pending' },
      { id: 8, title: 'پرداخت قبض‌های ماهانه', category: 'شخصی', priority: 'متوسط', date: '۱۴۰۳/۰۳/۲۳', status: 'pending' },
      { id: 9, title: 'برنامه‌ریزی سفر آخر هفته', category: 'شخصی', priority: 'پایین', date: '۱۴۰۳/۰۳/۲۳', status: 'cancelled' },
      { id: 10, title: 'جلسه هفتگی تیم', category: 'کاری', priority: 'بالا', date: '۱۴۰۳/۰۳/۲۴', status: 'in-progress' },
      { id: 11, title: 'نوشتن یادداشت‌های روزانه', category: 'شخصی', priority: 'پایین', date: '۱۴۰۳/۰۳/۲۴', status: 'completed', timeSpent: 900 },
      { id: 12, title: 'تمرین زبان انگلیسی', category: 'یادگیری', priority: 'متوسط', date: '۱۴۰۳/۰۳/۲۵', status: 'pending' }
    ],

    goals: [
      { id: 1, name: 'مطالعه ۲۰ کتاب در سال', current: 12, total: 20 },
      { id: 2, name: 'پس‌انداز ۱۰۰ میلیون تومان', current: 55, total: 100 },
      { id: 3, name: 'کاهش وزن ۵ کیلو', current: 2, total: 5 }
    ],

    expenses: [
      { id: 1, title: 'اجاره‌ی مسکن', label: 'خانه و قبوض', value: 5550000, color: '#7C5CFC', date: '۱۴۰۳/۰۳/۱۸' },
      { id: 2, title: 'خرید هفتگی سوپرمارکت', label: 'غذا و خوراک', value: 2300000, color: '#FFA451', date: '۱۴۰۳/۰۳/۱۹' },
      { id: 3, title: 'بنزین و مترو', label: 'حمل‌ونقل', value: 1450000, color: '#2ECC91', date: '۱۴۰۳/۰۳/۲۰' },
      { id: 4, title: 'سینما و بیرون رفتن', label: 'تفریح و سرگرمی', value: 1650000, color: '#4FA3F7', date: '۱۴۰۳/۰۳/۲۱' },
      { id: 5, title: 'دارو و ویزیت', label: 'سلامت و درمان', value: 1100000, color: '#FF6FA5', date: '۱۴۰۳/۰۳/۲۲' },
      { id: 6, title: 'خریدهای متفرقه', label: 'سایر', value: 1150000, color: '#C9CBDA', date: '۱۴۰۳/۰۳/۲۳' }
    ],

    income: [
      { id: 1, title: 'حقوق ماهانه', label: 'حقوق', value: 22000000, date: '۱۴۰۳/۰۳/۰۲' },
      { id: 2, title: 'فاکتور طراحی سایت', label: 'درآمد پروژه', value: 2500000, date: '۱۴۰۳/۰۳/۱۰' }
    ],

    finance: { income: 24500000, budget: 22000000 },

    weeklyProgress: {
      labels: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'],
      values: [22, 38, 55, 78, 60, 48, 72]
    }
  };

  /* ---------- تشخیص در دسترس بودن localStorage ---------- */
  var memoryFallback = {};
  var storageAvailable = (function () {
    try {
      var t = '__rgm_test__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function read(key) {
    try {
      if (storageAvailable) {
        var raw = window.localStorage.getItem(key);
        if (raw === null) return null;
        return JSON.parse(raw);
      }
      return memoryFallback[key] === undefined ? null : memoryFallback[key];
    } catch (e) {
      return null; // داده‌ی خراب -> با seed بازنویسی می‌شود
    }
  }

  function write(key, value) {
    try {
      if (storageAvailable) {
        window.localStorage.setItem(key, JSON.stringify(value));
      } else {
        memoryFallback[key] = value;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- لود با seed اولیه ---------- */
  function load(key, seed) {
    var data = read(key);
    if (data === null) {
      write(key, seed);
      return JSON.parse(JSON.stringify(seed)); // کپی عمیق
    }
    return data;
  }

  function nextId(list) {
    var max = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id > max) max = list[i].id;
    }
    return max + 1;
  }

  /* ---------- عددنویسی فارسی ---------- */
  var faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function toFa(num) {
    return String(num).replace(/\d/g, function (d) { return faDigits[d]; });
  }

  function formatToman(num) {
    return toFa(Number(num || 0).toLocaleString('en-US'));
  }

  /* ---------- API عمومی ---------- */
  window.RGMStore = {
    KEYS: KEYS,
    isPersistent: storageAvailable,

    /* ----- تسک‌ها ----- */
    getTasks: function () { return load(KEYS.tasks, SEED.tasks); },
    saveTasks: function (arr) { write(KEYS.tasks, arr); return arr; },
    nextTaskId: function () { return nextId(this.getTasks()); },

    /* ----- اهداف ----- */
    getGoals: function () { return load(KEYS.goals, SEED.goals); },
    saveGoals: function (arr) { write(KEYS.goals, arr); return arr; },
    nextGoalId: function () { return nextId(this.getGoals()); },

    /* ----- هزینه‌ها ----- */
    getExpenses: function () { return load(KEYS.expenses, SEED.expenses); },
    saveExpenses: function (arr) { write(KEYS.expenses, arr); return arr; },
    nextExpenseId: function () { return nextId(this.getExpenses()); },

    /* ----- درآمدها ----- */
    getIncome: function () { return load(KEYS.income, SEED.income); },
    saveIncome: function (arr) { write(KEYS.income, arr); return arr; },
    nextIncomeId: function () { return nextId(this.getIncome()); },

    /* ----- مالی (درآمد/بودجه) ----- */
    getFinance: function () { return load(KEYS.finance, SEED.finance); },
    saveFinance: function (obj) { write(KEYS.finance, obj); return obj; },

    /* ----- پیشرفت هفتگی (ثابت/دمو) ----- */
    getWeeklyProgress: function () { return JSON.parse(JSON.stringify(SEED.weeklyProgress)); },

    /* ----- ابزارهای کمکی (اشتراکی بین صفحات) ----- */
    toFa: toFa,
    formatToman: formatToman,

    totalExpenses: function () {
      var sum = 0;
      this.getExpenses().forEach(function (e) { sum += Number(e.value) || 0; });
      return sum;
    },

    totalIncome: function () {
      var sum = 0;
      this.getIncome().forEach(function (r) { sum += Number(r.value) || 0; });
      return sum;
    }
  };
})();
