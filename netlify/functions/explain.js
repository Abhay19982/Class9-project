exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
    };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const prompt = [
      "Explain this Class 9 question in simple terms.",
      `Subject: ${payload.subject || ""}`,
      `Chapter: ${payload.chapter || ""}`,
      `Question: ${payload.question || ""}`,
      "Options:",
      ...(payload.options || []).map((option) => `${option.identifier}. ${option.content}`),
      "Keep the explanation concise, clear, and student-friendly.",
      "Mention why the correct option is right.",
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You explain Class 9 questions clearly and simply. Keep the answer short, accurate, and beginner-friendly.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: text || "OpenAI request failed" }),
      };
    }

    const data = await response.json();
    const explanation =
      data.choices?.[0]?.message?.content?.trim() || "";

    if (!explanation) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "OpenAI returned an empty explanation" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ explanation }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
