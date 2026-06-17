# XFORGE NOVA X1

This package gives you:

- `xforge-nova-x1-ai-mobile.html` — the visual HTML editor.
- `api/optimize-mobile.js` — a Vercel API route that calls Groq safely from the server.

## Setup on Vercel

1. Put the HTML file in your project root or `public/`.
2. Put `api/optimize-mobile.js` inside an `api` folder.
3. In Vercel, add this environment variable:

```bash
GROQ_API_KEY=your_groq_key_here
```

Optional:

```bash
GROQ_MODEL=llama-3.3-70b-versatile
```

4. Deploy.
5. In XFORGE NOVA X1, keep the endpoint as:

```text
/api/optimize-mobile
```

## Important

Do not put the Groq key inside the HTML. The HTML calls the Vercel route, and the Vercel route calls Groq.
