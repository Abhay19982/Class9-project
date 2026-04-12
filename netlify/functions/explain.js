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
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: text }),
      };
    }

    const data = await response.json();
    const explanation =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output
            .flatMap((item) => item.content || [])
            .map((item) => item.text || "")
            .join("\n")
        : "");

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

