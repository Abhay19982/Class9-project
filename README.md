# Class 9 Quiz App

Static Netlify-ready quiz app with:

- code-based login (`USER1` to `USER5`)
- non-repeating questions per code
- smart dependent filters
- analytics dashboard
- review analysis page
- AI explanation generation with Netlify Functions fallback
- localStorage-based progress tracking

## Files

- `index.html` - quiz page
- `dashboard.html` - analytics dashboard
- `analysis.html` - review page
- `shared.js` - shared auth/storage/data helpers
- `script.js` - quiz page logic
- `dashboard.js` - dashboard logic
- `analysis.js` - analysis logic
- `styles.css` - shared design system
- `data/questions.json` - question dataset
- `assets/image.png` - local image asset

## GitHub + Netlify

This folder is designed to be pushed to GitHub and connected to Netlify as a
regular project instead of using Netlify Drop.

For AI explanations, add this environment variable in Netlify:

```text
OPENAI_API_KEY=your_key_here
```

If no key is configured, the app falls back to a lightweight local explanation.

### Recommended Netlify settings

- Base directory: leave empty
- Publish directory: `.`
- Functions directory: `netlify/functions`

Netlify will read `netlify.toml` from the repo root in this folder.

### Suggested Git workflow

```bash
cd "/Users/abhaypal/Downloads/Jee mains - codex/Class 9"
git init
git add .
git commit -m "Initial Class 9 quiz app"
```

Then create a GitHub repo and push this folder as the repo root.

## Local Preview

```bash
cd "/Users/abhaypal/Downloads/Jee mains - codex"
python3 -m http.server 3000 --directory "Class 9"
```

Open:

```text
http://127.0.0.1:3000
```
