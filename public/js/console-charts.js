/* ==========================================================================
   TaxBot CA Console - Chart Rendering Helpers
   Owns Chart.js state and chart-specific data shaping for console.js.
   ========================================================================== */

let chartSalesExpenses = null;
let chartExpenseCategories = null;
let chartWsGstTrend = null;

function getMonthlySalesExpensesData(transactions) {
  const months = [];
  const salesByMonth = {};
  const expensesByMonth = {};

  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString('default', { month: 'short' }) + ' ' + d.getFullYear().toString().substring(2);
    months.push(label);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    salesByMonth[key] = 0;
    expensesByMonth[key] = 0;
  }

  transactions.forEach(t => {
    if (!t.date) return;
    const dateParts = t.date.split('-');
    if (dateParts.length < 2) return;
    const key = `${dateParts[0]}-${dateParts[1]}`;
    if (key in salesByMonth) {
      const amt = Math.abs(t.amount);
      if (t.type === 'Sale') {
        salesByMonth[key] += amt;
      } else {
        expensesByMonth[key] += amt;
      }
    }
  });

  const salesData = months.map((m, idx) => {
    const key = Object.keys(salesByMonth)[idx];
    return salesByMonth[key];
  });

  const expensesData = months.map((m, idx) => {
    const key = Object.keys(expensesByMonth)[idx];
    return expensesByMonth[key];
  });

  return { labels: months, sales: salesData, expenses: expensesData };
}

function getExpenseCategoryData(transactions) {
  const categories = {};
  transactions.forEach(t => {
    if (t.type !== 'Sale') {
      const cat = t.category || 'Other Expenses';
      const amt = Math.abs(t.amount);
      categories[cat] = (categories[cat] || 0) + amt;
    }
  });
  return {
    labels: Object.keys(categories),
    data: Object.values(categories),
  };
}

function getMonthlyGstTrendData(clientTx) {
  const months = [];
  const salesGstByMonth = {};
  const purchaseGstByMonth = {};

  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString('default', { month: 'short' }) + ' ' + d.getFullYear().toString().substring(2);
    months.push(label);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    salesGstByMonth[key] = 0;
    purchaseGstByMonth[key] = 0;
  }

  clientTx.forEach(t => {
    if (!t.date) return;
    const dateParts = t.date.split('-');
    if (dateParts.length < 2) return;
    const key = `${dateParts[0]}-${dateParts[1]}`;
    if (key in salesGstByMonth) {
      const ratePercent = t.gst_rate ? Number(t.gst_rate) / 100 : 0.18;
      const taxAmt = Math.abs(t.amount) * ratePercent;

      if (t.type === 'Sale' || t.category === 'sales') {
        salesGstByMonth[key] += taxAmt;
      } else {
        purchaseGstByMonth[key] += taxAmt;
      }
    }
  });

  const salesGst = months.map((m, idx) => {
    const key = Object.keys(salesGstByMonth)[idx];
    return salesGstByMonth[key];
  });

  const purchaseGst = months.map((m, idx) => {
    const key = Object.keys(purchaseGstByMonth)[idx];
    return purchaseGstByMonth[key];
  });

  return { labels: months, salesTax: salesGst, purchaseTax: purchaseGst };
}

function renderOverviewCharts() {
  if (typeof Chart === 'undefined') return;

  const trendData = getMonthlySalesExpensesData(globalTransactions);
  const expenseCatData = getExpenseCategoryData(globalTransactions);
  const ctxTrend = document.getElementById('chart-sales-expenses');

  if (ctxTrend) {
    if (chartSalesExpenses) {
      chartSalesExpenses.destroy();
    }

    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#94A3B8' : '#64748B';
    const gridColor = isDark ? '#1E293B' : '#E2E8F0';

    chartSalesExpenses = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels: trendData.labels,
        datasets: [
          {
            label: 'Sales (INR)',
            data: trendData.sales,
            borderColor: '#2563EB',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Expenses (INR)',
            data: trendData.expenses,
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: textColor, font: { family: 'Inter' } },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter' } },
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter' } },
          },
        },
      },
    });
  }

  const ctxCat = document.getElementById('chart-expense-categories');
  if (ctxCat) {
    if (chartExpenseCategories) {
      chartExpenseCategories.destroy();
    }

    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#94A3B8' : '#64748B';

    if (expenseCatData.labels.length === 0) {
      const ctx = ctxCat.getContext('2d');
      ctx.clearRect(0, 0, ctxCat.width, ctxCat.height);
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '14px Inter';
      ctx.fillText('No expense data available', ctxCat.width / 2, ctxCat.height / 2);
    } else {
      chartExpenseCategories = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: expenseCatData.labels,
          datasets: [{
            data: expenseCatData.data,
            backgroundColor: [
              '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#EC4899', '#8B5CF6',
            ],
            borderWidth: isDark ? 2 : 1,
            borderColor: isDark ? '#121824' : '#FFFFFF',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: textColor, font: { family: 'Inter', size: 11 } },
            },
          },
        },
      });
    }
  }
}

function renderClientWorkspaceGstChart(clientId, cTx) {
  if (typeof Chart === 'undefined') return;

  const ctxGst = document.getElementById('chart-ws-gst-trend');
  if (!ctxGst) return;

  if (chartWsGstTrend) {
    chartWsGstTrend.destroy();
  }

  const gstTrend = getMonthlyGstTrendData(cTx);
  const isDark = document.body.classList.contains('dark-theme');
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#1E293B' : '#E2E8F0';

  chartWsGstTrend = new Chart(ctxGst, {
    type: 'bar',
    data: {
      labels: gstTrend.labels,
      datasets: [
        {
          label: 'Outward GST (Liabilities)',
          data: gstTrend.salesTax,
          backgroundColor: '#3B82F6',
          borderRadius: 4,
        },
        {
          label: 'Inward GST (Eligible ITC)',
          data: gstTrend.purchaseTax,
          backgroundColor: '#10B981',
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: textColor, font: { family: 'Inter' } },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Inter' } },
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Inter' } },
        },
      },
    },
  });
}

function updateChartsTheme() {
  const isDark = document.body.classList.contains('dark-theme');
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#1E293B' : '#E2E8F0';
  const borderColor = isDark ? '#121824' : '#FFFFFF';

  if (chartSalesExpenses && chartSalesExpenses.options) {
    chartSalesExpenses.options.plugins.legend.labels.color = textColor;
    chartSalesExpenses.options.scales.x.grid.color = gridColor;
    chartSalesExpenses.options.scales.x.ticks.color = textColor;
    chartSalesExpenses.options.scales.y.grid.color = gridColor;
    chartSalesExpenses.options.scales.y.ticks.color = textColor;
    chartSalesExpenses.update();
  }

  if (chartExpenseCategories && chartExpenseCategories.options) {
    chartExpenseCategories.options.plugins.legend.labels.color = textColor;
    if (chartExpenseCategories.data && chartExpenseCategories.data.datasets && chartExpenseCategories.data.datasets[0]) {
      chartExpenseCategories.data.datasets[0].borderColor = borderColor;
      chartExpenseCategories.data.datasets[0].borderWidth = isDark ? 2 : 1;
    }
    chartExpenseCategories.update();
  }

  if (chartWsGstTrend && chartWsGstTrend.options) {
    chartWsGstTrend.options.plugins.legend.labels.color = textColor;
    if (chartWsGstTrend.options.scales) {
      if (chartWsGstTrend.options.scales.x) {
        chartWsGstTrend.options.scales.x.grid.color = gridColor;
        chartWsGstTrend.options.scales.x.ticks.color = textColor;
      }
      if (chartWsGstTrend.options.scales.y) {
        chartWsGstTrend.options.scales.y.grid.color = gridColor;
        chartWsGstTrend.options.scales.y.ticks.color = textColor;
      }
    }
    chartWsGstTrend.update();
  }
}
