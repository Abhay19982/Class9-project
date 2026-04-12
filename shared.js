(function () {
  const APP_STORAGE_KEY = "class9_quiz_app_v5";
  const ACCESS_CODES = ["USER1", "USER2", "USER3", "USER4", "USER5"];
  const DATA_PATH = "./data/questions.json";

  let questionsCache = null;

  function defaultState() {
    return {
      currentUserCode: "",
      users: {},
      aiExplanations: {},
    };
  }

  function readState() {
    try {
      const raw = localStorage.getItem(APP_STORAGE_KEY);
      if (!raw) {
        return defaultState();
      }
      return { ...defaultState(), ...JSON.parse(raw) };
    } catch {
      return defaultState();
    }
  }

  function writeState(state) {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state));
  }

  function ensureUser(code) {
    const state = readState();
    if (!state.users[code]) {
      state.users[code] = {
        attempts: [],
        attempted_questions: [],
      };
      writeState(state);
    }
    return state;
  }

  function getCurrentUserCode() {
    const state = readState();
    return ACCESS_CODES.includes(state.currentUserCode) ? state.currentUserCode : "";
  }

  function setCurrentUserCode(code) {
    const trimmed = String(code || "").trim().toUpperCase();
    if (!ACCESS_CODES.includes(trimmed)) {
      return false;
    }
    const state = ensureUser(trimmed);
    state.currentUserCode = trimmed;
    writeState(state);
    return true;
  }

  function getCurrentUserState() {
    const code = getCurrentUserCode();
    if (!code) {
      return { attempts: [], attempted_questions: [] };
    }
    const state = ensureUser(code);
    return state.users[code];
  }

  function getAttemptByQuestionId(questionId) {
    return getCurrentUserState().attempts.find((attempt) => attempt.question_id === questionId);
  }

  function recordAttempt(question, selectedOption, elapsedSeconds) {
    const code = getCurrentUserCode();
    const state = ensureUser(code);
    const user = state.users[code];
    if (user.attempted_questions.includes(question.question_id)) {
      return;
    }

    const correctOption = normalizedCorrectOptions(question).join(", ") || String(question.answer || "");
    const attempt = {
      question_id: question.question_id,
      question: question.question,
      options: question.options,
      selected: selectedOption,
      correct_option: correctOption,
      correct: isCorrectChoice(question, selectedOption),
      topic: question.topic || question.chapter || "",
      subject: question.subject || "",
      chapter: question.chapter || "",
      difficulty: question.difficulty || "",
      explanation: question.explanation || "",
      elapsed_seconds: elapsedSeconds,
      created_at: new Date().toISOString(),
    };

    user.attempts.push(attempt);
    user.attempted_questions.push(question.question_id);
    writeState(state);
  }

  async function loadQuestions() {
    if (questionsCache) {
      return questionsCache;
    }
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error(`Unable to load questions (${response.status})`);
    }
    questionsCache = await response.json();
    return questionsCache;
  }

  function getQuestions() {
    return questionsCache || [];
  }

  function filterUnattempted(questions, code) {
    const state = ensureUser(code);
    const attempted = new Set(state.users[code].attempted_questions || []);
    return questions.filter((question) => !attempted.has(question.question_id));
  }

  function applyFilters(questions, filters) {
    const search = normalize(filters.search);
    return questions.filter((question) => {
      if (filters.subject && question.subject !== filters.subject) {
        return false;
      }
      if (filters.chapter && question.chapter !== filters.chapter) {
        return false;
      }
      if (filters.topic && question.topic !== filters.topic) {
        return false;
      }
      if (filters.difficulty && question.difficulty !== filters.difficulty) {
        return false;
      }
      if (!search) {
        return true;
      }
      return normalize(
        [
          question.question,
          question.subject,
          question.chapter,
          question.topic,
          question.difficulty,
        ].join(" ")
      ).includes(search);
    });
  }

  function getAvailableQuestions(questions, code, filters) {
    return applyFilters(filterUnattempted(questions, code), filters);
  }

  function getDependentOptions(questions, code, filters) {
    const unattempted = filterUnattempted(questions, code);
    const subjects = uniqueValues(unattempted, "subject");
    const chapterBase = filters.subject
      ? unattempted.filter((question) => question.subject === filters.subject)
      : unattempted;
    const chapters = uniqueValues(chapterBase, "chapter");
    const topicBase = chapterBase.filter((question) => {
      if (filters.chapter) {
        return question.chapter === filters.chapter;
      }
      return true;
    });
    const topics = uniqueValues(topicBase, "topic");
    const difficultyBase = topicBase.filter((question) => {
      if (filters.topic) {
        return question.topic === filters.topic;
      }
      return true;
    });
    const difficulties = uniqueValues(difficultyBase, "difficulty");
    return { subjects, chapters, topics, difficulties };
  }

  function uniqueValues(items, field) {
    return [...new Set(items.map((item) => item[field]).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b))
    );
  }

  function fillSelect(select, values, placeholder) {
    const current = select.value;
    select.replaceChildren(new Option(placeholder, ""));
    values.forEach((value) => {
      select.add(new Option(value, value));
    });
    select.value = values.map(String).includes(String(current)) ? current : "";
  }

  function normalizedCorrectOptions(question) {
    return (Array.isArray(question.correct_options) ? question.correct_options : [])
      .map((option) => String(option).trim().toUpperCase())
      .filter(Boolean);
  }

  function isCorrectChoice(question, selectedOption) {
    return normalizedCorrectOptions(question).includes(String(selectedOption).trim().toUpperCase());
  }

  function getStaticExplanation(question) {
    if (question.explanation) {
      return question.explanation;
    }

    const correctOptions = normalizedCorrectOptions(question);
    const detailed = (question.options || [])
      .filter((option) => correctOptions.includes(String(option.identifier).toUpperCase()))
      .map((option) => `${option.identifier}. ${option.content}`);

    if (detailed.length) {
      return `The correct option is ${detailed.join(", ")}. A detailed static explanation is not available in the current dataset.`;
    }

    return "A detailed static explanation is not available in the current dataset.";
  }

  async function getAIExplanation(question) {
    const state = readState();
    if (state.aiExplanations[question.question_id]) {
      return state.aiExplanations[question.question_id];
    }

    const payload = {
      question: question.question,
      options: question.options || [],
      subject: question.subject,
      chapter: question.chapter,
    };

    try {
      const response = await fetch("/.netlify/functions/explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = `AI explanation unavailable (${response.status})`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            message = `${message}: ${errorData.error}`;
          }
        } catch {
          // ignore parse failure
        }
        throw new Error(message);
      }

      const data = await response.json();
      const explanation = data.explanation || mockExplanation(question);
      state.aiExplanations[question.question_id] = explanation;
      writeState(state);
      return explanation;
    } catch (error) {
      throw error;
    }
  }

  function mockExplanation(question) {
    const answer = normalizedCorrectOptions(question).join(", ") || "the marked correct option";
    return `Start by identifying what the question is asking about ${question.chapter || "this topic"}. Eliminate the options that do not match the concept, then compare the remaining choices carefully. For this question, the best answer is ${answer}.`;
  }

  function computeAnalytics(attempts) {
    const totalAttempted = attempts.length;
    const correctAnswers = attempts.filter((attempt) => attempt.correct).length;
    const accuracy = totalAttempted ? Math.round((correctAnswers / totalAttempted) * 100) : 0;

    const subjectStats = {};
    const topicStats = {};

    attempts.forEach((attempt) => {
      const subject = attempt.subject || "unknown";
      const topic = attempt.topic || attempt.chapter || "unknown";

      if (!subjectStats[subject]) {
        subjectStats[subject] = { attempted: 0, correct: 0 };
      }
      subjectStats[subject].attempted += 1;
      subjectStats[subject].correct += attempt.correct ? 1 : 0;

      if (!topicStats[topic]) {
        topicStats[topic] = { attempted: 0, correct: 0 };
      }
      topicStats[topic].attempted += 1;
      topicStats[topic].correct += attempt.correct ? 1 : 0;
    });

    const subjectPerformance = Object.entries(subjectStats).map(([label, stats]) => ({
      label,
      attempted: stats.attempted,
      correct: stats.correct,
      accuracy: stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0,
    }));

    const topicPerformance = Object.entries(topicStats).map(([label, stats]) => ({
      label,
      attempted: stats.attempted,
      correct: stats.correct,
      accuracy: stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0,
    }));

    topicPerformance.sort((left, right) => right.attempted - left.attempted);
    subjectPerformance.sort((left, right) => right.attempted - left.attempted);

    return {
      totalAttempted,
      correctAnswers,
      accuracy,
      incorrectAnswers: totalAttempted - correctAnswers,
      subjectPerformance,
      topicPerformance,
    };
  }

  function exportAttemptsCsv() {
    const attempts = getCurrentUserState().attempts;
    if (!attempts.length) {
      return null;
    }
    const header = [
      "question_id",
      "subject",
      "chapter",
      "topic",
      "selected",
      "correct_option",
      "correct",
      "elapsed_seconds",
      "created_at",
    ];
    const rows = attempts.map((attempt) =>
      [
        attempt.question_id,
        attempt.subject,
        attempt.chapter,
        attempt.topic,
        attempt.selected,
        attempt.correct_option,
        attempt.correct,
        attempt.elapsed_seconds,
        attempt.created_at,
      ]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    return [header.join(","), ...rows].join("\n");
  }

  function downloadCsv(filename, content) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function allQuestionsCompleted() {
    const code = getCurrentUserCode();
    return !filterUnattempted(getQuestions(), code).length;
  }

  function createEmptyState(text) {
    const item = document.createElement("article");
    item.className = "panel empty-state";
    item.textContent = text;
    return item;
  }

  function markActiveNav(page) {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      link.classList.toggle("active", link.dataset.nav === page);
    });
  }

  function formatSeconds(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function renderMath(element, attempts = 0) {
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([element]).catch(() => {});
      return;
    }
    if (attempts < 20) {
      window.setTimeout(() => renderMath(element, attempts + 1), 250);
    }
  }

  function buildLoginOverlay() {
    if (document.querySelector(".login-overlay")) {
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "login-overlay";
    overlay.innerHTML = `
      <div class="login-card">
        <p class="eyebrow">Access code</p>
        <h2>Enter your unique quiz code</h2>
        <p class="hero-copy">Allowed codes: USER1, USER2, USER3, USER4, USER5</p>
        <label>
          Code
          <input id="loginCodeInput" type="text" placeholder="USER1" autocomplete="off" />
        </label>
        <p id="loginError" class="status error" hidden>Invalid code. Use USER1 to USER5.</p>
        <button id="loginSubmitBtn" type="button">Continue</button>
      </div>
    `;
    document.body.append(overlay);
  }

  function promptCode(force = false) {
    buildLoginOverlay();
    const overlay = document.querySelector(".login-overlay");
    const input = document.querySelector("#loginCodeInput");
    const error = document.querySelector("#loginError");
    const submit = document.querySelector("#loginSubmitBtn");

    overlay.hidden = false;
    input.value = force ? "" : getCurrentUserCode();
    error.hidden = true;

    const handleSubmit = () => {
      if (setCurrentUserCode(input.value)) {
        overlay.hidden = true;
        window.location.reload();
        return;
      }
      error.hidden = false;
    };

    submit.onclick = handleSubmit;
    input.onkeydown = (event) => {
      if (event.key === "Enter") {
        handleSubmit();
      }
    };
  }

  function requireLogin(onReady) {
    const code = getCurrentUserCode();
    if (!code) {
      promptCode();
      return;
    }
    onReady(code);
  }

  window.QuizApp = {
    ACCESS_CODES,
    loadQuestions,
    getQuestions,
    readState,
    getCurrentUserCode,
    setCurrentUserCode,
    getCurrentUserState,
    getAttemptByQuestionId,
    recordAttempt,
    filterUnattempted,
    getAvailableQuestions,
    getDependentOptions,
    fillSelect,
    isCorrectChoice,
    getStaticExplanation,
    getAIExplanation,
    computeAnalytics,
    exportAttemptsCsv,
    downloadCsv,
    allQuestionsCompleted,
    createEmptyState,
    markActiveNav,
    requireLogin,
    promptCode,
    renderMath,
    formatSeconds,
  };
})();
