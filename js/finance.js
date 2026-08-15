/* ==========================================================================
   مدیریت مالی — finance.js
   کارت مانده، کارت‌های خلاصه، جدول تراکنش‌ها، نمودار دونات دسته‌بندی
   هزینه‌ها و مودال افزودن تراکنش / ویرایش درآمد و بودجه.
   همه‌ی داده‌ها از RGMStore (localStorage) خوانده و نوشته می‌شوند.
   ========================================================================== */

(function () {
  'use strict';

  var store = window.RGMStore;
  var toFa = store.toFa;
  var formatToman = store.formatToman;
  var qs = RGMApp.qs;
  var qsa = RGMApp.qsa;
  var escapeHtml = RGMApp.escapeHtml;
  var showToast = RGMApp.showToast;

  var EXPENSE_COLORS = ['#7C5CFC', '#FFA451', '#2ECC91', '#4FA3F7', '#FF6FA5', '#C9CBDA'];
  var selectedColor = EXPENSE_COLORS[0];

  /* ---------- دسته‌بندی‌ها بر اساس نوع تراکنش ---------- */
  var EXPENSE_CATEGORIES = [
    'غذا و خوراک', 'حمل‌ونقل', 'خانه و قبوض', 'خرید', 'سلامت و درمان', 'تفریح و سرگرمی',
    'اشتراک‌ها', 'آموزش', 'اقساط و بدهی', 'هدیه و کمک', 'پس‌انداز و سرمایه‌گذاری', 'سایر'
  ];
  var INCOME_CATEGORIES = [
    'حقوق', 'درآمد پروژه', 'کسب‌وکار', 'هدیه و کمک', 'سود سرمایه‌گذاری', 'سود بانکی',
    'بازگشت وجه', 'قرض دریافتی', 'فروش', 'سایر درآمدها'
  ];
  var TRANSFER_CATEGORIES = ['انتقال بین حساب‌ها', 'انتقال به پس‌انداز', 'تسویه حساب'];

  var CATEGORY_ICONS = {
    'غذا و خوراک': 'fa-utensils',
    'حمل‌ونقل': 'fa-car',
    'خانه و قبوض': 'fa-house',
    'خرید': 'fa-bag-shopping',
    'سلامت و درمان': 'fa-heart-pulse',
    'تفریح و سرگرمی': 'fa-gamepad',
    'اشتراک‌ها': 'fa-repeat',
    'آموزش': 'fa-graduation-cap',
    'اقساط و بدهی': 'fa-credit-card',
    'هدیه و کمک': 'fa-gift',
    'پس‌انداز و سرمایه‌گذاری': 'fa-chart-line',
    'سایر': 'fa-ellipsis',
    'حقوق': 'fa-money-bill-wave',
    'درآمد پروژه': 'fa-laptop-code',
    'کسب‌وکار': 'fa-briefcase',
    'سود سرمایه‌گذاری': 'fa-chart-line',
    'سود بانکی': 'fa-building-columns',
    'بازگشت وجه': 'fa-rotate-left',
    'قرض دریافتی': 'fa-hand-holding-dollar',
    'فروش': 'fa-cart-shopping',
    'سایر درآمدها': 'fa-ellipsis'
  };

  function iconFor(cat) {
    return CATEGORY_ICONS[cat] || 'fa-ellipsis';
  }

  function categoryIconHtml(cat) {
    return '<i class="fa-solid ' + iconFor(cat) + '" aria-hidden="true"></i>';
  }

  function categoriesForType(type) {
    if (type === 'expense') return EXPENSE_CATEGORIES;
    if (type === 'income') return INCOME_CATEGORIES;
    return TRANSFER_CATEGORIES;
  }

  var txCategoryValue = '';

  function populateTxCategories(type) {
    var list = categoriesForType(type);
    var dropdown = qs('#catDropdown');
    if (!dropdown) return;

    if (list.indexOf(txCategoryValue) === -1) txCategoryValue = list[0];

    dropdown.innerHTML = list.map(function (c) {
      return (
        '<li class="cat-option' + (c === txCategoryValue ? ' active' : '') + '" role="option" data-value="' + escapeHtml(c) + '" aria-selected="' + (c === txCategoryValue) + '">' +
          categoryIconHtml(c) + '<span>' + escapeHtml(c) + '</span>' +
        '</li>'
      );
    }).join('');

    updateTxCategoryBtn();
  }

  function updateTxCategoryBtn() {
    var valueEl = qs('#txCategory');
    if (!valueEl) return;
    valueEl.innerHTML = categoryIconHtml(txCategoryValue) + '<span>' + escapeHtml(txCategoryValue) + '</span>';
  }

  function initCatSelect() {
    var wrap = qs('#catSelect');
    if (!wrap) return;
    var btn = qs('#catSelectBtn');
    var dropdown = qs('#catDropdown');

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = wrap.classList.contains('open');
      closeCatDropdowns();
      if (!open) {
        wrap.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });

    dropdown.addEventListener('click', function (e) {
      var opt = e.target.closest('.cat-option');
      if (!opt) return;
      txCategoryValue = opt.dataset.value;
      updateTxCategoryBtn();
      qsa('.cat-option', dropdown).forEach(function (o) {
        var active = o === opt;
        o.classList.toggle('active', active);
        o.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      closeCatDropdowns();
    });
  }

  function closeCatDropdowns() {
    var wrap = qs('#catSelect');
    if (!wrap) return;
    wrap.classList.remove('open');
    var btn = qs('#catSelectBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  /* ---------- بارگذاری اولیه ---------- */
  function renderAll() {
    updateSummary();
    renderExpenseChart();
    renderTransactions();
  }

  /* ---------- خلاصه‌ی کارت‌ها + کارت مانده ---------- */
  function updateSummary() {
    var finance = store.getFinance();
    var spent = store.totalExpenses();
    var balance = finance.income - spent;
    var budgetPct = finance.budget > 0 ? Math.min(100, Math.round((spent / finance.budget) * 100)) : 0;
    var balancePct = finance.income > 0 ? Math.round((Math.max(0, balance) / finance.income) * 100) : 0;

    setText('#heroBalance', formatToman(balance));
    setText('#finIncome', formatToman(finance.income));
    setText('#finBudget', formatToman(finance.budget));
    setText('#finSpent', formatToman(spent));

    var balEl = qs('#finBalance');
    if (balEl) {
      balEl.textContent = formatToman(balance);
      balEl.classList.toggle('finance-value--neg', balance < 0);
    }

    setBar('#finBudgetBar', budgetPct);
    setText('#finBudgetFoot', toFa(budgetPct) + '٪ از بودجه' + (budgetPct >= 100 ? ' (بیش از بودجه)' : ''));
    setBar('#finBalanceBar', balancePct);
    setText('#finBalanceFoot', toFa(balancePct) + '٪ از درآمد');
  }

  function setBar(sel, pct) {
    var el = qs(sel);
    if (!el) return;
    el.dataset.width = pct;
    el.style.width = pct + '%';
  }

  function setText(sel, txt) {
    var el = qs(sel);
    if (el) el.textContent = txt;
  }

  /* ---------- نمودار دونات دسته‌بندی هزینه‌ها ---------- */
  var chart = null;
  function renderExpenseChart() {
    var canvas = qs('#expChart');
    var legendEl = qs('#expenseLegend');
    var expenses = store.getExpenses();
    var labels = expenses.map(function (e) { return e.label; });
    var values = expenses.map(function (e) { return e.value; });
    var colors = expenses.map(function (e) { return e.color; });
    var total = store.totalExpenses();

    setText('#expenseTotal', formatToman(total));

    if (!canvas || typeof Chart === 'undefined') return;

    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = values;
      chart.data.datasets[0].backgroundColor = colors;
      chart.update();
    } else {
      chart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderColor: '#ffffff',
            borderWidth: 3,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { display: false },
            tooltip: {
              rtl: true,
              titleFont: { family: 'Vazirmatn' },
              bodyFont: { family: 'Vazirmatn' },
              callbacks: { label: function (ctx) { return ' ' + formatToman(ctx.raw) + ' تومان'; } }
            }
          }
        }
      });
    }

    if (legendEl) {
      legendEl.innerHTML = expenses.map(function (e) {
        return (
          '<li>' +
            '<span class="legend-left">' +
              '<span class="legend-dot" style="background:' + e.color + '"></span>' +
              categoryIconHtml(e.label) +
              '<span class="label">' + escapeHtml(e.label) + '</span>' +
            '</span>' +
            '<span class="legend-value">' + formatToman(e.value) + '</span>' +
          '</li>'
        );
      }).join('');
    }
  }

  /* ---------- جدول تراکنش‌ها ---------- */
  function renderTransactions() {
    var table = qs('#txTable');
    if (!table) return;

    var incomes = store.getIncome();
    var expenses = store.getExpenses();
    var finance = store.getFinance();
    var total = store.totalExpenses();
    var incomeTotal = store.totalIncome();

    if (expenses.length === 0 && incomes.length === 0 && finance.income <= 0) {
      table.innerHTML =
        '<div class="task-empty-state">' +
          '<i class="fa-regular fa-folder-open" aria-hidden="true"></i>' +
          '<p>هنوز تراکنشی ثبت نشده است</p>' +
        '</div>';
      return;
    }

    var rows = '';

    if (incomes.length > 0) {
      rows += incomes.map(function (r) {
        return (
          '<tr data-row="income" data-id="' + r.id + '">' +
            '<td class="tx-date">' + escapeHtml(r.date || '—') + '</td>' +
            '<td><span class="tx-badge tx-badge--income"><i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i> درآمد</span></td>' +
            '<td><span class="tx-title"><span class="tx-dot" style="background:var(--green)"></span>' + escapeHtml(r.title || r.label) + '</span></td>' +
            '<td class="tx-cat">' + categoryIconHtml(r.label || '') + '<span>' + escapeHtml(r.label || '—') + '</span></td>' +
            '<td class="tx-amount tx-amount--pos">' + formatToman(r.value) + ' +</td>' +
            '<td><span class="tx-status"><span class="status-dot" style="background:var(--green)"></span> موفق</span></td>' +
            '<td><button class="tx-del" type="button" data-type="income" data-id="' + r.id + '" aria-label="حذف درآمد ' + escapeHtml(r.label) + '">' +
              '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>' +
            '</button></td>' +
          '</tr>'
        );
      }).join('');
    } else if (finance.income > 0) {
      rows +=
        '<tr data-row="income">' +
          '<td class="tx-date">—</td>' +
          '<td><span class="tx-badge tx-badge--income"><i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i> درآمد</span></td>' +
          '<td><span class="tx-title"><span class="tx-dot" style="background:var(--green)"></span>' + escapeHtml('درآمد ماه') + '</span></td>' +
          '<td class="tx-cat"><i class="fa-solid fa-coins" aria-hidden="true"></i><span>—</span></td>' +
          '<td class="tx-amount tx-amount--pos">' + formatToman(finance.income) + ' +</td>' +
          '<td><span class="tx-status"><span class="status-dot" style="background:var(--green)"></span> موفق</span></td>' +
          '<td></td>' +
        '</tr>';
    }

    rows += expenses.map(function (e) {
      var title = e.title || e.label;
      return (
        '<tr data-id="' + e.id + '">' +
          '<td class="tx-date">' + escapeHtml(e.date || '—') + '</td>' +
          '<td><span class="tx-badge tx-badge--expense"><i class="fa-solid fa-arrow-trend-down" aria-hidden="true"></i> هزینه</span></td>' +
          '<td><span class="tx-title"><span class="tx-dot" style="background:' + e.color + '"></span>' + escapeHtml(title) + '</span></td>' +
          '<td class="tx-cat">' + categoryIconHtml(e.label || '') + '<span>' + escapeHtml(e.label || '—') + '</span></td>' +
          '<td class="tx-amount tx-amount--neg">' + formatToman(e.value) + ' -</td>' +
          '<td><span class="tx-status"><span class="status-dot" style="background:var(--green)"></span> موفق</span></td>' +
          '<td><button class="tx-del" type="button" data-type="expense" data-id="' + e.id + '" aria-label="حذف ' + escapeHtml(title) + '">' +
            '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>' +
          '</button></td>' +
        '</tr>'
      );
    }).join('');

    var foot = '';
    if (incomes.length > 0 || finance.income > 0) {
      foot +=
        '<tr>' +
          '<td colspan="3">جمع درآمدها</td>' +
          '<td></td>' +
          '<td class="tx-amount tx-amount--pos">' + formatToman(incomeTotal) + ' +</td>' +
          '<td></td><td></td>' +
        '</tr>';
    }
    if (expenses.length) {
      foot +=
        '<tr>' +
          '<td colspan="3">جمع هزینه‌ها</td>' +
          '<td></td>' +
          '<td class="tx-amount tx-amount--neg">' + formatToman(total) + ' -</td>' +
          '<td></td><td></td>' +
        '</tr>';
    }

    table.innerHTML =
      '<table>' +
        '<thead>' +
          '<tr>' +
            '<th>تاریخ</th><th>نوع</th><th>عنوان</th><th>دسته‌بندی</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
        (foot ? '<tfoot>' + foot + '</tfoot>' : '') +
      '</table>';
  }

  /* ---------- حذف هزینه از جدول تراکنش‌ها ---------- */
  function initTable() {
    var table = qs('#txTable');
    if (!table) return;

    table.addEventListener('click', function (e) {
      var btn = e.target.closest('.tx-del');
      if (!btn) return;
      var id = Number(btn.dataset.id);

      if (btn.dataset.type === 'income') {
        var incomes = store.getIncome();
        var removed = null;
        incomes.forEach(function (x) { if (x.id === id) removed = x; });
        if (!removed) return;
        store.saveIncome(incomes.filter(function (x) { return x.id !== id; }));
        var fin = store.getFinance();
        fin.income = Math.max(0, (Number(fin.income) || 0) - (Number(removed.value) || 0));
        store.saveFinance(fin);
        renderAll();
        showToast('درآمد حذف شد', 'danger');
        return;
      }

      var expenses = store.getExpenses().filter(function (x) { return x.id !== id; });
      store.saveExpenses(expenses);
      renderAll();
      showToast('هزینه حذف شد', 'danger');
    });

    qs('#txViewAll').addEventListener('click', function (e) {
      e.preventDefault();
      showToast('نمایش همه‌ی تراکنش‌ها در دست توسعه است', 'info');
    });
  }

  /* ---------- مودال افزودن تراکنش ---------- */
  var txType = 'expense';

  function txModal() {
    return qs('#transactionModal');
  }

  function openTxModal() {
    txType = 'expense';
    txCategoryValue = '';
    qs('#txTitle').value = '';
    qs('#txValue').value = '';
    qs('#txNote').value = '';
    qs('#txDate').value = (typeof Jalali !== 'undefined' && Jalali.todayString) ? Jalali.todayString() : '';
    resetColorPicker();
    switchTxType('expense');
    txModal().classList.add('show');
    txModal().setAttribute('aria-hidden', 'false');
    qs('#txTitle').focus();
  }

  function closeTxModal() {
    txModal().classList.remove('show');
    txModal().setAttribute('aria-hidden', 'true');
  }

  function switchTxType(type) {
    txType = type;
    qsa('.type-tab', txModal()).forEach(function (tab) {
      var active = tab.dataset.type === type;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    var titleEl = qs('#txModalTitle');
    if (type === 'expense') titleEl.textContent = 'ثبت هزینه';
    else if (type === 'income') titleEl.textContent = 'ثبت درآمد';
    else titleEl.textContent = 'انتقال بین حساب‌ها';

    var colorGroup = qs('#txColorGroup');
    if (colorGroup) colorGroup.style.display = type === 'expense' ? '' : 'none';

    populateTxCategories(type);
  }

  function resetColorPicker() {
    selectedColor = EXPENSE_COLORS[0];
    qsa('.color-dot', qs('#txColorPicker')).forEach(function (dot, i) {
      dot.classList.toggle('active', i === 0);
    });
  }

  function initTxModal() {
    qs('#addTxBtn').addEventListener('click', openTxModal);
    qs('#txCancel').addEventListener('click', closeTxModal);

    initCatSelect();

    qsa('.type-tab', txModal()).forEach(function (tab) {
      tab.addEventListener('click', function () { switchTxType(tab.dataset.type); });
    });

    qsa('.color-dot', qs('#txColorPicker')).forEach(function (dot) {
      dot.addEventListener('click', function () {
        qsa('.color-dot', qs('#txColorPicker')).forEach(function (d) { d.classList.remove('active'); });
        dot.classList.add('active');
        selectedColor = dot.dataset.color;
      });
    });

    qs('#txSave').addEventListener('click', saveTransaction);

    // بستن با کلیک روی پس‌زمینه
    txModal().addEventListener('click', function (e) {
      if (e.target === this) closeTxModal();
    });
  }

  function saveTransaction() {
    var value = Number(qs('#txValue').value);
    var title = qs('#txTitle').value.trim();
    var category = txCategoryValue;

    if (!title) {
      showToast('عنوان تراکنش را وارد کنید', 'danger');
      qs('#txTitle').focus();
      return;
    }
    if (!category) {
      showToast('دسته‌بندی را انتخاب کنید', 'danger');
      return;
    }
    if (isNaN(value) || value <= 0) {
      showToast('مبلغ معتبر وارد کنید', 'danger');
      qs('#txValue').focus();
      return;
    }

    var dateVal = qs('#txDate').value.trim();
    var todayStr = (typeof Jalali !== 'undefined' && Jalali.todayString) ? Jalali.todayString() : '';

    if (txType === 'expense') {
      var expenses = store.getExpenses();
      expenses.push({
        id: store.nextExpenseId(),
        title: title,
        label: category,
        value: value,
        color: selectedColor,
        date: dateVal || todayStr
      });
      store.saveExpenses(expenses);
      closeTxModal();
      renderAll();
      showToast('هزینه جدید ثبت شد', 'success');
    } else if (txType === 'income') {
      var incomes = store.getIncome();
      incomes.push({
        id: store.nextIncomeId(),
        title: title,
        label: category,
        value: value,
        date: dateVal || todayStr
      });
      store.saveIncome(incomes);
      var finance = store.getFinance();
      finance.income = (Number(finance.income) || 0) + value;
      store.saveFinance(finance);
      closeTxModal();
      renderAll();
      showToast('درآمد جدید ثبت شد', 'success');
    } else {
      closeTxModal();
      showToast('انتقال بین حساب‌ها ثبت شد (دمو)', 'info');
    }
  }

  /* ---------- مودال ویرایش درآمد/بودجه ---------- */
  var modalTarget = null; // 'income' | 'budget'

  function openEditModal(target) {
    modalTarget = target;
    var modal = qs('#editModal');
    var titleEl = qs('#modalTitle');
    var valueEl = qs('#modalValue');
    var finance = store.getFinance();

    titleEl.textContent = target === 'income' ? 'ویرایش درآمد ماه' : 'ویرایش بودجه‌ی ماه';
    valueEl.value = target === 'income' ? finance.income : finance.budget;

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    valueEl.focus();
    valueEl.select();
  }

  function closeEditModal() {
    qs('#editModal').classList.remove('show');
    qs('#editModal').setAttribute('aria-hidden', 'true');
    modalTarget = null;
  }

  function initEditModal() {
    qs('#editIncomeBtn').addEventListener('click', function () { openEditModal('income'); });
    qs('#editBudgetBtn').addEventListener('click', function () { openEditModal('budget'); });

    qs('#modalCancel').addEventListener('click', closeEditModal);

    qs('#modalSave').addEventListener('click', function () {
      var val = Number(qs('#modalValue').value);
      if (isNaN(val) || val < 0) {
        showToast('مبلغ معتبر وارد کنید', 'danger');
        return;
      }
      var finance = store.getFinance();
      if (modalTarget === 'income') finance.income = val;
      else finance.budget = val;
      store.saveFinance(finance);

      closeEditModal();
      renderAll();
      showToast('ذخیره شد', 'success');
    });

    // بستن با کلیک روی پس‌زمینه
    qs('#editModal').addEventListener('click', function (e) {
      if (e.target === this) closeEditModal();
    });
  }

  /* ---------- بستن مودال با Escape و بستن دراپ‌دان با کلیک بیرون ---------- */
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Escape') {
      if (qs('#catSelect').classList.contains('open')) closeCatDropdowns();
      else if (txModal().classList.contains('show')) closeTxModal();
      else if (qs('#editModal').classList.contains('show')) closeEditModal();
    }
  });

  document.addEventListener('click', function (e) {
    var wrap = qs('#catSelect');
    if (wrap && !wrap.contains(e.target)) closeCatDropdowns();
  });

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    renderAll();
    initTable();
    initTxModal();
    initEditModal();
  });
})();
