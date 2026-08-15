/* ==========================================================================
   تسک‌ها — tasks.js
   همه‌ی تسک‌ها از RGMStore (localStorage) می‌خوانده می‌شوند و افزودن،
   ویرایش inline، حذف و کپی همگی پایدار هستند.

   Table of contents:
   1. Helpers / constants
   2. State
   3. Task Row Rendering (+ edit mode)
   4. Filtering / Search / Tabs
   5. Load More
   6. Custom Dropdown Filters
   7. Task Row Interactions (status toggle, menu, delete, duplicate)
   8. Inline Edit Mode
   9. Create Task Form
   10. Toasts
   11. Init
   ========================================================================== */

(function () {
  'use strict';

  var store = window.RGMStore;
  var toFa = store.toFa;
  var Jalali = window.Jalali;

  /* ========================================================================
     1. HELPERS / CONSTANTS
     ==================================================================== */
  var STATUS_LABEL = {
    completed: 'انجام شده',
    'in-progress': 'در حال انجام',
    pending: 'انجام نشده',
    overdue: 'به تعویق افتاده',
    cancelled: 'لغو شده'
  };

  var STATUS_ICON = {
    completed: '<i class="fa-solid fa-check"></i>',
    'in-progress': '<i class="fa-solid fa-rotate"></i>',
    pending: '',
    overdue: '<i class="fa-regular fa-clock"></i>',
    cancelled: '<i class="fa-solid fa-xmark"></i>'
  };

  var CATEGORIES = ['شخصی', 'کاری', 'یادگیری', 'سلامتی'];
  var PRIORITIES = ['بالا', 'متوسط', 'پایین'];

  var timerTickInterval = null;

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* توابع تاریخ شمسی (الگوریتم jalaali، قالب‌بندی، نرمال‌سازی ورودی و ویجت
     تقویم) همگی در js/jalali.js متمرکز شده‌اند؛ در این صفحه فقط از Jalali.*
     استفاده می‌شود. */

  function priorityDotClass(priority) {
    if (priority === 'بالا') return 'priority-dot--red';
    if (priority === 'متوسط') return 'priority-dot--orange';
    return 'priority-dot--green';
  }

  /* ----- تایمر هر تسک ----- */
  function ensureTimerFields(task) {
    if (typeof task.timeSpent !== 'number') task.timeSpent = 0;
    if (task.timerStartedAt === undefined) task.timerStartedAt = null;
    return task;
  }

  function getElapsedSeconds(task) {
    var base = task.timeSpent || 0;
    if (task.timerStartedAt) {
      base += (Date.now() - task.timerStartedAt) / 1000;
    }
    return Math.max(0, Math.floor(base));
  }

  function formatDuration(totalSeconds) {
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;
    var pad = function (n) { return toFa(n < 10 ? '0' + n : String(n)); };
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function injectTimerStyles() {
    if (document.getElementById('rgm-timer-styles')) return;
    var style = document.createElement('style');
    style.id = 'rgm-timer-styles';
    style.textContent =
      '.task-timer{display:flex;align-items:center;gap:6px;margin-top:6px;direction:ltr;}' +
      '.task-timer-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;' +
        'border-radius:50%;border:1px solid rgba(124,92,252,0.3);background:#fff;color:var(--primary,#7C5CFC);' +
        'cursor:pointer;font-size:.68rem;transition:all .15s ease;padding:0;flex-shrink:0;}' +
      '.task-timer-btn:hover{background:rgba(124,92,252,0.08);}' +
      '.task-timer-btn.running{background:var(--primary,#7C5CFC);color:#fff;border-color:var(--primary,#7C5CFC);}' +
      '.task-timer-reset{color:#9295a6;border-color:rgba(146,149,166,0.35);}' +
      '.task-timer-reset:hover{background:rgba(146,149,166,0.12);}' +
      '.task-timer-display{font-variant-numeric:tabular-nums;font-size:.78rem;color:#6b7280;min-width:66px;' +
        'text-align:center;direction:ltr;}' +
      '.task-timer.running .task-timer-display{color:var(--primary,#7C5CFC);font-weight:600;}';
    document.head.appendChild(style);
  }
  injectTimerStyles();


  /* ========================================================================
     2. STATE
     ==================================================================== */
  var state = {
    category: 'all',
    priority: 'all',
    status: 'all',
    tab: 'all',
    search: '',
    visibleCount: 6,
    editingId: null, // id تسکی که در حال ویرایش inline است
    expandedIds: [], // id تسک‌هایی که بخش زیرمجموعه‌شان باز است
    editingSub: null, // { taskId, subId } زیرمجموعه‌ای که در حال ویرایش inline است
    selectedDate: null // تاریخ انتخاب‌شده در تقویم (null = همه)
  };


  /* ========================================================================
     3. TASK ROW RENDERING
     3.b STATE / EXPANSION HELPERS
     ==================================================================== */
  function taskHasSubtaskOnDate(task, dateStr) {
    return Array.isArray(task.subtasks) &&
      task.subtasks.some(function (s) { return s.date === dateStr; });
  }

  /* وقتی تاریخِ یک زیرمجموعه با روز انتخاب‌شده یکی باشد، تسک باز نشان داده می‌شود */
  function isRowExpanded(task) {
    if (state.expandedIds.indexOf(task.id) !== -1) return true;
    return !!state.selectedDate && task.date !== state.selectedDate &&
      taskHasSubtaskOnDate(task, state.selectedDate);
  }

  function buildRow(task) {
    ensureSubtaskFields(task);
    var expanded = isRowExpanded(task);
    var hasSubs = task.subtasks && task.subtasks.length > 0;

    var rowClass = 'task-row status-' + task.status +
      (state.editingId === task.id ? ' editing' : '') +
      (expanded ? ' expanded' : '') +
      (hasSubs ? ' has-subtasks' : '');

    var row =
      '<div class="' + rowClass + '" data-id="' + task.id + '">' +
        buildStatusIcon(task) +
        buildMenu(task) +
        buildInfo(task) +
        buildPriority(task) +
        buildDateStatus(task) +
        buildDropdownToggle(task, expanded, hasSubs) +
        buildSelect(task) +
      '</div>';

    var subs = (hasSubs || expanded) ? buildSubtasks(task) : '';

    return (
      '<div class="task-row-wrapper" data-id="' + task.id + '">' +
        row +
        subs +
      '</div>'
    );
  }

  function buildStatusIcon(task) {
    return (
      '<div class="task-status-icon status-' + task.status + '" data-action="toggle-status" title="تغییر وضعیت" role="button" aria-label="تغییر وضعیت تسک">' +
        STATUS_ICON[task.status] +
      '</div>'
    );
  }

  function buildMenu(task) {
    return (
      '<div class="task-menu">' +
        '<button class="task-menu-btn" type="button" data-action="toggle-menu" aria-label="گزینه‌های تسک">' +
          '<i class="fa-solid fa-ellipsis"></i>' +
        '</button>' +
        '<div class="task-menu-dropdown">' +
          '<button type="button" data-action="toggle-subtasks"><i class="fa-solid fa-list-check"></i> زیرمجموعه‌ها</button>' +
          '<button type="button" data-action="edit"><i class="fa-regular fa-pen-to-square"></i> ویرایش</button>' +
          '<button type="button" data-action="duplicate"><i class="fa-regular fa-copy"></i> کپی تسک</button>' +
          '<button type="button" class="danger" data-action="delete"><i class="fa-regular fa-trash-can"></i> حذف</button>' +
        '</div>' +
      '</div>'
    );
  }

  function buildInfo(task) {
    if (state.editingId === task.id) {
      return (
        '<div class="task-info">' +
          '<input class="inline-edit-input inline-edit-title" type="text" value="' + escapeHtml(task.title) + '" data-field="title" aria-label="عنوان تسک" placeholder="عنوان">' +
          '<select class="inline-edit-input inline-edit-select" data-field="category" aria-label="دسته‌بندی">' +
            CATEGORIES.map(function (c) {
              return '<option value="' + c + '"' + (c === task.category ? ' selected' : '') + '>' + c + '</option>';
            }).join('') +
          '</select>' +
        '</div>'
      );
    }
    return (
      '<div class="task-info">' +
        '<div class="task-title">' + escapeHtml(task.title) + '</div>' +
        '<div class="task-category">' + escapeHtml(task.category) +
          buildSubtaskBadge(task) +
        '</div>' +
      '</div>'
    );
  }

  function buildSubtaskBadge(task) {
    if (!task.subtasks || task.subtasks.length === 0) return '';
    var done = task.subtasks.filter(function (s) { return s.status === 'completed'; }).length;
    var expanded = isRowExpanded(task);
    var label = (expanded ? 'بستن' : 'باز کردن') + ' زیرمجموعه‌ها';
    return ' <button class="subtask-count-badge' + (expanded ? ' open' : '') + '" type="button" data-action="toggle-subtasks" ' +
      'aria-expanded="' + expanded + '" aria-label="' + label + ' (' + toFa(done) + ' از ' + toFa(task.subtasks.length) + ' انجام شده)">' +
      '<i class="fa-solid fa-list-check" aria-hidden="true"></i> ' +
      toFa(done) + '/' + toFa(task.subtasks.length) +
      '<i class="fa-solid fa-chevron-down subtask-badge-chevron" aria-hidden="true"></i>' +
    '</button>';
  }

  /* دکمه‌ی دراپ‌داون (فلش) برای تسک‌های دارای زیرمجموعه */
  function buildDropdownToggle(task, expanded, hasSubs) {
    if (!hasSubs && !expanded) return '';
    var label = (expanded ? 'بستن' : 'باز کردن') + ' زیرمجموعه‌ها';
    return (
      '<button class="task-dropdown-btn' + (expanded ? ' open' : '') + '" type="button" data-action="toggle-subtasks" ' +
        'aria-expanded="' + expanded + '" aria-label="' + label + '" title="' + label + '">' +
        '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>' +
      '</button>'
    );
  }

  function buildPriority(task) {
    if (state.editingId === task.id) {
      return (
        '<select class="inline-edit-input inline-edit-select inline-edit-priority" data-field="priority" aria-label="اولویت">' +
          PRIORITIES.map(function (p) {
            return '<option value="' + p + '"' + (p === task.priority ? ' selected' : '') + '>' + p + '</option>';
          }).join('') +
        '</select>'
      );
    }
    return (
      '<div class="task-priority">' +
        '<span>' + escapeHtml(task.priority) + '</span>' +
        '<span class="priority-dot ' + priorityDotClass(task.priority) + '"></span>' +
      '</div>'
    );
  }

  function buildDateStatus(task) {
    if (state.editingId === task.id) {
      return (
        '<div class="task-date-status">' +
          '<input class="inline-edit-input inline-edit-date" type="text" value="' + escapeHtml(task.date) + '" data-field="date" aria-label="تاریخ سررسید" placeholder="تاریخ">' +
          '<div class="inline-edit-actions">' +
            '<button class="inline-save" type="button" data-action="save-edit" aria-label="ذخیره ویرایش"><i class="fa-solid fa-check"></i></button>' +
            '<button class="inline-cancel" type="button" data-action="cancel-edit" aria-label="لغو ویرایش"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
        '</div>'
      );
    }
    return (
      '<div class="task-date-status">' +
        '<span>' + escapeHtml(task.date) + '</span>' +
        '<span class="task-status-label status-' + task.status + '">' + STATUS_LABEL[task.status] + '</span>' +
        buildTimer(task) +
      '</div>'
    );
  }

  function buildTimer(task) {
    ensureTimerFields(task);
    var running = !!task.timerStartedAt;
    return (
      '<div class="task-timer' + (running ? ' running' : '') + '">' +
        '<button type="button" class="task-timer-btn' + (running ? ' running' : '') + '" data-action="toggle-timer" ' +
          'aria-label="' + (running ? 'توقف تایمر' : 'شروع تایمر') + '" title="' + (running ? 'توقف تایمر' : 'شروع تایمر') + '">' +
          '<i class="fa-solid ' + (running ? 'fa-pause' : 'fa-play') + '" aria-hidden="true"></i>' +
        '</button>' +
        '<span class="task-timer-display" data-timer-display>' + formatDuration(getElapsedSeconds(task)) + '</span>' +
        '<button type="button" class="task-timer-btn task-timer-reset" data-action="reset-timer" ' +
          'aria-label="ریست تایمر" title="ریست تایمر">' +
          '<i class="fa-solid fa-rotate-left" aria-hidden="true"></i>' +
        '</button>' +
      '</div>'
    );
  }

  function buildSelect(task) {
    return '<div class="task-select" data-action="select" role="checkbox" aria-checked="false" tabindex="0"></div>';
  }

  /* ========================================================================
     3.b SUBTASKS RENDERING
     ==================================================================== */
  function ensureSubtaskFields(task) {
    if (!Array.isArray(task.subtasks)) task.subtasks = [];
    return task;
  }

  function buildSubtasks(task) {
    ensureSubtaskFields(task);
    var expanded = isRowExpanded(task);
    if (!expanded) return '';

    var subs = task.subtasks;
    // وقتی فیلتر تاریخ فعال است و تاریخِ خودِ تسک با روز انتخاب‌شده یکی نیست،
    // فقط زیرمجموعه‌هایی که تاریخ‌شان با روز انتخاب‌شده یکی است نشان داده می‌شوند
    var dateFiltered = !!state.selectedDate && task.date !== state.selectedDate;
    if (dateFiltered) {
      subs = subs.filter(function (s) { return s.date === state.selectedDate; });
    }

    var list = subs.length
      ? '<div class="subtask-list">' + subs.map(function (s) { return buildSubtaskRow(task.id, s); }).join('') + '</div>'
      : '<div class="subtask-empty"><i class="fa-regular fa-square-plus" aria-hidden="true"></i> هنوز زیرمجموعه‌ای ثبت نشده</div>';

    return (
      '<div class="task-subtasks">' +
        '<div class="subtasks-head"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ' +
          (dateFiltered ? 'زیرمجموعه‌های ' + state.selectedDate : 'زیرمجموعه‌ها') +
        '</div>' +
        list +
        buildSubtaskForm(task.id) +
      '</div>'
    );
  }

  function buildSubtaskRow(taskId, sub) {
    var done = sub.status === 'completed';
    var editing = state.editingSub && state.editingSub.taskId === taskId && state.editingSub.subId === sub.id;

    if (editing) {
      return (
        '<div class="subtask-row editing" data-sub-id="' + sub.id + '">' +
          '<div class="subtask-edit-fields">' +
            '<input class="subtask-edit-input" type="text" data-field="title" value="' + escapeHtml(sub.title) + '" placeholder="عنوان زیرمجموعه" aria-label="عنوان زیرمجموعه">' +
            '<select class="subtask-edit-select" data-field="category" aria-label="دسته‌بندی">' +
              CATEGORIES.map(function (c) {
                return '<option value="' + c + '"' + (c === sub.category ? ' selected' : '') + '>' + c + '</option>';
              }).join('') +
            '</select>' +
            '<select class="subtask-edit-select" data-field="priority" aria-label="اولویت">' +
              PRIORITIES.map(function (p) {
                return '<option value="' + p + '"' + (p === sub.priority ? ' selected' : '') + '>' + p + '</option>';
              }).join('') +
            '</select>' +
            '<input class="subtask-edit-input subtask-edit-date" type="text" data-field="date" value="' + escapeHtml(sub.date) + '" placeholder="تاریخ" aria-label="تاریخ">' +
            '<button class="subtask-action-btn save" type="button" data-action="save-subtask" aria-label="ذخیره"><i class="fa-solid fa-check" aria-hidden="true"></i></button>' +
            '<button class="subtask-action-btn cancel" type="button" data-action="cancel-subtask" aria-label="لغو"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
          '</div>' +
        '</div>'
      );
    }

    return (
      '<div class="subtask-row' + (done ? ' completed' : '') + '" data-sub-id="' + sub.id + '">' +
        '<div class="subtask-check" data-action="toggle-subtask" role="checkbox" aria-checked="' + done + '" tabindex="0" aria-label="انجام شد: ' + escapeHtml(sub.title) + '">' +
          (done ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : '') +
        '</div>' +
        '<span class="subtask-title">' + escapeHtml(sub.title) + '</span>' +
        '<span class="subtask-meta">' +
          '<span class="subtask-badge">' + escapeHtml(sub.category) + '</span>' +
          '<span class="subtask-priority">' +
            '<span class="priority-dot ' + priorityDotClass(sub.priority) + '"></span>' +
            escapeHtml(sub.priority) +
          '</span>' +
          '<span class="subtask-date">' + escapeHtml(sub.date) + '</span>' +
        '</span>' +
        '<div class="subtask-actions">' +
          '<button class="subtask-action-btn" type="button" data-action="edit-subtask" aria-label="ویرایش زیرمجموعه"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i></button>' +
          '<button class="subtask-action-btn danger" type="button" data-action="delete-subtask" aria-label="حذف زیرمجموعه"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>' +
        '</div>' +
      '</div>'
    );
  }

  function buildSubtaskForm(taskId) {
    return (
      '<form class="subtask-form" data-task-id="' + taskId + '">' +
        '<input class="subtask-form-input" type="text" name="title" placeholder="افزودن زیرمجموعه..." aria-label="عنوان زیرمجموعه">' +
        '<select class="subtask-form-select" name="category" aria-label="دسته‌بندی زیرمجموعه">' +
          CATEGORIES.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('') +
        '</select>' +
        '<select class="subtask-form-select" name="priority" aria-label="اولویت زیرمجموعه">' +
          PRIORITIES.map(function (p) { return '<option value="' + p + '"' + (p === 'متوسط' ? ' selected' : '') + '>' + p + '</option>'; }).join('') +
        '</select>' +
        '<input class="subtask-form-input subtask-form-date" type="text" name="date" value="' + (state.selectedDate || Jalali.todayString()) + '" aria-label="تاریخ زیرمجموعه">' +
        '<button class="subtask-add-btn" type="submit"><i class="fa-solid fa-plus" aria-hidden="true"></i> افزودن</button>' +
      '</form>'
    );
  }

  function nextSubId(task) {
    ensureSubtaskFields(task);
    var max = 0;
    task.subtasks.forEach(function (s) { if (s.id > max) max = s.id; });
    return max + 1;
  }

  function getFilteredTasks() {
    return store.getTasks().filter(function (task) {
      if (state.category !== 'all' && task.category !== state.category) return false;
      if (state.priority !== 'all' && task.priority !== state.priority) return false;
      if (state.status !== 'all' && task.status !== state.status) return false;
      if (state.tab !== 'all' && task.status !== state.tab) return false;
      if (state.selectedDate &&
          task.date !== state.selectedDate &&
          !taskHasSubtaskOnDate(task, state.selectedDate)) return false;
      if (state.search && task.title.toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
      return true;
    });
  }

  function renderRows() {
    var container = qs('#taskRows');
    var loadMoreBtn = qs('#loadMoreBtn');
    if (!container) return;

    var filtered = getFilteredTasks();
    var visible = filtered.slice(0, state.visibleCount);

    if (filtered.length === 0) {
      container.innerHTML =
        '<div class="task-empty-state">' +
          '<i class="fa-regular fa-folder-open"></i>' +
          '<p>هیچ تسکی با این فیلترها پیدا نشد</p>' +
        '</div>';
    } else {
      container.innerHTML = visible.map(buildRow).join('');
    }

    if (loadMoreBtn) {
      loadMoreBtn.classList.toggle('hidden', visible.length >= filtered.length);
    }

    updateTabCounts();

    // اگر در حالت ویرایشیم، روی فیلد عنوان فوکوس کن
    if (state.editingId !== null) {
      var titleInput = container.querySelector('.inline-edit-title');
      if (titleInput) {
        titleInput.focus();
        titleInput.select();
      }
    }

    // فوکوس روی فیلد ویرایش زیرمجموعه
    if (state.editingSub) {
      var subInput = container.querySelector('.subtask-row.editing .subtask-edit-input[data-field="title"]');
      if (subInput) {
        subInput.focus();
        subInput.select();
      }
    }
  }

  function updateTabCounts() {
    var counts = { completed: 0, 'in-progress': 0, cancelled: 0, overdue: 0, pending: 0 };
    store.getTasks().forEach(function (t) {
      if (counts[t.status] !== undefined) counts[t.status]++;
    });

    var map = {
      countCompleted: counts.completed,
      countInProgress: counts['in-progress'],
      countCancelled: counts.cancelled,
      countOverdue: counts.overdue
    };

    Object.keys(map).forEach(function (id) {
      var el = qs('#' + id);
      if (el) el.textContent = toFa(map[id]);
    });
  }


  /* ========================================================================
     4. FILTERING / SEARCH / TABS
     ==================================================================== */
  function initTabs() {
    var tabs = qsa('.task-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        state.tab = tab.dataset.status;
        state.visibleCount = 6;
        renderRows();
      });
    });
  }

  function initSearch() {
    var input = qs('#taskSearchInput');
    if (!input) return;

    var debounceTimer;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        state.search = input.value.trim();
        state.visibleCount = 6;
        renderRows();
      }, 180);
    });
  }


  /* ========================================================================
     5. LOAD MORE
     ==================================================================== */
  function initLoadMore() {
    var btn = qs('#loadMoreBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      state.visibleCount += 6;
      renderRows();
    });
  }


  /* ========================================================================
     5.b CALENDAR (تقویم شمسی — خود ویجت در js/jalali.js است؛ اینجا فقط به
     آن وصل می‌شویم و فیلتر تسک‌ها بر اساس تاریخ را مدیریت می‌کنیم)
     ==================================================================== */
  var calendarWidget = null;

  /* مجموعه تاریخ‌هایی که در تقویم باید نقطه «دارای تسک» بگیرند */
  var taskDateSet = {};
  function buildTaskDateSet() {
    var set = {};
    store.getTasks().forEach(function (t) {
      if (t.date) set[t.date] = true;
      if (Array.isArray(t.subtasks)) {
        t.subtasks.forEach(function (s) {
          if (s.date && s.date !== 'بدون تاریخ') set[s.date] = true;
        });
      }
    });
    taskDateSet = set;
  }

  function selectCalendarDate(dateStr) {
    state.selectedDate = dateStr;
    state.visibleCount = 6;
    renderRows();
    // تاریخ انتخابی را در فرم افزودن هم قرار بده
    var dateInput = qs('#taskDate');
    if (dateInput) dateInput.value = dateStr;
  }

  function clearCalendarFilter() {
    state.selectedDate = null;
    state.visibleCount = 6;
    renderRows();
    var dateInput = qs('#taskDate');
    if (dateInput) dateInput.value = '';
  }

  function renderCalendar() {
    if (calendarWidget) calendarWidget.refresh();
  }

  function initCalendar() {
    var grid = qs('#calendarGrid');
    if (!grid) return;

    calendarWidget = Jalali.createCalendar({
      gridSel: '#calendarGrid',
      monthLabelSel: '#calMonthLabel',
      prevSel: '#calPrev',
      nextSel: '#calNext',
      todaySel: '#calTodayBtn',
      clearSel: '#calClearBtn',
      infoSel: '#calSelectedInfo',
      todaySelects: true,
      beforeRender: buildTaskDateSet,
      dayClass: function (dateStr) { return taskDateSet[dateStr] ? 'has-tasks' : ''; },
      onSelect: selectCalendarDate,
      onClear: clearCalendarFilter
    });
  }


  /* ========================================================================
     6. CUSTOM DROPDOWN FILTERS
     ==================================================================== */
  function initFilterDropdowns() {
    var selects = qsa('.filter-select');

    selects.forEach(function (wrap) {
      var btn = qs('.filter-select-btn', wrap);
      var label = qs('.filter-select-btn span', wrap);
      var items = qsa('.filter-dropdown li', wrap);
      var key = wrap.dataset.filter;

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = wrap.classList.contains('open');
        closeAllDropdowns();
        if (!isOpen) wrap.classList.add('open');
      });

      items.forEach(function (item) {
        item.addEventListener('click', function () {
          items.forEach(function (i) { i.classList.remove('active'); });
          item.classList.add('active');
          label.textContent = item.textContent;
          state[key] = item.dataset.value;
          state.visibleCount = 6;
          wrap.classList.remove('open');
          renderRows();
        });
      });
    });

    document.addEventListener('click', closeAllDropdowns);
  }

  function closeAllDropdowns() {
    qsa('.filter-select.open').forEach(function (el) { el.classList.remove('open'); });
    qsa('.task-menu.open').forEach(function (el) { el.classList.remove('open'); });
    qsa('.task-row.menu-open').forEach(function (el) { el.classList.remove('menu-open'); });
  }


  /* ========================================================================
     7. TASK ROW INTERACTIONS
     ==================================================================== */
  function initRowInteractions() {
    var container = qs('#taskRows');
    if (!container) return;

    container.addEventListener('click', function (e) {
      // ----- کلیک روی یک زیرمجموعه -----
      var subRow = e.target.closest('.subtask-row');
      if (subRow) {
        var subActionEl = e.target.closest('[data-action]');
        if (!subActionEl) return;
        var wrapper = e.target.closest('.task-row-wrapper');
        if (!wrapper) return;
        var taskId = Number(wrapper.dataset.id);
        var subId = Number(subRow.dataset.subId);
        e.stopPropagation();
        var subAction = subActionEl.dataset.action;
        switch (subAction) {
          case 'toggle-subtask': toggleSubtaskStatus(taskId, subId); break;
          case 'edit-subtask': startSubtaskEdit(taskId, subId); break;
          case 'save-subtask': saveSubtaskEdit(taskId, subId); break;
          case 'cancel-subtask': cancelSubtaskEdit(); break;
          case 'delete-subtask': deleteSubtask(taskId, subId); break;
        }
        return;
      }

      // ----- کلیک روی فرم افزودن زیرمجموعه -----
      var subForm = e.target.closest('.subtask-form');
      if (subForm) return; // اجازه دهیم رویداد submit مدیریت شود

      // ----- کلیک روی ردیف تسک اصلی -----
      var row = e.target.closest('.task-row');
      if (!row) return;

      var id = Number(row.dataset.id);
      var actionEl = e.target.closest('[data-action]');
      if (!actionEl) {
        // کلیک روی بدنه‌ی ردیف (عنوان/تاریخ/...) → باز و بسته‌کردن دراپ‌داون زیرمجموعه‌ها
        if (state.editingId === id) return;
        var rowTask = store.getTasks().find(function (t) { return t.id === id; });
        if (rowTask && rowTask.subtasks && rowTask.subtasks.length > 0) {
          e.stopPropagation();
          closeAllDropdowns();
          toggleExpanded(id);
        }
        return;
      }

      e.stopPropagation();
      var action = actionEl.dataset.action;

      switch (action) {
        case 'toggle-status':
          closeAllDropdowns();
          cycleTaskStatus(id);
          break;
        case 'toggle-menu': {
          var menu = actionEl.closest('.task-menu');
          var wasOpen = menu.classList.contains('open');
          closeAllDropdowns();
          if (!wasOpen) {
            menu.classList.add('open');
            row.classList.add('menu-open');
          }
          break;
        }
        case 'toggle-subtasks':
          closeAllDropdowns();
          toggleExpanded(id);
          break;
        case 'delete':
          deleteTask(id, row);
          break;
        case 'duplicate':
          duplicateTask(id);
          break;
        case 'edit':
          closeAllDropdowns();
          startEdit(id);
          break;
        case 'save-edit':
          saveEdit(id);
          break;
        case 'cancel-edit':
          cancelEdit();
          break;
        case 'toggle-timer':
          toggleTimer(id);
          break;
        case 'reset-timer':
          resetTimer(id);
          break;
        case 'select':
          actionEl.classList.toggle('checked');
          var checked = actionEl.classList.contains('checked');
          actionEl.setAttribute('aria-checked', checked);
          actionEl.style.background = checked ? 'var(--primary)' : '';
          actionEl.style.borderColor = checked ? 'var(--primary)' : '';
          break;
      }
    });

    // ----- ارسال فرم افزودن زیرمجموعه -----
    container.addEventListener('submit', function (e) {
      var subForm = e.target.closest('.subtask-form');
      if (!subForm) return;
      e.preventDefault();
      var taskId = Number(subForm.dataset.taskId);
      addSubtask(taskId, subForm);
    });

    // ----- کیبورد روی زیرمجموعه‌ها (toggle + edit) -----
    container.addEventListener('keydown', function (e) {
      // Enter داخل فرم افزودن زیرمجموعه
      if (e.key === 'Enter' && e.target.closest('.subtask-form')) {
        var sf = e.target.closest('.subtask-form');
        e.preventDefault();
        addSubtask(Number(sf.dataset.taskId), sf);
        return;
      }
      // Enter/Space روی چک‌باکس زیرمجموعه
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('subtask-check')) {
        var w = e.target.closest('.task-row-wrapper');
        var sr = e.target.closest('.subtask-row');
        if (w && sr) {
          e.preventDefault();
          toggleSubtaskStatus(Number(w.dataset.id), Number(sr.dataset.subId));
        }
        return;
      }
      // Enter داخل فیلد ویرایش زیرمجموعه
      if (e.key === 'Enter' && e.target.closest('.subtask-row.editing')) {
        var ww = e.target.closest('.task-row-wrapper');
        var srr = e.target.closest('.subtask-row.editing');
        if (ww && srr) {
          e.preventDefault();
          saveSubtaskEdit(Number(ww.dataset.id), Number(srr.dataset.subId));
        }
        return;
      }
      // Enter در فیلدهای inline تسک اصلی
      if (e.key !== 'Enter') return;
      var row = e.target.closest('.task-row.editing');
      if (!row) return;
      e.preventDefault();
      saveEdit(Number(row.dataset.id));
    });

    // لغو با Escape
    container.addEventListener('keyup', function (e) {
      if (e.key !== 'Escape') return;
      if (state.editingSub) {
        e.preventDefault();
        cancelSubtaskEdit();
        return;
      }
      if (state.editingId !== null) {
        e.preventDefault();
        cancelEdit();
      }
    });
  }

  function cycleTaskStatus(id) {
    var order = ['pending', 'in-progress', 'completed'];
    var tasks = store.getTasks();
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;

    if (task.status === 'cancelled' || task.status === 'overdue') {
      task.status = 'in-progress';
    } else {
      var idx = order.indexOf(task.status);
      task.status = order[(idx + 1) % order.length];
    }

    // اگر تسک تکمیل یا لغو شد، تایمر در حال اجرا متوقف می‌شود
    if ((task.status === 'completed' || task.status === 'cancelled') && task.timerStartedAt) {
      task.timeSpent = getElapsedSeconds(task);
      task.timerStartedAt = null;
    }

    store.saveTasks(tasks);
    renderRows();
    updateTimerTicking();
  }

  /* ----- کنترل تایمر تسک ----- */
  function toggleTimer(id) {
    var tasks = store.getTasks();
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    ensureTimerFields(task);

    if (task.timerStartedAt) {
      task.timeSpent = getElapsedSeconds(task);
      task.timerStartedAt = null;
    } else {
      task.timerStartedAt = Date.now();
    }

    store.saveTasks(tasks);
    renderRows();
    updateTimerTicking();
  }

  function resetTimer(id) {
    var tasks = store.getTasks();
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    ensureTimerFields(task);

    task.timeSpent = 0;
    task.timerStartedAt = null;

    store.saveTasks(tasks);
    renderRows();
    updateTimerTicking();
    showToast('تایمر تسک ریست شد', 'info');
  }

  function tickTimers() {
    var tasks = store.getTasks();
    var anyRunning = false;
    tasks.forEach(function (t) {
      if (!t.timerStartedAt) return;
      anyRunning = true;
      var el = qs('.task-row[data-id="' + t.id + '"] [data-timer-display]');
      if (el) el.textContent = formatDuration(getElapsedSeconds(t));
    });
    if (!anyRunning) updateTimerTicking();
  }

  function updateTimerTicking() {
    var tasks = store.getTasks();
    var hasRunning = tasks.some(function (t) { return !!t.timerStartedAt; });

    if (hasRunning && !timerTickInterval) {
      timerTickInterval = setInterval(tickTimers, 1000);
    } else if (!hasRunning && timerTickInterval) {
      clearInterval(timerTickInterval);
      timerTickInterval = null;
    }
  }

  function deleteTask(id, row) {
    row.classList.add('removing');
    setTimeout(function () {
      var tasks = store.getTasks().filter(function (t) { return t.id !== id; });
      store.saveTasks(tasks);
      renderRows();
      renderCalendar();
      showToast('تسک با موفقیت حذف شد', 'danger');
    }, 250);
  }

  function duplicateTask(id) {
    var tasks = store.getTasks();
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;

    var copy = Object.assign({}, task, {
      id: store.nextTaskId(),
      status: 'pending',
      timeSpent: 0,
      timerStartedAt: null,
      subtasks: [] // نسخه‌ی کپی، زیرمجموعه‌ها را به ارث نمی‌برد
    });
    tasks.unshift(copy);
    store.saveTasks(tasks);
    renderRows();
    renderCalendar();
    showToast('تسک کپی شد', 'success');
  }


  /* ========================================================================
     7.b SUBTASK OPERATIONS
     ==================================================================== */
  function toggleExpanded(id) {
    var idx = state.expandedIds.indexOf(id);
    if (idx === -1) {
      state.expandedIds.push(id);
    } else {
      state.expandedIds.splice(idx, 1);
    }
    renderRows();
  }

  function addSubtask(taskId, form) {
    var titleInput = form.querySelector('[name="title"]');
    var title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }

    var tasks = store.getTasks();
    var task = tasks.find(function (t) { return t.id === taskId; });
    if (!task) return;
    ensureSubtaskFields(task);

    task.subtasks.push({
      id: nextSubId(task),
      title: title,
      category: form.querySelector('[name="category"]').value,
      priority: form.querySelector('[name="priority"]').value,
      date: Jalali.normalizeDate(form.querySelector('[name="date"]').value) || 'بدون تاریخ',
      status: 'pending'
    });

    store.saveTasks(tasks);
    syncParentStatus(task);
    store.saveTasks(tasks);

    // فرم رو ریست کن و فیلد عنوان رو فوکوس کن
    form.reset();
    var dateField = form.querySelector('[name="date"]');
    if (dateField) dateField.value = state.selectedDate || Jalali.todayString();
    form.querySelector('[name="priority"]').value = 'متوسط';
    titleInput.focus();

    renderRows();
    showToast('زیرمجموعه اضافه شد', 'success');
  }

  function toggleSubtaskStatus(taskId, subId) {
    var tasks = store.getTasks();
    var task = tasks.find(function (t) { return t.id === taskId; });
    if (!task) return;
    var sub = (task.subtasks || []).find(function (s) { return s.id === subId; });
    if (!sub) return;

    sub.status = sub.status === 'completed' ? 'pending' : 'completed';
    syncParentStatus(task);
    store.saveTasks(tasks);
    renderRows();
  }

  function deleteSubtask(taskId, subId) {
    var tasks = store.getTasks();
    var task = tasks.find(function (t) { return t.id === taskId; });
    if (!task) return;
    ensureSubtaskFields(task);

    task.subtasks = task.subtasks.filter(function (s) { return s.id !== subId; });
    syncParentStatus(task);
    store.saveTasks(tasks);
    renderRows();
    showToast('زیرمجموعه حذف شد', 'danger');
  }

  function startSubtaskEdit(taskId, subId) {
    state.editingSub = { taskId: taskId, subId: subId };
    renderRows();
  }

  function cancelSubtaskEdit() {
    state.editingSub = null;
    renderRows();
  }

  function saveSubtaskEdit(taskId, subId) {
    var tasks = store.getTasks();
    var task = tasks.find(function (t) { return t.id === taskId; });
    if (!task) return;
    var sub = (task.subtasks || []).find(function (s) { return s.id === subId; });
    if (!sub) return;

    var row = qs('.subtask-row.editing[data-sub-id="' + subId + '"]');
    if (!row) { cancelSubtaskEdit(); return; }

    var titleEl = row.querySelector('[data-field="title"]');
    var title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      if (titleEl) titleEl.focus();
      showToast('عنوان زیرمجموعه نمی‌تواند خالی باشد', 'danger');
      return;
    }

    var catEl = row.querySelector('[data-field="category"]');
    var prioEl = row.querySelector('[data-field="priority"]');
    var dateEl = row.querySelector('[data-field="date"]');

    sub.title = title;
    sub.category = catEl ? catEl.value : sub.category;
    sub.priority = prioEl ? prioEl.value : sub.priority;
    sub.date = dateEl ? Jalali.normalizeDate(dateEl.value) : sub.date;

    state.editingSub = null;
    store.saveTasks(tasks);
    renderRows();
    showToast('ویرایش زیرمجموعه ذخیره شد', 'success');
  }

  /* ----- همگام‌سازی وضعیت تسک اصلی با زیرمجموعه‌ها -----
     - اگر زیرمجموعه‌ای نبود: تغییری نمیده
     - اگر همه‌ی زیرمجموعه‌ها completed بودن: تسک اصلی -> completed
     - در غیر این صورت، اگه تسک اصلی completed باشه -> in-progress */
  function syncParentStatus(task) {
    if (!Array.isArray(task.subtasks) || task.subtasks.length === 0) return;
    var allDone = task.subtasks.every(function (s) { return s.status === 'completed'; });
    if (allDone) {
      task.status = 'completed';
      if (task.timerStartedAt) {
        task.timeSpent = getElapsedSeconds(task);
        task.timerStartedAt = null;
      }
    } else if (task.status === 'completed') {
      task.status = 'in-progress';
    }
  }


  /* ========================================================================
     8. INLINE EDIT MODE
     ==================================================================== */
  function startEdit(id) {
    state.editingId = id;
    renderRows();
  }

  function cancelEdit() {
    state.editingId = null;
    renderRows();
  }

  function saveEdit(id) {
    var row = qs('.task-row.editing[data-id="' + id + '"]');
    if (!row) return;

    var titleVal = qs('[data-field="title"]', row);
    var categoryVal = qs('[data-field="category"]', row);
    var priorityVal = qs('[data-field="priority"]', row);
    var dateVal = qs('[data-field="date"]', row);

    var title = titleVal ? titleVal.value.trim() : '';
    if (!title) {
      if (titleVal) {
        titleVal.focus();
        showToast('عنوان تسک نمی‌تواند خالی باشد', 'danger');
      }
      return;
    }

    var tasks = store.getTasks();
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;

    task.title = title;
    task.category = categoryVal ? categoryVal.value : task.category;
    task.priority = priorityVal ? priorityVal.value : task.priority;
    task.date = dateVal ? Jalali.normalizeDate(dateVal.value) : task.date;

    store.saveTasks(tasks);
    state.editingId = null;
    renderRows();
    renderCalendar();
    showToast('ویرایش ذخیره شد', 'success');
  }


  /* ========================================================================
     9. CREATE TASK FORM
     ==================================================================== */
  function initCategorySelect() {
    var wrap = qs('#categorySelect');
    if (!wrap) return;

    qsa('.pill-option', wrap).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.value === 'more') {
          showToast('افزودن دسته‌بندی جدید در نسخه نمایشی فعال نیست', 'info');
          return;
        }
        qsa('.pill-option', wrap).forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  function initPrioritySelect() {
    var wrap = qs('#prioritySelect');
    if (!wrap) return;

    qsa('.priority-option', wrap).forEach(function (btn) {
      btn.addEventListener('click', function () {
        qsa('.priority-option', wrap).forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  function getSelectedValue(wrapSelector) {
    var active = qs(wrapSelector + ' .active');
    return active ? active.dataset.value : null;
  }

  function resetSelectors() {
    qsa('.pill-option').forEach(function (b) { b.classList.toggle('active', b.dataset.value === 'شخصی'); });
    qsa('.priority-option').forEach(function (b) { b.classList.toggle('active', b.dataset.value === 'بالا'); });
  }

  function initCreateTaskForm() {
    var form = qs('#createTaskForm');
    if (!form) return;

    var titleGroup = qs('#taskTitle').closest('.form-group');
    var taskDateInput = qs('#taskDate');
    var dateGroup = taskDateInput ? taskDateInput.closest('.form-group') : null;
    var submitBtn = qs('#submitTaskBtn');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var titleInput = qs('#taskTitle');
      var title = titleInput.value.trim();

      if (!title) {
        titleGroup.classList.add('invalid');
        titleInput.focus();
        return;
      }
      titleGroup.classList.remove('invalid');

      // ثبت تسک بدون تاریخ مجاز نیست
      var dateValue = taskDateInput ? Jalali.normalizeDate(taskDateInput.value) : '';
      if (!dateValue) {
        if (dateGroup) dateGroup.classList.add('invalid');
        if (taskDateInput) taskDateInput.focus();
        return;
      }
      if (dateGroup) dateGroup.classList.remove('invalid');

      submitBtn.classList.add('loading');
      submitBtn.textContent = 'در حال افزودن...';

      setTimeout(function () {
        var tasks = store.getTasks();
        var newTask = {
          id: store.nextTaskId(),
          title: title,
          category: getSelectedValue('#categorySelect') || 'شخصی',
          priority: getSelectedValue('#prioritySelect') || 'متوسط',
          date: dateValue,
          status: 'pending'
        };

        tasks.unshift(newTask);
        store.saveTasks(tasks);
        state.tab = 'all';
        qsa('.task-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.status === 'all'); });
        renderRows();

        submitBtn.classList.remove('loading');
        submitBtn.textContent = 'افزودن تسک';
        showToast('تسک جدید با موفقیت اضافه شد', 'success');

        form.reset();
        resetSelectors();
        if (taskDateInput) taskDateInput.value = state.selectedDate || '';
        renderCalendar();
        if (!qs('#createAnotherCheckbox').checked) {
          titleInput.focus();
        }
      }, 300);
    });

    qs('#taskTitle').addEventListener('input', function () {
      if (qs('#taskTitle').value.trim()) titleGroup.classList.remove('invalid');
    });

    if (taskDateInput) {
      taskDateInput.addEventListener('input', function () {
        if (taskDateInput.value.trim() && dateGroup) dateGroup.classList.remove('invalid');
      });
    }
  }


  /* ========================================================================
     10. TOASTS
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
     11. INIT
     ==================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    renderRows();
    initTabs();
    initSearch();
    initLoadMore();
    initCalendar();
    initFilterDropdowns();
    initRowInteractions();
    initCategorySelect();
    initPrioritySelect();
    initCreateTaskForm();
    updateTimerTicking();
  });
})();
