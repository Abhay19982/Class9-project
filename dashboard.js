(function () {
  let subjectChart;
  let topicChart;

  const selectors = {
    codeBadge: document.querySelector("#userCodeBadge"),
    changeCode: document.querySelector("#changeCodeBtn"),
    exportCsv: document.querySelector("#exportCsvBtn"),
    empty: document.querySelector("#dashboardEmpty"),
    content: document.querySelector("#dashboardContent"),
    totalAttempted: document.querySelector("#totalAttempted"),
    correctRate: document.querySelector("#correctRate"),
    remaining: document.querySelector("#remainingCount"),
    subjectTable: document.querySelector("#subjectTable"),
    topicTable: document.querySelector("#topicTable"),
    subjectChart: document.querySelector("#subjectChart"),
    topicChart: document.querySelector("#topicChart"),
  };

  function renderTable(container, rows) {
    if (!rows.length) {
      container.textContent = "No data available yet.";
      return;
    }
    const table = document.createElement("table");
    table.className = "data-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Label</th>
          <th>Attempted</th>
          <th>Correct</th>
          <th>Accuracy</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td>${row.label}</td>
            <td>${row.attempted}</td>
            <td>${row.correct}</td>
            <td>${row.accuracy}%</td>
          </tr>`
          )
          .join("")}
      </tbody>
    `;
    container.replaceChildren(table);
  }

  function buildChart(canvas, chartRef, rows, label) {
    if (chartRef) {
      chartRef.destroy();
    }
    return new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map((row) => row.label),
        datasets: [
          {
            label,
            data: rows.map((row) => row.accuracy),
            backgroundColor: ["#087a75", "#7a5cff", "#d84f45", "#f0bf3f", "#168451"],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
          },
        },
        plugins: {
          legend: {
            display: false,
          },
        },
      },
    });
  }

  function renderDashboard() {
    const code = QuizApp.getCurrentUserCode();
    const attempts = QuizApp.getCurrentUserState().attempts;
    const analytics = QuizApp.computeAnalytics(attempts);
    const remaining = QuizApp.filterUnattempted(QuizApp.getQuestions(), code).length;

    selectors.codeBadge.textContent = code;
    selectors.totalAttempted.textContent = analytics.totalAttempted.toLocaleString();
    selectors.correctRate.textContent = `${analytics.accuracy}%`;
    selectors.remaining.textContent = remaining.toLocaleString();

    if (!attempts.length) {
      selectors.empty.hidden = false;
      selectors.content.hidden = true;
      return;
    }

    selectors.empty.hidden = true;
    selectors.content.hidden = false;

    renderTable(selectors.subjectTable, analytics.subjectPerformance);
    renderTable(selectors.topicTable, analytics.topicPerformance.slice(0, 12));
    subjectChart = buildChart(
      selectors.subjectChart,
      subjectChart,
      analytics.subjectPerformance,
      "Accuracy %"
    );
    topicChart = buildChart(
      selectors.topicChart,
      topicChart,
      analytics.topicPerformance.slice(0, 10),
      "Accuracy %"
    );
  }

  function attachEvents() {
    selectors.changeCode.addEventListener("click", () => {
      QuizApp.promptCode(true);
    });
    selectors.exportCsv.addEventListener("click", () => {
      const csv = QuizApp.exportAttemptsCsv();
      if (!csv) {
        selectors.empty.hidden = false;
        selectors.empty.textContent = "No attempts yet to export.";
        return;
      }
      QuizApp.downloadCsv(`class9-${QuizApp.getCurrentUserCode().toLowerCase()}-attempts.csv`, csv);
    });
  }

  function init() {
    QuizApp.requireLogin(async () => {
      QuizApp.markActiveNav("dashboard");
      await QuizApp.loadQuestions();
      attachEvents();
      renderDashboard();
    });
  }

  init();
})();
