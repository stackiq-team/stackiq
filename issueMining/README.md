
# IssuesClassifier

The GitHub APIs provide a rich resource for exploring issue resolution patterns across open-source projects. However, for researchers and developers aiming to analyze issue lifecycles at scale, the default APIs present challenges such as rate limits, query caps, and pagination complexity.

**IssuesClassifier** is a modular Node.js pipeline built around the GitHub GraphQL API and OpenAI’s GPT models. It enables you to automatically retrieve, clean, classify, and analyze GitHub issues — helping you understand how well-maintained and responsive a repository is. The tool supports a full analysis pipeline from raw issue download to CSV statistical output.

---

## Prerequisites

Before running the scripts, make sure you have the following dependencies installed:

- `@octokit/graphql`: To perform GitHub GraphQL queries
- `graphql-request`: Additional GraphQL request support
- `axios`: For OpenAI API integration
- `fs`: To handle file operations
- `minimist`: To parse command-line arguments
- `dotenv`: To manage environment variables (API keys)
- `csv-writer` (optional): If you want to customize CSV writing

You can install all required dependencies with:

```bash
npm install
```

---

## GitHub GraphQL API

This tool depends on GitHub’s GraphQL API to fetch issues and timeline events. For detailed reference on how GraphQL queries work, see the [GitHub GraphQL API Documentation](https://docs.github.com/en/graphql).

To authenticate, you will need a GitHub personal access token with at least `repo` and `read:org` scopes.

You will also need an OpenAI API key to use GPT-based classification.

---

## Usage

This tool is designed to be flexible: you can run the **entire analysis pipeline** with one command, or execute **individual scripts** step-by-step.

---

### 🔁 Run full pipeline

```bash
node run-all.js "author" "repository" "YYYY-MM-DD"
```

This command will:

1. Fetch all closed issues since the provided date
2. Download the full timeline for each issue
3. Summarize key data fields
4. Classify each issue using GPT + rules
5. Analyze results and export statistics
6. Count external repository mentions

---

### 🧰 Run individual modules

Each script can be executed independently as follows:

#### 1. Fetch closed issues:

```bash
node issues.js "author/repository" "YYYY-MM-DD"
```

> Retrieves all closed issues after the specified date  
> Output: `issues_raw.json`

---

#### 2. Fetch full issue timelines:

```bash
node fetch.js issues_raw.json
```

> Adds timeline data (events, comments, links)  
> Output: `issues_full.json`

---

#### 3. Summarize issue metadata:

```bash
node summarize.js
```

> Extracts important fields (last comment, labels, links)  
> Output: `issues_res.json`

---

#### 4. Classify issues:

```bash
node classify.js issues_res.json
```

> Classifies each issue using OpenAI + local rules  
> Output: `classifications.csv`

---

#### 5. Analyze classification results:

```bash
node analyze.js
```

> Outputs % per category (e.g. 43% `fixed_by_devs`, 28% `inactivity`, etc.)  
> Output: `classification_stats.csv`

---

#### 6. Count external repository links:

```bash
node count.js issues_res.json
```

> Finds mentions of other GitHub repositories in:
> - Comments (e.g. links to other repos)
> - Cross-referenced issues/PRs  
> Output: `external_comments.csv`, `external_crossrefs.csv`, `summary_counts.csv`

---

## Placeholders

- `"author"`: The GitHub username/organization (e.g. `alandtse`)
- `"repository"`: The repo name (e.g. `alexa_media_player`)
- `"YYYY-MM-DD"`: Start date (e.g. `2023-01-01`)

---

## Output

The tool produces multiple structured outputs:

### JSON Files

- `issues_raw.json`: Closed issues metadata  
- `issues_full.json`: Timeline + events per issue  
- `issues_res.json`: Cleaned and summarized issue data

### CSV Files

- `classifications.csv`: Issue ID + classification label
- `classification_stats.csv`: Aggregated classification stats (%)
- `external_comments.csv`: Repos linked in issue comments
- `external_crossrefs.csv`: Repos mentioned in cross-references
- `summary_counts.csv`: Count of PR and commit links per issue

---

## Classification Labels

Each issue is assigned to one of the following categories:

- `fixed_by_devs`: Closed via PR, commit, or explicit fix
- `inactivity`: Closed for inactivity (bot or silence)
- `duplicate`: Labeled as duplicate or linked to another issue
- `workaround`: Closed with a workaround mentioned in comments
- `not_our_problem`: Redirected to another repo or external cause
- `non_issue`: Author closed their own invalid issue
- `not_enough_info`: Closed due to missing feedback/info
- `other`: Unclear or uncommon case

---

## Customization

You can adapt:

- Classification rules in `classify.js`
- Comment/link patterns in `summarize.js`
- Output formatting (JSON, CSV, filters)
- Dictionary or sentiment logic (future extensions)

---

## Output Interpretation

The data allows you to answer:

- Is this project responsive to users?
- Are issues resolved quickly and directly?
- Does the community suggest workarounds or ignore reports?
- Are other repos consistently blamed or mentioned?

---

## License

MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

Feel free to customize this project according to your goals. Contributions welcome!
