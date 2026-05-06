const fs = require("node:fs/promises");
const path = require("node:path");

// Paste your GitHub token here, or set GITHUB_TOKEN in your environment.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "PASTE_GITHUB_TOKEN_HERE";

// GitHub API headers with Bearer token authentication.
const DEFAULT_HEADERS = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "github-connectivity-check-script",
};

// Assumptions based on the repository names you provided.
const RELEASE_REPOSITORIES = [
  "ollama/ollama",
  "langchain-ai/langchain",
  "anthropics/claude-code",
  "openclaw/openclaw",
];

const OUTPUT_JSON_FILE = "github-connectivity-report.json";
const OUTPUT_MD_FILE = "github-connectivity-report.md";

function assertToken() {
  if (!GITHUB_TOKEN || GITHUB_TOKEN === "PASTE_GITHUB_TOKEN_HERE") {
    throw new Error(
      "GitHub token missing. Set GITHUB_TOKEN or replace PASTE_GITHUB_TOKEN_HERE at the top of this file."
    );
  }
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function subtractDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return formatDateOnly(date);
}

function formatDateTime(value) {
  return value ? new Date(value).toISOString() : null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatRepo(repo) {
  return {
    full_name: repo.full_name,
    html_url: repo.html_url,
    description: repo.description,
    language: repo.language,
    stargazers_count: repo.stargazers_count,
    forks_count: repo.forks_count,
    open_issues_count: repo.open_issues_count,
    created_at: repo.created_at,
    updated_at: repo.updated_at,
    owner: repo.owner?.login || null,
  };
}

async function githubGet(endpoint, query = {}) {
  const url = new URL(`https://api.github.com${endpoint}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiMessage = data?.message ? ` GitHub API: ${data.message}` : "";
    throw new Error(`Request failed with ${response.status}.${apiMessage}`);
  }

  return {
    data,
    headers: response.headers,
  };
}

async function checkConnectivity() {
  const [{ data: user }, { data: rateLimit }] = await Promise.all([
    githubGet("/user"),
    githubGet("/rate_limit"),
  ]);

  return {
    authenticated: true,
    login: user.login,
    profile_url: user.html_url,
    rate_limit: {
      limit: rateLimit.rate.limit,
      remaining: rateLimit.rate.remaining,
      used: rateLimit.rate.used,
      reset_at: new Date(rateLimit.rate.reset * 1000).toISOString(),
    },
  };
}

// GitHub does not expose an official Trending API.
// This uses "most starred repos created in the time window" as a practical proxy.
async function getTrendingRepositories({ label, createdSince, perPage }) {
  const { data } = await githubGet("/search/repositories", {
    q: `created:>=${createdSince}`,
    sort: "stars",
    order: "desc",
    per_page: perPage,
  });

  return {
    label,
    created_since: createdSince,
    total_count: data.total_count,
    repositories: (data.items || []).map(formatRepo),
  };
}

async function getReleases(repoFullName, perPage = 5) {
  const { data } = await githubGet(`/repos/${repoFullName}/releases`, {
    per_page: perPage,
  });

  return {
    repository: repoFullName,
    releases_found: data.length,
    latest_release: data[0]
      ? {
          name: data[0].name,
          tag_name: data[0].tag_name,
          html_url: data[0].html_url,
          published_at: data[0].published_at,
          prerelease: data[0].prerelease,
          draft: data[0].draft,
        }
      : null,
    recent_releases: data.map((release) => ({
      name: release.name,
      tag_name: release.tag_name,
      html_url: release.html_url,
      published_at: release.published_at,
      prerelease: release.prerelease,
      draft: release.draft,
    })),
  };
}

function buildMarkdownReport(report) {
  const dailyTop = report.trending.today.repositories[0];

  const lines = [
    "# GitHub Connectivity Check Report",
    "",
    `Generated at: ${report.generated_at}`,
    "",
    "## Connectivity",
    `- Authenticated: ${report.connectivity.authenticated}`,
    `- GitHub user: ${report.connectivity.login}`,
    `- Profile: ${report.connectivity.profile_url}`,
    `- Rate limit: ${report.connectivity.rate_limit.remaining}/${report.connectivity.rate_limit.limit} remaining`,
    `- Rate limit reset: ${report.connectivity.rate_limit.reset_at}`,
    "",
    "## Trending Note",
    "- GitHub has no official Trending REST API.",
    "- This report uses most-starred repositories created within each period as the API-based trending approximation.",
    "",
    "## Today's Trending Repository",
  ];

  if (dailyTop) {
    lines.push(
      `- ${dailyTop.full_name} (${formatNumber(dailyTop.stargazers_count)} stars)`,
      `- URL: ${dailyTop.html_url}`,
      `- Description: ${dailyTop.description || "No description"}`,
      `- Language: ${dailyTop.language || "Unknown"}`
    );
  } else {
    lines.push("- No repositories found for today's window.");
  }

  lines.push("", "## Weekly Top 10 Trending Repositories");

  for (const repo of report.trending.weekly.repositories) {
    lines.push(
      `- ${repo.full_name} | ${formatNumber(repo.stargazers_count)} stars | ${repo.html_url}`
    );
  }

  lines.push("", "## Monthly Top Trending Repositories");

  for (const repo of report.trending.monthly.repositories) {
    lines.push(
      `- ${repo.full_name} | ${formatNumber(repo.stargazers_count)} stars | ${repo.html_url}`
    );
  }

  lines.push("", "## Releases");

  for (const releaseInfo of report.releases) {
    lines.push(`### ${releaseInfo.repository}`);

    if (!releaseInfo.latest_release) {
      lines.push("- No releases found.");
      continue;
    }

    lines.push(
      `- Latest release: ${releaseInfo.latest_release.name || releaseInfo.latest_release.tag_name}`,
      `- Tag: ${releaseInfo.latest_release.tag_name}`,
      `- Published at: ${releaseInfo.latest_release.published_at}`,
      `- URL: ${releaseInfo.latest_release.html_url}`
    );
  }

  lines.push("");
  return lines.join("\n");
}

async function writeReports(report) {
  const outputDir = process.cwd();
  const jsonPath = path.join(outputDir, OUTPUT_JSON_FILE);
  const mdPath = path.join(outputDir, OUTPUT_MD_FILE);

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(mdPath, buildMarkdownReport(report), "utf8");

  return { jsonPath, mdPath };
}

async function main() {
  assertToken();

  const connectivity = await checkConnectivity();

  const [today, weekly, monthly, releases] = await Promise.all([
    getTrendingRepositories({
      label: "today",
      createdSince: subtractDays(0),
      perPage: 1,
    }),
    getTrendingRepositories({
      label: "weekly",
      createdSince: subtractDays(7),
      perPage: 10,
    }),
    getTrendingRepositories({
      label: "monthly",
      createdSince: subtractDays(30),
      perPage: 10,
    }),
    Promise.all(RELEASE_REPOSITORIES.map((repo) => getReleases(repo))),
  ]);

  const report = {
    generated_at: new Date().toISOString(),
    connectivity,
    assumptions: {
      release_repositories: RELEASE_REPOSITORIES,
      trending_method:
        "Most-starred repositories created within the time window, using the GitHub Search API.",
    },
    trending: {
      today,
      weekly,
      monthly,
    },
    releases,
  };

  const outputFiles = await writeReports(report);

  console.log("GitHub connectivity check completed successfully.");
  console.log(`Authenticated user: ${connectivity.login}`);
  console.log(
    `Rate limit remaining: ${connectivity.rate_limit.remaining}/${connectivity.rate_limit.limit}`
  );

  if (today.repositories[0]) {
    console.log(
      `Today's top repository: ${today.repositories[0].full_name} (${formatNumber(
        today.repositories[0].stargazers_count
      )} stars)`
    );
  } else {
    console.log("Today's top repository: no results found.");
  }

  console.log(`JSON report: ${outputFiles.jsonPath}`);
  console.log(`Markdown report: ${outputFiles.mdPath}`);
}

main().catch((error) => {
  console.error("GitHub connectivity check failed.");
  console.error(error.message);
  process.exitCode = 1;
});
