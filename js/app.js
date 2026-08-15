/* ==========================================================================
   رشد من — app.js
   منطق داشبورد اصلی. همه‌ی داده‌ها از RGMStore (localStorage) خوانده
   می‌شوند و هر تغییری پایدار است.

   Table of contents:
   1. Helpers
   2. Sidebar Toggle (mobile off-canvas)
   3. Top Menu / Sidebar Active State
   4. Notification Button
   5. Progress Bars Animation (IntersectionObserver)
   6. Today's Checklist (toggle / add / delete) — از store
   7. Goals (render / add / remove) — از store
   8. Finance Summary Card — از store
   9. Expense Doughnut Chart (Chart.js) — از store
   10. Weekly Progress Line Chart (Chart.js)
   11. Calendar Render + Navigation
   12. Toasts
   13. Init
   ========================================================================== */

(function () {
  'use strict';

  var store = window.RGMStore;
  var toFa = store.toFa;
  var formatToman = store.formatToman;

  /* ========================================================================
     1. HELPERS
     ==================================================================== */
  function qs(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function qsa(sel, ctx) {
    return Array.from((ctx || document).querySelectorAll(sel));
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  /* ========================================================================
     2. SIDEBAR TOGGLE (mobile off-canvas)
     ==================================================================== */
  function initSidebarToggle() {
    var sidebar = qs('#sidebar');
    var toggleBtn = qs('#sidebarToggle');
    var backdrop = qs('#sidebarBackdrop');

    if (!sidebar || !toggleBtn || !backdrop) return;

    // اگر سایدبار توسط آف‌کانواس بوت‌استرپ (کلاس offcanvas) مدیریت می‌شود،
    // هندلر سفارشی را اجرا نکن تا دو مکانیسم هم‌زمان تداخل نکنند.
    if (window.bootstrap && sidebar.classList.contains('offcanvas')) return;

    function openSidebar() {
      sidebar.classList.add('open');
      backdrop.classList.add('show');
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      backdrop.classList.remove('show');
    }

    toggleBtn.addEventListener('click', function () {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });

    backdrop.addEventListener('click', closeSidebar);

    qsa('.sidebar-item', sidebar).forEach(function (item) {
      item.addEventListener('click', function () {
        if (window.innerWidth <= 992) closeSidebar();
      });
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 992) closeSidebar();
    });
  }


  /* ========================================================================
     3. TOP MENU / SIDEBAR ACTIVE STATE
     ==================================================================== */
  function initActiveMenus() {
    var allNavItems = qsa('.menu-pill, .sidebar-item');

    allNavItems.forEach(function (el) {
      el.addEventListener('click', function (e) {
        var href = el.getAttribute('href');
        var isRealLink = href && href !== '#';
        if (!isRealLink) e.preventDefault();

        var page = el.dataset.page;
        allNavItems.forEach(function (other) {
          if (other.dataset.page === page) {
            other.classList.add('active');
          } else {
            other.classList.remove('active');
          }
        });
      });
    });
  }


  /* ========================================================================
     4. NOTIFICATION BUTTON
     ==================================================================== */
  function initNotifButton() {
    var btn = qs('#notifBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var dot = qs('.notif-dot', btn);
      if (dot) {
        dot.style.transform = 'scale(0)';
        setTimeout(function () {
          dot.style.opacity = '0';
        }, 200);
      }
    });
  }


  /* ========================================================================
     5. PROGRESS BARS ANIMATION
     ==================================================================== */
  function animateProgressBars() {
    var bars = qsa('[data-width]');
    if (!('IntersectionObserver' in window)) {
      bars.forEach(function (el) { el.style.width = el.dataset.width + '%'; });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var el = entry.target;
            var width = el.dataset.width;
            requestAnimationFrame(function () {
              el.style.width = width + '%';
            });
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.2 }
    );

    bars.forEach(function (bar) { observer.observe(bar); });
  }


  /* ========================================================================
     6. TODAY'S CHECKLIST — مستقیماً از store.getTasks() (همان منبع صفحه تسک‌ها)
        تغییر وضعیت / حذف در اینجا هم روی صفحه تسک‌ها منعکس می‌شود.
     ==================================================================== */

  function isTaskDone(task) {
    return task.status === 'completed';
  }

  function renderTodayList() {
    var list = qs('#taskList');
    if (!list) return;

    var tasks = store.getTasks();
    // فقط آخرین ۸ تسک رو نشون بده (مثل قبل)
    var items = tasks.slice(0, 8);

    if (items.length === 0) {
      list.innerHTML = '<li class="task-item" style="justify-content:center;color:var(--text-secondary);">تسکی وجود ندارد</li>';
      updateTasksStat();
      return;
    }

    list.innerHTML = items.map(function (task) {
      var done = isTaskDone(task);
      return (
        '<li class="task-item ' + (done ? 'completed' : '') + '" data-id="' + task.id + '">' +
          '<div class="task-check" role="checkbox" aria-checked="' + done + '" aria-label="انجام شد: ' + escapeHtml(task.title) + '" tabindex="0">' +
            (done ? '<i class="fa-solid fa-check"></i>' : '') +
          '</div>' +
          '<span class="task-name">' + escapeHtml(task.title) + '</span>' +
          '<span class="task-time">' + escapeHtml(task.date) + '</span>' +
          '<button class="item-delete-btn" type="button" data-action="delete-today" aria-label="حذف ' + escapeHtml(task.title) + '">' +
            '<i class="fa-regular fa-trash-can"></i>' +
          '</button>' +
        '</li>'
      );
    }).join('');

    // toggle checkbox (completed ↔ pending)
    qsa('.task-check', list).forEach(function (checkEl) {
      checkEl.addEventListener('click', function () { toggleTodayItem(checkEl); });
      checkEl.addEventListener('keypress', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTodayItem(checkEl); }
      });
    });

    // delete
    qsa('[data-action="delete-today"]', list).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var li = btn.closest('.task-item');
        deleteTodayItem(Number(li.dataset.id));
      });
    });

    updateTasksStat();
  }

  function toggleTodayItem(checkEl) {
    var li = checkEl.closest('.task-item');
    var id = Number(li.dataset.id);
    var tasks = store.getTasks();
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;

    // فقط completed و pending رو سوییچ کن
    if (task.status === 'completed') {
      task.status = 'pending';
    } else {
      task.status = 'completed';
    }
    store.saveTasks(tasks);

    var done = isTaskDone(task);
    li.classList.toggle('completed', done);
    checkEl.setAttribute('aria-checked', done);
    checkEl.innerHTML = done ? '<i class="fa-solid fa-check"></i>' : '';
    updateTasksStat();
  }

  function deleteTodayItem(id) {
    var tasks = store.getTasks().filter(function (t) { return t.id !== id; });
    store.saveTasks(tasks);
    renderTodayList();
    showToast('تسک حذف شد', 'danger');
  }

  function initAddTodayForm() {
    var form = qs('#addTodayForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nameInput = qs('#todayName', form);
      var timeInput = qs('#todayTime', form);
      var name = nameInput.value.trim();
      var date = timeInput.value.trim() || 'بدون تاریخ';

      if (!name) {
        nameInput.focus();
        return;
      }

      var tasks = store.getTasks();
      tasks.unshift({
        id: store.nextTaskId(),
        title: name,
        category: 'شخصی',
        priority: 'متوسط',
        date: date,
        status: 'pending'
      });
      store.saveTasks(tasks);

      form.reset();
      renderTodayList();
      showToast('تسک جدید اضافه شد', 'success');
    });
  }

  function updateTasksStat() {
    var tasks = store.getTasks();
    var done = tasks.filter(function (t) { return isTaskDone(t); }).length;
    var remaining = tasks.length - done;

    var numEl = qs('#statTasksNum');
    var subEl = qs('#statTasksSub');
    var barEl = qs('#statTasksBar');
    var footEl = qs('#statTasksFoot');

    if (numEl) numEl.textContent = toFa(remaining);
    if (subEl) subEl.textContent = 'تسک باقی‌مانده';
    if (footEl) footEl.textContent = toFa(done) + ' از ' + toFa(tasks.length) + ' تسک انجام شده';
    if (barEl) {
      var pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
      barEl.dataset.width = pct;
      barEl.style.width = pct + '%';
    }
  }


  /* ========================================================================
     7. GOALS (render / add / remove) — از store
     ==================================================================== */
  function renderGoals() {
    var list = qs('#goalList');
    if (!list) return;

    var goals = store.getGoals();
    list.innerHTML = goals.map(function (goal) {
      var pct = goal.total > 0 ? Math.min(100, Math.round((goal.current / goal.total) * 100)) : 0;
      return (
        '<li class="goal-item" data-id="' + goal.id + '">' +
          '<div class="goal-item-top">' +
            '<span class="goal-name">' + escapeHtml(goal.name) + '</span>' +
            '<span class="goal-fraction">' + toFa(goal.current) + ' از ' + toFa(goal.total) + '</span>' +
          '</div>' +
          '<div class="goal-bar">' +
            '<div class="goal-bar-fill" data-width="' + pct + '"></div>' +
          '</div>' +
          '<div class="goal-actions">' +
            '<button class="goal-step-btn" type="button" data-action="goal-dec" aria-label="کاهش پیشرفت" title="کاهش">−</button>' +
            '<button class="goal-step-btn" type="button" data-action="goal-inc" aria-label="افزایش پیشرفت" title="افزایش">+</button>' +
            '<button class="goal-del-btn" type="button" data-action="goal-del" aria-label="حذف هدف" title="حذف هدف"><i class="fa-regular fa-trash-can"></i></button>' +
          '</div>' +
        '</li>'
      );
    }).join('');

    // animate freshly-rendered bars
    list.querySelectorAll('.goal-bar-fill').forEach(function (el) {
      requestAnimationFrame(function () { el.style.width = el.dataset.width + '%'; });
    });

    // wire actions
    list.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var li = btn.closest('.goal-item');
        var id = Number(li.dataset.id);
        var action = btn.dataset.action;
        handleGoalAction(id, action);
      });
    });
  }

  function handleGoalAction(id, action) {
    var goals = store.getGoals();
    var goal = goals.find(function (g) { return g.id === id; });
    if (!goal) return;

    if (action === 'goal-inc') {
      goal.current = Math.min(goal.total, goal.current + 1);
    } else if (action === 'goal-dec') {
      goal.current = Math.max(0, goal.current - 1);
    } else if (action === 'goal-del') {
      goals = goals.filter(function (g) { return g.id !== id; });
    }

    store.saveGoals(goals);
    renderGoals();
  }

  function initAddGoalForm() {
    var form = qs('#addGoalForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nameInput = qs('#goalName', form);
      var currentInput = qs('#goalCurrent', form);
      var totalInput = qs('#goalTotal', form);

      var name = nameInput.value.trim();
      var current = Number(currentInput.value);
      var total = Number(totalInput.value);

      if (!name || !total || total <= 0) {
        nameInput.focus();
        return;
      }

      var goals = store.getGoals();
      goals.push({
        id: store.nextGoalId(),
        name: name,
        current: isNaN(current) ? 0 : Math.max(0, current),
        total: total
      });
      store.saveGoals(goals);

      form.reset();
      renderGoals();
      showToast('هدف جدید اضافه شد', 'success');
    });
  }


  /* ========================================================================
     8. FINANCE SUMMARY CARD — از store
     ==================================================================== */
  function updateFinanceStat() {
    var finance = store.getFinance();
    var spent = store.totalExpenses();
    var balance = finance.income - spent;
    var pct = finance.budget > 0 ? Math.min(100, Math.round((spent / finance.budget) * 100)) : 0;

    var incEl = qs('#statIncome');
    var expEl = qs('#statExpense');
    var balEl = qs('#statBalance');
    var barEl = qs('#statFinanceBar');
    var footEl = qs('#statFinanceFoot');

    if (incEl) incEl.textContent = formatToman(finance.income);
    if (expEl) expEl.textContent = formatToman(spent);
    if (balEl) {
      balEl.textContent = formatToman(balance);
      balEl.className = 'finance-value ' + (balance >= 0 ? 'finance-value--main' : 'finance-value--neg');
    }
    if (footEl) footEl.textContent = toFa(pct) + '٪ از بودجه مصرف شده';
    if (barEl) {
      barEl.dataset.width = pct;
      barEl.style.width = pct + '%';
    }
  }


  /* ========================================================================
     9. EXPENSE DOUGHNUT CHART — از store
     ==================================================================== */
  var expenseChart = null;

  function renderExpenseChart() {
    var canvas = qs('#expenseChart');
    var legendEl = qs('#expenseLegend');
    if (!canvas || typeof Chart === 'undefined') return;

    var expenses = store.getExpenses();
    var labels = expenses.map(function (e) { return e.label; });
    var values = expenses.map(function (e) { return e.value; });
    var colors = expenses.map(function (e) { return e.color; });

    if (expenseChart) {
      expenseChart.data.labels = labels;
      expenseChart.data.datasets[0].data = values;
      expenseChart.data.datasets[0].backgroundColor = colors;
      expenseChart.update();
    } else {
      expenseChart = new Chart(canvas.getContext('2d'), {
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
              callbacks: {
                label: function (ctx) { return ' ' + formatToman(ctx.raw) + ' تومان'; }
              }
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
              '<span class="label">' + escapeHtml(e.label) + '</span>' +
            '</span>' +
            '<span class="legend-value">' + formatToman(e.value) + '</span>' +
          '</li>'
        );
      }).join('');
    }
  }


  /* ========================================================================
     10. WEEKLY PROGRESS LINE CHART
     ==================================================================== */
  var weeklyChart = null;

  function renderWeeklyChart() {
    var canvas = qs('#weeklyChart');
    if (!canvas || typeof Chart === 'undefined') return;

    var wp = store.getWeeklyProgress();
    var primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#7C5CFC';
    var ctx = canvas.getContext('2d');

    var gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(124, 92, 252, 0.28)');
    gradient.addColorStop(1, 'rgba(124, 92, 252, 0)');

    if (weeklyChart) {
      weeklyChart.data.labels = wp.labels;
      weeklyChart.data.datasets[0].data = wp.values;
      weeklyChart.update();
    } else {
      weeklyChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: wp.labels,
          datasets: [{
            data: wp.values,
            borderColor: primary,
            borderWidth: 3,
            fill: true,
            backgroundColor: gradient,
            tension: 0.45,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: primary,
            pointHoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              rtl: true,
              titleFont: { family: 'Vazirmatn' },
              bodyFont: { family: 'Vazirmatn' },
              callbacks: {
                label: function (ctx) { return ' ' + toFa(ctx.raw) + '٪ پیشرفت'; }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { family: 'Vazirmatn', size: 11.5 }, color: '#7D8198' }
            },
            y: {
              display: true,
              min: 0,
              max: 100,
              grid: { color: '#F1F1FA' },
              border: { display: false },
              ticks: {
                stepSize: 25,
                font: { family: 'Vazirmatn', size: 11 },
                color: '#7D8198',
                callback: function (val) { return toFa(val) + '٪'; }
              }
            }
          }
        }
      });
    }
  }


  /* ========================================================================
     11. CALENDAR (داشبورد)
     تقویم نمایشی قدیمی حذف شد؛ ویجت تقویم شمسی مشترک در js/jalali.js است
     و در init فقط یک نمونه از آن ساخته می‌شود (منحصراً در داشبورد).
     ==================================================================== */


  /* ========================================================================
     12. TOASTS
     ==================================================================== */
  function showToast(message, type) {
    var stack = qs('#toastStack');
    if (!stack) return;

    var icon = type === 'danger' ? 'fa-circle-xmark' : type === 'info' ? 'fa-circle-info' : 'fa-circle-check';
    var el = document.createElement('div');
    el.className = 'toast-item' + (type === 'danger' ? ' toast-danger' : '');
    el.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + escapeHtml(message) + '</span>';
    stack.appendChild(el);

    setTimeout(function () {
      el.classList.add('leaving');
      setTimeout(function () { el.remove(); }, 300);
    }, 2600);
  }


  /* ========================================================================
     13. INIT
     ==================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    initSidebarToggle();
    initActiveMenus();
    initNotifButton();

    // today's checklist
    renderTodayList();
    initAddTodayForm();

    // goals
    renderGoals();
    initAddGoalForm();

    // finance + charts
    updateFinanceStat();
    renderExpenseChart();
    renderWeeklyChart();

    // calendar (فقط در داشبورد؛ صفحه تسک‌ها تقویم خودش را در tasks.js دارد)
    if (qs('.greeting-section')) {
      Jalali.createCalendar({
        gridSel: '#calendarGrid',
        monthLabelSel: '#calMonthLabel',
        prevSel: '#calPrev',
        nextSel: '#calNext',
        renderDow: true,
        leading: 'muted'
      });
    }

    // animate progress bars after data is in the DOM
    animateProgressBars();
  });

  // expose for shared pages (reports/finance) that may reuse helpers
  window.RGMApp = {
    qs: qs,
    qsa: qsa,
    escapeHtml: escapeHtml,
    showToast: showToast,
    renderExpenseChart: renderExpenseChart,
    renderWeeklyChart: renderWeeklyChart,
    renderGoals: renderGoals,
    initAddGoalForm: initAddGoalForm,
    updateFinanceStat: updateFinanceStat,
    initSidebarToggle: initSidebarToggle,
    initActiveMenus: initActiveMenus,
    initNotifButton: initNotifButton,
    animateProgressBars: animateProgressBars
  };
})();
