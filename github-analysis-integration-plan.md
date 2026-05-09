# GitHub Analysis Integration Plan

## Repository Summary

This repository currently contains:

- `github_leaderboard_tracker.html`
  - Front-end dashboard UI for GitHub leaderboard/trending content.
  - Contains a lot of styling and client-side interaction logic.
- `github-connectivity-check.js`
  - Node script that uses the GitHub REST API to verify connectivity, rate limits, trending repositories, and release data.
  - Writes a JSON report and Markdown report.
- `readme.md`
  - Token generation and GitHub permissions guide.
- `Github Token Webhook Release Monitoring Guide.docx` / `.pdf`
  - Additional documentation already present in the repo.

## GitHub Token Generation and Usage

### Where token handling is implemented

The token is handled inside `github-connectivity-check.js`:

- `const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "github_pat_...";`
- `DEFAULT_HEADERS` includes:
  - `Accept: "application/vnd.github+json"`
  - `Authorization: `Bearer ${GITHUB_TOKEN}``
  - `X-GitHub-Api-Version: "2022-11-28"`
  - `User-Agent: "github-connectivity-check-script"`

### Important token guidance

- Do not commit personal or bot tokens into source control.
- Prefer environment variables such as `GITHUB_TOKEN`.
- The repo already has a token generation guide in `readme.md`.
- The guide recommends fine-grained personal access tokens with minimum permissions:
  - `Metadata` read-only
  - `Contents` read-only
  - Optional `Issues` / `Pull Requests` read-only

### Recommended runtime workflow

1. Create a bot account or dedicated automation account.
2. Generate a fine-grained personal access token from GitHub Settings > Developer settings > Personal access tokens.
3. Set `GITHUB_TOKEN` in your environment or CI pipeline.
4. Run the Node script with the token available.

## What the Node script already does

`github-connectivity-check.js` covers:

- Authentication check via `/user`
- Rate limit check via `/rate_limit`
- Trending repository search using GitHub Search API
  - today (created within 0 days)
  - weekly (created within 7 days)
  - monthly (created within 30 days)
- Release fetch for configured repos inside `RELEASE_REPOSITORIES`
- Output to both:
  - `github-connectivity-report.json`
  - `github-connectivity-report.md`

## Analysis Feature Integration

This repo is already suited for a backend-driven GitHub analysis feature. The current front-end is a UI dashboard, and the Node script is a good starting point for the data layer.

### Suggested architecture

1. Keep GitHub API requests server-side.
   - This isolates the token.
   - Avoids exposing `GITHUB_TOKEN` in client-side code.
2. Create a small backend endpoint such as `GET /api/analysis`.
   - Serve trending repo data and release metadata.
   - Optionally serve generated summaries.
3. Front-end can fetch this data and render it in `github_leaderboard_tracker.html`.
   - Transform the static UI into a dashboard that loads live data.

### Integration steps

1. Extract `github-connectivity-check.js` logic into a reusable module.
   - Example: `lib/github-api.js`
   - Export functions like `checkConnectivity()`, `getTrendingRepositories()`, and `getReleases()`.
2. Add an API server file.
   - Example: `server.js` or `api.js`.
   - Expose endpoints:
     - `/api/connectivity`
     - `/api/trending?window=daily|weekly|monthly`
     - `/api/releases`
3. Update the dashboard HTML to use `fetch()`.
   - Replace hardcoded sample data with API-driven data.
   - Render cards, leaderboard rows, history, and changelog from the API response.
4. Integrate Gemini summary generation.
   - Create a backend route such as `/api/summary`.
   - Use the existing dropdown action menu to request a summary for a specific repo.
   - Store summary text server-side or return it directly to the client.

## Gemini / AI Summary Integration

The UI already has placeholder support for generating summaries per repo via dropdown actions.

To integrate properly:

1. Implement a real Gemini API call server-side.
2. Use the selected repo as prompt context.
3. Return the summary through an API endpoint.
4. Update the front-end action menu to call the endpoint and show results.

## Recommended `.md` deliverable

This file can be used as the integration plan and reference for the agent responsible for wiring the analysis feature into the web app.

## Security and deployment notes

- Never store `GITHUB_TOKEN` in source code.
- Use environment variables locally and in production.
- For local development, use a `.env` file loaded by `dotenv`, or `cross-env` in npm scripts.
- Consider rate-limiting and caching GitHub API responses for the dashboard.

## Next steps

If the goal is to make this an actual web app feature, the next concrete tasks are:

1. Add a backend API wrapper around the existing GitHub connectivity script.
2. Add client-side integration in `github_leaderboard_tracker.html`.
3. Replace sample/hardcoded data with live API responses.
4. Add Gemini summary endpoint and tie it to the per-repo dropdown menu.
5. Keep token handling secure by using `process.env.GITHUB_TOKEN` only on the server.
