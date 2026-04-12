(function () {
  let subjectChart;
  let topicChart;

  const selectors = {
    codeBadge: document.querySelector("#userCodeBadge"),
    changeCode: document.querySelector("#changeCodeBtn"),
    exportCsv: document.querySelector("#exportCsvBtn"),
    exportAi: document.querySelector("#exportAiBtn"),
    syncSupabase: document.querySelector("#syncSupabaseBtn"),
    studentName: document.querySelector("#studentNameInput"),
    familyCode: document.querySelector("#familyCodeInput"),
    syncStatus: document.querySelector("#syncStatus"),
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

  function setSyncStatus(message, isError = false) {
    selectors.syncStatus.textContent = message;
    selectors.syncStatus.classList.toggle("error", isError);
  }

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
    const profile = QuizApp.getCurrentUserProfile();

    selectors.codeBadge.textContent = code;
    selectors.studentName.value = profile.student_name || "";
    selectors.familyCode.value = profile.family_code || "";
    selectors.totalAttempted.textContent = analytics.totalAttempted.toLocaleString();
    selectors.correctRate.textContent = `${analytics.accuracy}%`;
    selectors.remaining.textContent = remaining.toLocaleString();
    setSyncStatus(
      profile.last_synced_at
        ? `Last synced: ${new Date(profile.last_synced_at).toLocaleString()}`
        : "Supabase sync not done yet."
    );

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
    selectors.exportAi.addEventListener("click", () => {
      const exported = QuizApp.exportAIExplanationsJson();
      if (!exported) {
        setSyncStatus("No AI explanations saved in this browser yet.", true);
        return;
      }
      QuizApp.downloadJson("class9-ai-explanations.json", exported);
      setSyncStatus("AI explanations exported. Share that JSON file and we can make them permanent.");
    });
    selectors.studentName.addEventListener("input", () => {
      QuizApp.updateCurrentUserProfile({
        student_name: selectors.studentName.value.trim(),
      });
    });
    selectors.familyCode.addEventListener("input", () => {
      QuizApp.updateCurrentUserProfile({
        family_code: selectors.familyCode.value.trim(),
      });
    });
    selectors.syncSupabase.addEventListener("click", async () => {
      try {
        selectors.syncSupabase.disabled = true;
        setSyncStatus("Syncing to Supabase...");
        await QuizApp.syncAttemptSummaryToSupabase();
        renderDashboard();
        setSyncStatus("Synced to Supabase successfully.");
      } catch (error) {
        setSyncStatus(`Supabase sync failed: ${error.message}`, true);
      } finally {
        selectors.syncSupabase.disabled = false;
      }
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
