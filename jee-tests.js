(function () {
  const DATA_PATH = "./data/jee_tests.json?v=1";
  const STORAGE_KEY = "jee_extracted_tests_v1";

  const state = {
    payload: { subjects: [], tests: [] },
    filtered: [],
    currentIndex: 0,
    attempts: {},
  };

  const selectors = {
    countBadge: document.querySelector("#jeeCountBadge"),
    total: document.querySelector("#jeeTotalCount"),
    subjectCount: document.querySelector("#jeeSubjectCount"),
    attempted: document.querySelector("#jeeAttemptCount"),
    form: document.querySelector("#jeeFilterForm"),
    search: document.querySelector("#jeeSearchInput"),
    subject: document.querySelector("#jeeSubjectSelect"),
    chapter: document.querySelector("#jeeChapterSelect"),
    subtopic: document.querySelector("#jeeSubtopicSelect"),
    test: document.querySelector("#jeeTestSelect"),
    status: document.querySelector("#jeeStatus"),
    board: document.querySelector("#jeeTestBoard"),
    prev: document.querySelector("#jeePrevBtn"),
    next: document.querySelector("#jeeNextBtn"),
    pageInfo: document.querySelector("#jeePageInfo"),
  };

  function readAttempts() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function writeAttempts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.attempts));
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function unique(items) {
    return [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function fillSelect(select, values, placeholder) {
    const current = select.value;
    select.replaceChildren(new Option(placeholder, ""));
    values.forEach((value) => select.add(new Option(value, value)));
    select.value = values.includes(current) ? current : "";
  }

  function currentFilters() {
    return {
      search: normalize(selectors.search.value),
      subject: selectors.subject.value,
      chapter: selectors.chapter.value,
      subtopic: selectors.subtopic.value,
      test: selectors.test.value,
    };
  }

  function matchesSearch(item, search) {
    if (!search) {
      return true;
    }
    return normalize(
      [
        item.subject,
        item.chapter,
        item.subtopic,
        item.test,
        item.part,
        item.question,
        item.answer,
      ].join(" ")
    ).includes(search);
  }

  function applyFilters() {
    const filters = currentFilters();
    state.filtered = state.payload.tests.filter((item) => {
      if (filters.subject && item.subject !== filters.subject) return false;
      if (filters.chapter && item.chapter !== filters.chapter) return false;
      if (filters.subtopic && item.subtopic !== filters.subtopic) return false;
      if (filters.test && item.test !== filters.test) return false;
      return matchesSearch(item, filters.search);
    });
    state.currentIndex = Math.min(state.currentIndex, Math.max(state.filtered.length - 1, 0));
  }

  function syncDropdowns() {
    const filters = currentFilters();
    const tests = state.payload.tests;
    fillSelect(selectors.subject, state.payload.subjects, "All subjects");

    const chapterBase = filters.subject
      ? tests.filter((item) => item.subject === filters.subject)
      : tests;
    fillSelect(selectors.chapter, unique(chapterBase.map((item) => item.chapter)), "All chapters");

    const subtopicBase = chapterBase.filter((item) => {
      if (selectors.chapter.value) return item.chapter === selectors.chapter.value;
      return true;
    });
    fillSelect(selectors.subtopic, unique(subtopicBase.map((item) => item.subtopic)), "All subtopics");

    const testBase = subtopicBase.filter((item) => {
      if (selectors.subtopic.value) return item.subtopic === selectors.subtopic.value;
      return true;
    });
    fillSelect(selectors.test, unique(testBase.map((item) => item.test)), "All tests");
  }

  function updateStats() {
    selectors.total.textContent = state.payload.tests.length.toLocaleString();
    selectors.subjectCount.textContent = state.payload.subjects.length.toLocaleString();
    selectors.attempted.textContent = Object.keys(state.attempts).length.toLocaleString();
    selectors.countBadge.textContent = `${state.filtered.length.toLocaleString()} visible`;
  }

  function optionButton(item, option) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-button";
    button.innerHTML = `<span>${option.identifier}</span><div>${option.content}</div>`;

    const attempt = state.attempts[item.id];
    if (attempt) {
      button.disabled = true;
      if (item.correct_options.includes(option.identifier)) {
        button.classList.add("correct");
      }
      if (attempt.selected === option.identifier && !attempt.correct) {
        button.classList.add("wrong");
      }
      return button;
    }

    button.addEventListener("click", () => {
      const correctKnown = item.correct_options.length > 0;
      const correct = correctKnown ? item.correct_options.includes(option.identifier) : null;
      state.attempts[item.id] = {
        selected: option.identifier,
        correct,
        created_at: new Date().toISOString(),
      };
      writeAttempts();
      render();
    });
    return button;
  }

  function answerPanel(item) {
    const panel = document.createElement("section");
    panel.className = "panel result-panel";

    const attempt = state.attempts[item.id];
    if (attempt?.correct === true) {
      panel.classList.add("right");
    } else if (attempt?.correct === false) {
      panel.classList.add("wrong");
    }

    const title = document.createElement("h2");
    title.textContent = attempt
      ? attempt.correct === true
        ? "Correct"
        : attempt.correct === false
          ? "Wrong"
          : "Attempt saved"
      : "Answer";

    const line = document.createElement("p");
    line.className = "answer-line";
    const correct = item.correct_options.length ? item.correct_options.join(", ") : item.answer || "See explanation";
    line.textContent = attempt ? `Selected: ${attempt.selected} | Answer: ${correct}` : `Answer: ${correct}`;

    const heading = document.createElement("h3");
    heading.textContent = "Explanation";
    const body = document.createElement("div");
    body.className = "solution";
    body.textContent = item.explanation || "Explanation is not available for this extracted item.";

    panel.append(title, line, heading, body);
    return panel;
  }

  function render() {
    selectors.board.replaceChildren();
    updateStats();

    if (!state.filtered.length) {
      selectors.board.append(
        QuizApp.createEmptyState("No extracted tests found for this filter. Maths has Circle now; Physics and Chemistry are ready for the next PDFs.")
      );
      selectors.pageInfo.textContent = "No questions";
      selectors.prev.disabled = true;
      selectors.next.disabled = true;
      selectors.status.textContent = "No tests matched the current filters.";
      return;
    }

    const item = state.filtered[state.currentIndex];
    const card = document.createElement("article");
    card.className = "panel question-card";

    const meta = document.createElement("div");
    meta.className = "question-meta";
    [item.subject, item.chapter, item.subtopic, item.test, item.question_id]
      .filter(Boolean)
      .forEach((value) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = value;
        meta.append(pill);
      });

    const question = document.createElement("div");
    question.className = "question-text";
    question.textContent = item.question || "Question text unavailable.";

    card.append(meta, question);

    if (item.options.length) {
      const options = document.createElement("div");
      options.className = "options";
      item.options.forEach((option) => options.append(optionButton(item, option)));
      card.append(options);
    } else {
      const reveal = document.createElement("button");
      reveal.type = "button";
      reveal.className = "secondary-button reveal-button";
      reveal.textContent = state.attempts[item.id] ? "Answer shown" : "Show answer";
      reveal.disabled = Boolean(state.attempts[item.id]);
      reveal.addEventListener("click", () => {
        state.attempts[item.id] = {
          selected: "Shown",
          correct: null,
          created_at: new Date().toISOString(),
        };
        writeAttempts();
        render();
      });
      card.append(reveal);
    }

    selectors.board.append(card);
    if (state.attempts[item.id]) {
      selectors.board.append(answerPanel(item));
    }

    selectors.pageInfo.textContent = `Question ${state.currentIndex + 1} of ${state.filtered.length}`;
    selectors.prev.disabled = state.currentIndex <= 0;
    selectors.next.disabled = state.currentIndex >= state.filtered.length - 1;
    selectors.status.textContent = `${state.filtered.length.toLocaleString()} extracted tests available for this filter.`;
    QuizApp.renderMath(selectors.board);
  }

  function attachEvents() {
    selectors.form.addEventListener("submit", (event) => {
      event.preventDefault();
      state.currentIndex = 0;
      syncDropdowns();
      applyFilters();
      render();
    });

    selectors.subject.addEventListener("change", () => {
      selectors.chapter.value = "";
      selectors.subtopic.value = "";
      selectors.test.value = "";
      syncDropdowns();
    });

    selectors.chapter.addEventListener("change", () => {
      selectors.subtopic.value = "";
      selectors.test.value = "";
      syncDropdowns();
    });

    selectors.subtopic.addEventListener("change", () => {
      selectors.test.value = "";
      syncDropdowns();
    });

    selectors.prev.addEventListener("click", () => {
      state.currentIndex = Math.max(state.currentIndex - 1, 0);
      render();
    });

    selectors.next.addEventListener("click", () => {
      state.currentIndex = Math.min(state.currentIndex + 1, state.filtered.length - 1);
      render();
    });
  }

  async function init() {
    QuizApp.markActiveNav("jee");
    state.attempts = readAttempts();
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error(`Unable to load extracted tests (${response.status})`);
    }
    state.payload = await response.json();
    syncDropdowns();
    applyFilters();
    attachEvents();
    render();
  }

  init().catch((error) => {
    selectors.status.textContent = error.message || "Unable to load extracted tests.";
    selectors.status.classList.add("error");
  });
})();
