/* ==========================================================================
   گزارش‌ها — reports.js
   نمودار زمان‌بندی تسک‌های انجام‌شده بر اساس نوع تسک (دسته‌بندی) و روز انجام؛
   مقدار هر نقطه، زمان ثبت‌شده (timeSpent) روی همان روز است.
   داده‌ها از RGMStore (localStorage) خوانده می‌شوند.
   ========================================================================== */

(function () {
  'use strict';

  var store = window.RGMStore;
  var toFa = store.toFa;
  var qs = RGMApp.qs;

  /* رنگ هر دسته‌بندی (هم‌خانواده با پالت رنگ پروژه) */
  var CATEGORY_COLORS = {
    'کاری': '#7C5CFC',
    'شخصی': '#FFA451',
    'سلامتی': '#2ECC91',
    'یادگیری': '#4FA3F7'
  };
  var FALLBACK_COLORS = ['#7C5CFC', '#FFA451', '#2ECC91', '#4FA3F7', '#FF6FA5', '#C9CBDA'];

  var timelineChart = null;

  /* زمان را از ثانیه به متن فارسی خوانا تبدیل می‌کند */
  function formatTime(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return toFa(sec) + ' ثانیه';
    var h = Math.floor(sec / 3600);
    var m = Math.round((sec % 3600) / 60);
    if (h && m) return toFa(h) + ' ساعت و ' + toFa(m) + ' دقیقه';
    if (h) return toFa(h) + ' ساعت';
    return toFa(m) + ' دقیقه';
  }

  var FA_TO_EN = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

  function faToEn(num) {
    return String(num).replace(/[۰-۹]/g, function (d) { return FA_TO_EN[d]; });
  }

  /* یک روز به تاریخ شمسی (فارسی) اضافه می‌کند */
  function addDay(dateStr) {
    var parts = faToEn(dateStr).split('/');
    var g = Jalali.toGregorian(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    var d = new Date(g.gy, g.gm - 1, g.gd);
    d.setDate(d.getDate() + 1);
    var j = Jalali.toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return Jalali.format(j[0], j[1], j[2]);
  }

  /* داده‌ها را به شکل تاریخ → { دسته: مجموع ثانیه } درمی‌آورد */
  function buildTimelineData() {
    var items = [];
    store.getTasks().forEach(function (t) {
      if (t.status === 'completed' && t.date) {
        items.push(t);
      }
      if (t.subtasks && t.subtasks.length) {
        t.subtasks.forEach(function (st) {
          if (st.status === 'completed' && st.date) {
            items.push(st);
          }
        });
      }
    });

    var byDate = {};
    var dates = [];
    var categories = [];

    items.forEach(function (t) {
      var cat = t.category || 'سایر';
      var sec = Number(t.timeSpent) || 0;
      if (!byDate[t.date]) {
        byDate[t.date] = {};
        dates.push(t.date);
      }
      byDate[t.date][cat] = (byDate[t.date][cat] || 0) + sec;
      if (categories.indexOf(cat) === -1) categories.push(cat);
    });

    /* تاریخ شمسی با ارقام فارسی هم‌طول و قابل مقایسه است → مرتب‌سازی واژه‌ای معادل زمانی است */
    dates.sort();

    /* روزهای بی‌کار هم در محور X باشند تا خط به صفر برگردد.
       بین اولین و آخرین تاریخِ دارای تسک، همه روزها پر می‌شوند. */
    if (dates.length > 1) {
      var full = [dates[0]];
      var cur = dates[0];
      var last = dates[dates.length - 1];
      while (cur !== last && full.length < 400) {
        cur = addDay(cur);
        full.push(cur);
        if (!byDate[cur]) byDate[cur] = {};
      }
      dates = full;
    }

    return { dates: dates, categories: categories, byDate: byDate };
  }

  function renderTimelineChart() {
    var canvas = qs('#timelineChart');
    var emptyEl = qs('#timelineEmpty');
    if (!canvas || typeof Chart === 'undefined') return;

    var data = buildTimelineData();

    /* بدون تسک انجام‌شده → پیام خالی به جای نمودار */
    if (data.dates.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      canvas.parentNode.style.display = 'none';
      if (timelineChart) {
        timelineChart.destroy();
        timelineChart = null;
      }
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    canvas.parentNode.style.display = '';

    var ctx = canvas.getContext('2d');
    var labels = data.dates;

    var datasets = data.categories.map(function (cat, i) {
      var color = CATEGORY_COLORS[cat] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      return {
        label: cat,
        data: labels.map(function (d) { return Math.round((data.byDate[d][cat] || 0) / 60); }),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#fff',
        pointBorderColor: color,
        pointBorderWidth: 2.5,
        tension: 0.35,
        fill: false
      };
    });

    /* گام محور Y: برای مقادیر بزرگ نیم‌ساعت یا یک ساعت، نه یک‌دقیقه‌ای */
    var maxVal = 0;
    datasets.forEach(function (ds) {
      ds.data.forEach(function (v) { if (v > maxVal) maxVal = v; });
    });
    var stepSize = maxVal <= 30 ? 15 : (maxVal <= 90 ? 30 : 60);

    var options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          rtl: true,
          labels: {
            font: { family: 'Vazirmatn', size: 12 },
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 18,
            boxHeight: 8
          }
        },
        tooltip: {
          rtl: true,
          titleFont: { family: 'Vazirmatn' },
          bodyFont: { family: 'Vazirmatn' },
          callbacks: {
            label: function (c) { return ' ' + c.dataset.label + ': ' + formatTime(c.raw * 60); }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { family: 'Vazirmatn', size: 11.5 }, color: '#7D8198' }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            stepSize: stepSize,
            precision: 0,
            font: { family: 'Vazirmatn', size: 11 },
            color: '#7D8198',
            callback: function (v) {
              if (v >= 60 && v % 60 === 0) return toFa(v / 60) + ' ساعت';
              return toFa(v) + ' دقیقه';
            }
          },
          grid: { color: '#F1F1FA' },
          border: { display: false }
        }
      }
    };

    if (timelineChart) {
      timelineChart.data.labels = labels;
      timelineChart.data.datasets = datasets;
      timelineChart.update();
    } else {
      timelineChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: options
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderTimelineChart();
  });
})();
