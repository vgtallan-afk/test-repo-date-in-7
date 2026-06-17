export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const apiKey = process.env.GROQ_API_KEY;
  const textModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const visionModel = process.env.GROQ_VISION_MODEL || process.env.GROQ_MODEL_VISION || "meta-llama/llama-4-scout-17b-16e-instruct";

  if (!apiKey) return res.status(500).json({ error: "Missing GROQ_API_KEY in Vercel environment variables." });

  const body = req.body || {};
  const action = body.action || "edit";

  const safeFonts = [
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif",
    "Arial,Helvetica,sans-serif",
    "Verdana,Geneva,sans-serif",
    "Tahoma,Geneva,sans-serif",
    "Trebuchet MS,Arial,sans-serif",
    "Georgia,serif",
    "Times New Roman,serif",
    "Impact,Arial Black,sans-serif"
  ];

  async function callGroq(messages, model, max_tokens = 3500) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens, messages })
    });

    const raw = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: "Groq API error", details: raw.slice(0, 1500) });

    const data = JSON.parse(raw);
    let content = data?.choices?.[0]?.message?.content || "{}";
    content = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

    try { return JSON.parse(content); }
    catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not parse JSON from model response.");
      return JSON.parse(match[0]);
    }
  }

  try {
    if (action === "analyzeBrand") {
      const image = String(body.image || "");
      if (!image.startsWith("data:image/")) return res.status(400).json({ error: "Missing brand sheet image data URL." });

      const system = `You analyze brand board images for a visual HTML editor. Return ONLY JSON.
Output shape:
{
  "brand": {
    "colors": {"heading":"#111111","cta":"#111111","background":"#ffffff","text":"#111111","accent":"#d4af37"},
    "fontStack":"one of the browser-safe font stacks provided",
    "fontNotes":"short note if exact font is unavailable",
    "summary":"short visual identity summary",
    "rules":["short design rule", "short typography rule"]
  }
}
Use only browser-safe fonts. Do not ask the user to download fonts. Browser-safe options: ${safeFonts.join(" | ")}.`;

      const parsed = await callGroq([
        { role: "system", content: system },
        { role: "user", content: [
          { type: "text", text: "Analyze this brand sheet and extract practical brand kit settings for an HTML landing page editor." },
          { type: "image_url", image_url: { url: image } }
        ] }
      ], visionModel, 1800);

      if (!parsed.brand) parsed.brand = {};
      if (!parsed.brand.fontStack || !safeFonts.includes(parsed.brand.fontStack)) parsed.brand.fontStack = safeFonts[0];
      return res.status(200).json(parsed);
    }

    const prompt = String(body.prompt || "").slice(0, 3000);
    const context = body.context || {};
    const elements = Array.isArray(context.elements) ? context.elements.slice(0, 260) : [];
    const scope = String(context.scope || "selected");
    const mode = String(context.mode || "design");

    const system = `You are the safe AI editor inside XFORGE NOVA X2, a visual HTML landing page editor.
The user is not a developer. Return ONLY valid JSON. Do not use markdown.
You may create/edit design and HTML structure, but do NOT rewrite the whole document.
Do not write new sales copy unless the user provided the exact content or asks to structure provided content.
Prefer safe, small operations.

Allowed JSON output:
{
  "reply":"short explanation",
  "operations":[
    {"type":"setText","id":"vhe-1","text":"New text"},
    {"type":"setHTML","id":"vhe-1","html":"<strong>safe inline HTML</strong>"},
    {"type":"setStyle","id":"vhe-1","css":{"color":"#ffffff","fontSize":"32px","background":"#111111","borderRadius":"18px"}},
    {"type":"setAttr","id":"vhe-1","attrs":{"href":"https://example.com","alt":"Image description"}},
    {"type":"insertHTML","target":"body|selected|section","id":"optional-target-id","position":"before|after|append|prepend","html":"<section>...</section>"},
    {"type":"remove","id":"vhe-1"}
  ],
  "notes":["short note"]
}

Allowed CSS keys only:
color, background, backgroundColor, borderColor, fontSize, fontFamily, fontWeight, fontStyle, lineHeight, letterSpacing, textAlign, textDecoration, width, height, maxWidth, minHeight, borderRadius, marginTop, marginBottom, marginLeft, marginRight, paddingTop, paddingBottom, paddingLeft, paddingRight, display, gap, gridTemplateColumns, justifyContent, alignItems, opacity, boxShadow.

Safety rules:
- Use only IDs from provided elements for existing-element operations.
- For new sections, use clean inline HTML only. No scripts, forms, external JS, iframes unless user explicitly asks for video embed.
- For brand work, use the provided Brand Kit and browser-safe fonts only.
- For selected scope, modify only selectedId/selectedIds unless inserting a new section after selected section.
- For page scope, mass changes are allowed but still use operations.
- Keep landing pages fast, clean, and mobile-friendly.`;

    const user = {
      prompt,
      scope,
      mode,
      selectedId: context.selectedId || null,
      selectedIds: context.selectedIds || [],
      selectedSectionId: context.selectedSectionId || null,
      brand: context.brand || {},
      bodyText: String(context.bodyText || "").slice(0, 3500),
      elements
    };

    const parsed = await callGroq([
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(user) }
    ], textModel, 4500);

    if (!Array.isArray(parsed.operations)) parsed.operations = [];
    parsed.operations = parsed.operations.slice(0, 160).filter(op => op && typeof op === "object" && op.type);
    parsed.reply = String(parsed.reply || "Preview ready.").slice(0, 700);
    if (!Array.isArray(parsed.notes)) parsed.notes = [];

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: "AI editor failed.", details: error.message });
  }
}
