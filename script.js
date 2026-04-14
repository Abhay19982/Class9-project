(function () {
  const state = {
    page: 1,
    pageSize: 100,
    pages: 1,
    currentIndex: 0,
    bundle: [],
    filteredQuestions: [],
    questionStartedAt: Date.now(),
    lastAttempt: null,
  };

  const selectors = {
    status: document.querySelector("#status"),
    board: document.querySelector("#questionBoard"),
    form: document.querySelector("#filterForm"),
    search: document.querySelector("#searchInput"),
    subject: document.querySelector("#subjectSelect"),
    chapter: document.querySelector("#chapterSelect"),
    topic: document.querySelector("#topicSelect"),
    difficulty: document.querySelector("#difficultySelect"),
    prev: document.querySelector("#prevBtn"),
    next: document.querySelector("#nextBtn"),
    prevBundle: document.querySelector("#prevBundleBtn"),
    nextBundle: document.querySelector("#nextBundleBtn"),
    pageInfo: document.querySelector("#pageInfo"),
    remaining: document.querySelector("#remainingCount"),
    attempted: document.querySelector("#attemptedCount"),
    accuracy: document.querySelector("#accuracyCount"),
    codeBadge: document.querySelector("#userCodeBadge"),
    changeCode: document.querySelector("#changeCodeBtn"),
  };

  function setStatus(message, isError = false) {
    selectors.status.textContent = message;
    selectors.status.classList.toggle("error", isError);
  }

  function currentFilters() {
    return {
      search: selectors.search.value.trim(),
      subject: selectors.subject.value,
      chapter: selectors.chapter.value,
      topic: selectors.topic.value,
      difficulty: selectors.difficulty.value,
    };
  }

  function updateHeader() {
    const code = QuizApp.getCurrentUserCode();
    const attempts = QuizApp.getCurrentUserState().attempts;
    const analytics = QuizApp.computeAnalytics(attempts);
    const remaining = QuizApp.filterUnattempted(QuizApp.getQuestions(), code).length;

    selectors.codeBadge.textContent = code;
    selectors.remaining.textContent = remaining.toLocaleString();
    selectors.attempted.textContent = analytics.totalAttempted.toLocaleString();
    selectors.accuracy.textContent = `${analytics.accuracy}%`;
  }

  function syncDropdowns() {
    const filters = currentFilters();
    const options = QuizApp.getDependentOptions(QuizApp.getQuestions(), QuizApp.getCurrentUserCode(), filters);

    QuizApp.fillSelect(selectors.subject, options.subjects, "All subjects");
    QuizApp.fillSelect(selectors.chapter, options.chapters, "All chapters");
    QuizApp.fillSelect(selectors.topic, options.topics, "All topics");
    QuizApp.fillSelect(selectors.difficulty, options.difficulties, "All difficulty");
  }

  function loadQuestions(resetIndex = true) {
    const filters = currentFilters();
    state.filteredQuestions = QuizApp.getAvailableQuestions(
      QuizApp.getQuestions(),
      QuizApp.getCurrentUserCode(),
      filters
    );

    state.pages = Math.max(Math.ceil(state.filteredQuestions.length / state.pageSize), 1);
    state.page = Math.min(Math.max(state.page, 1), state.pages);

    const start = (state.page - 1) * state.pageSize;
    state.bundle = state.filteredQuestions.slice(start, start + state.pageSize);
    state.currentIndex = resetIndex ? 0 : Math.min(state.currentIndex, Math.max(state.bundle.length - 1, 0));
    state.questionStartedAt = Date.now();

    if (!state.filteredQuestions.length) {
      selectors.board.replaceChildren(QuizApp.createEmptyState(QuizApp.allQuestionsCompleted() ? "You have completed all questions." : "No questions matched those filters."));
      selectors.pageInfo.textContent = "No questions";
      selectors.prev.disabled = true;
      selectors.next.disabled = true;
      selectors.prevBundle.disabled = true;
      selectors.nextBundle.disabled = true;
      updateHeader();
      setStatus(QuizApp.allQuestionsCompleted() ? "You have completed all questions." : "No questions matched those filters.");
      return;
    }

    renderCurrentQuestion();
    updateHeader();
    setStatus(
      `Bundle ${state.page} of ${state.pages}: ${start + 1}-${start + state.bundle.length} of ${state.filteredQuestions.length}`
    );
  }

  function renderCurrentQuestion() {
    selectors.board.replaceChildren();
    const question = state.bundle[state.currentIndex];
    if (!question) {
      return;
    }

    const existingAttempt = QuizApp.getAttemptByQuestionId(question.question_id);
    const article = document.createElement("article");
    article.className = "panel question-card";

    const meta = document.createElement("div");
    meta.className = "question-meta";
    [
      question.subject,
      question.chapter,
      question.topic,
      question.difficulty,
      `Timer ${QuizApp.formatSeconds(Math.round((Date.now() - state.questionStartedAt) / 1000))}`,
    ]
      .filter(Boolean)
      .forEach((value) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = value;
        meta.append(pill);
      });

    const prompt = document.createElement("div");
    prompt.className = "question-text";
    prompt.innerHTML = question.question || "Question text unavailable.";

    const options = document.createElement("div");
    options.className = "options";

    question.options.forEach((option, index) => {
      const identifier = option.identifier || String(index + 1);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      button.innerHTML = `<span>${identifier}</span><div>${option.content || ""}</div>`;

      if (existingAttempt) {
        button.disabled = true;
        if (QuizApp.isCorrectChoice(question, identifier)) {
          button.classList.add("correct");
        }
        if (existingAttempt.selected === identifier && !existingAttempt.correct) {
          button.classList.add("wrong");
        }
      } else {
        button.addEventListener("click", async () => {
          const elapsedSeconds = Math.max(Math.round((Date.now() - state.questionStartedAt) / 1000), 0);
          const attempt = QuizApp.recordAttempt(question, identifier, elapsedSeconds);
          if (!attempt) {
            loadQuestions(false);
            return;
          }
          state.lastAttempt = { question, attempt };
          updateHeader();
          loadQuestions(false);
          QuizApp.syncAttemptSummaryToSupabase()
            .then(() => {
              setStatus(
                `${attempt.correct ? "Correct" : "Wrong"}. Progress auto-synced to Supabase for ${QuizApp.getCurrentUserCode()}.`
              );
            })
            .catch((error) => {
              setStatus(
                `${attempt.correct ? "Correct" : "Wrong"}. Saved locally, but Supabase auto-sync failed: ${error.message}`,
                true
              );
            });
        });
      }

      options.append(button);
    });

    article.append(meta, prompt, options);

    if (state.lastAttempt) {
      selectors.board.append(resultPanel(state.lastAttempt.question, state.lastAttempt.attempt));
    }

    selectors.board.append(article);

    if (existingAttempt) {
      selectors.board.append(resultPanel(question, existingAttempt));
    }

    QuizApp.renderMath(selectors.board);
    updatePager();
  }

  function resultPanel(question, attempt) {
    const panel = document.createElement("section");
    panel.className = `panel result-panel ${attempt.correct ? "right" : "wrong"}`;

    const title = document.createElement("h2");
    title.textContent = attempt.correct ? "Correct" : "Wrong";

    const line = document.createElement("p");
    line.className = "answer-line";
    line.textContent = `Selected: ${attempt.selected} | Correct: ${attempt.correct_option}`;

    const staticHeading = document.createElement("h3");
    staticHeading.textContent = "Explanation";
    const staticBody = document.createElement("div");
    staticBody.className = "solution";
    staticBody.innerHTML = QuizApp.getStaticExplanation(question);

    const aiHeading = document.createElement("h3");
    aiHeading.textContent = "AI Explanation";
    const aiBody = document.createElement("div");
    aiBody.className = "solution ai-solution";
    aiBody.textContent = "Generating explanation...";

    panel.append(title, line, staticHeading, staticBody, aiHeading, aiBody);

    QuizApp.getAIExplanation(question)
      .then((text) => {
        aiBody.textContent = text;
        QuizApp.renderMath(aiBody);
      })
      .catch((error) => {
        aiBody.textContent = error.message || "Unable to generate explanation right now.";
      });

    return panel;
  }

  function updatePager() {
    const absoluteIndex = (state.page - 1) * state.pageSize + state.currentIndex + 1;
    selectors.pageInfo.textContent = `Question ${absoluteIndex.toLocaleString()} of ${state.filteredQuestions.length.toLocaleString()}`;
    selectors.prev.disabled = state.page === 1 && state.currentIndex === 0;
    selectors.next.disabled = state.page === state.pages && state.currentIndex >= state.bundle.length - 1;
    selectors.prevBundle.disabled = state.page <= 1;
    selectors.nextBundle.disabled = state.page >= state.pages;
  }

  function attachEvents() {
    selectors.form.addEventListener("submit", (event) => {
      event.preventDefault();
      state.page = 1;
      state.lastAttempt = null;
      syncDropdowns();
      loadQuestions(true);
    });

    selectors.subject.addEventListener("change", () => {
      selectors.chapter.value = "";
      selectors.topic.value = "";
      syncDropdowns();
    });

    selectors.chapter.addEventListener("change", () => {
      selectors.topic.value = "";
      syncDropdowns();
    });

    selectors.topic.addEventListener("change", syncDropdowns);
    selectors.difficulty.addEventListener("change", syncDropdowns);

    selectors.prev.addEventListener("click", () => {
      if (state.currentIndex > 0) {
        state.currentIndex -= 1;
        state.questionStartedAt = Date.now();
        renderCurrentQuestion();
        return;
      }
      if (state.page > 1) {
        state.page -= 1;
        loadQuestions(false);
        state.currentIndex = Math.max(state.bundle.length - 1, 0);
        state.questionStartedAt = Date.now();
        renderCurrentQuestion();
      }
    });

    selectors.next.addEventListener("click", () => {
      if (state.currentIndex < state.bundle.length - 1) {
        state.currentIndex += 1;
        state.questionStartedAt = Date.now();
        renderCurrentQuestion();
        return;
      }
      if (state.page < state.pages) {
        state.page += 1;
        loadQuestions(true);
      }
    });

    selectors.prevBundle.addEventListener("click", () => {
      state.page = Math.max(state.page - 1, 1);
      loadQuestions(true);
    });

    selectors.nextBundle.addEventListener("click", () => {
      state.page = Math.min(state.page + 1, state.pages);
      loadQuestions(true);
    });

    selectors.changeCode.addEventListener("click", () => {
      QuizApp.promptCode(true);
    });
  }

  function init() {
    QuizApp.requireLogin(async () => {
      QuizApp.markActiveNav("quiz");
      await QuizApp.loadQuestions();
      attachEvents();
      syncDropdowns();
      loadQuestions(true);
    });
  }

  init();
})();
