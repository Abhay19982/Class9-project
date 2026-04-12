(function () {
  const state = {
    attempts: [],
    index: 0,
  };

  const selectors = {
    codeBadge: document.querySelector("#userCodeBadge"),
    changeCode: document.querySelector("#changeCodeBtn"),
    board: document.querySelector("#analysisBoard"),
    status: document.querySelector("#analysisStatus"),
    reviewInfo: document.querySelector("#reviewInfo"),
    reviewCount: document.querySelector("#reviewCount"),
    correctCount: document.querySelector("#correctCount"),
    incorrectCount: document.querySelector("#incorrectCount"),
    prev: document.querySelector("#prevReviewBtn"),
    next: document.querySelector("#nextReviewBtn"),
  };

  function setStatus(message, isError = false) {
    selectors.status.textContent = message;
    selectors.status.classList.toggle("error", isError);
  }

  function renderReview() {
    selectors.board.replaceChildren();

    if (!state.attempts.length) {
      selectors.board.append(
        QuizApp.createEmptyState("No attempts to review yet. Try the quiz first.")
      );
      selectors.reviewInfo.textContent = "No review";
      selectors.prev.disabled = true;
      selectors.next.disabled = true;
      setStatus("No attempts to review.");
      return;
    }

    const attempt = state.attempts[state.index];
    const article = document.createElement("article");
    article.className = "panel question-card analysis-card";

    const meta = document.createElement("div");
    meta.className = "question-meta";
    [
      attempt.subject,
      attempt.chapter,
      attempt.topic,
      attempt.difficulty,
      attempt.correct ? "Correct" : "Wrong",
    ]
      .filter(Boolean)
      .forEach((value) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = value;
        meta.append(pill);
      });

    const text = document.createElement("div");
    text.className = "question-text";
    text.innerHTML = attempt.question;

    const answerBlock = document.createElement("div");
    answerBlock.className = "analysis-answer-grid";
    answerBlock.innerHTML = `
      <div class="panel mini-panel">
        <h3>Selected answer</h3>
        <p>${attempt.selected}</p>
      </div>
      <div class="panel mini-panel">
        <h3>Correct answer</h3>
        <p>${attempt.correct_option}</p>
      </div>
      <div class="panel mini-panel">
        <h3>Time</h3>
        <p>${QuizApp.formatSeconds(attempt.elapsed_seconds || 0)}</p>
      </div>
    `;

    const staticExplain = document.createElement("section");
    staticExplain.className = "panel explanation-panel";
    staticExplain.innerHTML = `
      <h3>Explanation</h3>
      <div class="solution">${attempt.explanation || QuizApp.getStaticExplanation(attempt)}</div>
    `;

    const aiExplain = document.createElement("section");
    aiExplain.className = "panel explanation-panel";
    aiExplain.innerHTML = `
      <h3>AI Explanation</h3>
      <div class="solution ai-solution">Generating explanation...</div>
    `;

    article.append(meta, text, answerBlock, staticExplain, aiExplain);
    selectors.board.append(article);

    QuizApp.getAIExplanation(attempt)
      .then((explanation) => {
        aiExplain.querySelector(".ai-solution").textContent = explanation;
        QuizApp.renderMath(aiExplain);
      })
      .catch(() => {
        aiExplain.querySelector(".ai-solution").textContent =
          "Unable to generate explanation right now.";
      });

    QuizApp.renderMath(selectors.board);
    selectors.reviewInfo.textContent = `Review ${state.index + 1} of ${state.attempts.length}`;
    selectors.prev.disabled = state.index === 0;
    selectors.next.disabled = state.index === state.attempts.length - 1;
    setStatus(`Reviewing ${attempt.question_id}`);
  }

  function initCounters() {
    const attempts = QuizApp.getCurrentUserState().attempts;
    const analytics = QuizApp.computeAnalytics(attempts);
    selectors.codeBadge.textContent = QuizApp.getCurrentUserCode();
    selectors.reviewCount.textContent = attempts.length.toLocaleString();
    selectors.correctCount.textContent = analytics.correctAnswers.toLocaleString();
    selectors.incorrectCount.textContent = analytics.incorrectAnswers.toLocaleString();
  }

  function attachEvents() {
    selectors.changeCode.addEventListener("click", () => {
      QuizApp.promptCode(true);
    });
    selectors.prev.addEventListener("click", () => {
      state.index = Math.max(state.index - 1, 0);
      renderReview();
    });
    selectors.next.addEventListener("click", () => {
      state.index = Math.min(state.index + 1, state.attempts.length - 1);
      renderReview();
    });
  }

  function init() {
    QuizApp.requireLogin(async () => {
      QuizApp.markActiveNav("analysis");
      await QuizApp.loadQuestions();
      state.attempts = QuizApp.getCurrentUserState().attempts;
      initCounters();
      attachEvents();
      renderReview();
    });
  }

  init();
})();
