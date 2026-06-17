export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    return res.status(500).json({
      error: "Missing GROQ_API_KEY in Vercel environment variables."
    });
  }

  const body = req.body || {};
  const elements = Array.isArray(body.elements) ? body.elements.slice(0, 220) : [];
  const instructions = String(body.instructions || "").slice(0, 1200);

  const system = `
You are the AI mobile optimizer for a visual HTML landing page editor.
Your job: create mobile-only CSS override operations from a desktop layout.
Never rewrite the whole page. Never remove desktop styles.
Return ONLY valid JSON, no markdown.

Allowed output shape:
{
  "operations": [
    {
      "id": "vhe-123",
      "css": {
        "fontSize": "32px",
        "lineHeight": "1.1",
        "width": "100%",
        "height": "auto",
        "maxWidth": "360px",
        "marginTop": "12px",
        "marginBottom": "18px",
        "paddingTop": "34px",
        "paddingBottom": "34px",
        "borderRadius": "18px",
        "textAlign": "center"
      },
      "classAdd": ["vhe-mobile-stack", "vhe-mobile-center"],
      "reason": "short reason"
    }
  ],
  "notes": ["short practical notes"]
}

Allowed css keys only:
fontSize, lineHeight, color, background, backgroundColor, borderColor, width, height, maxWidth, borderRadius, marginTop, marginBottom, paddingTop, paddingBottom, left, top, fontWeight, textAlign.

Rules:
- Optimize for mobile width around 390px.
- Stack multi-column containers by adding classAdd "vhe-mobile-stack".
- Center CTAs/images/sections with classAdd "vhe-mobile-center".
- Images must use height: "auto" and usually maxWidth: "100%".
- Big desktop H1 text should usually be 28px to 38px on mobile.
- Body text should be at least 16px.
- CTAs should be easy to tap, often width: "100%" and maxWidth: "360px".
- Reduce oversized section padding.
- Avoid horizontal overflow.
- Do not include dangerous CSS like url(), javascript:, or expression().
- Only target IDs that exist in the provided elements list.
`;

  const user = {
    targetWidth: body.targetWidth || 390,
    desktopWidth: body.desktopWidth || null,
    instructions,
    elements
  };

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 3500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) }
        ]
      })
    });

    const raw = await groqResponse.text();

    if (!groqResponse.ok) {
      return res.status(groqResponse.status).json({
        error: "Groq API error",
        details: raw.slice(0, 1000)
      });
    }

    let data = JSON.parse(raw);
    let content = data?.choices?.[0]?.message?.content || "";

    content = content.trim();
    content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not find JSON in model response.");
      parsed = JSON.parse(match[0]);
    }

    if (!parsed.operations || !Array.isArray(parsed.operations)) {
      parsed.operations = [];
    }

    parsed.operations = parsed.operations.slice(0, 220).map(op => ({
      id: String(op.id || ""),
      css: op.css && typeof op.css === "object" ? op.css : {},
      classAdd: Array.isArray(op.classAdd) ? op.classAdd.filter(c => ["vhe-mobile-stack", "vhe-mobile-center"].includes(c)) : [],
      reason: String(op.reason || "").slice(0, 180)
    })).filter(op => op.id);

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: "AI mobile optimization failed.",
      details: error.message
    });
  }
}
