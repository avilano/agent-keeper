import { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config();

export type RootCauseCategory =
  | 'APP_BUG'
  | 'SELECTOR_DRIFT'
  | 'FLAKY_RACE_CONDITION'
  | 'A11Y_VIOLATION';

export interface TriageAnalysis {
  category: RootCauseCategory;
  confidence: number;
  rootCauseSummary: string;
  suggestedFix: string;
  reproduceCommand: string;
  analysisEngine: 'gemini-llm' | 'openai-llm' | 'heuristic-fallback';
}

export interface FailedTestRecord {
  title: string;
  file: string;
  line: number;
  errorMessage: string;
  snippet: string;
  stack: string;
  networkEvents: Array<{ method: string; url: string; status: number }>;
  gitDiffSummary: string;
  analysis?: TriageAnalysis;
}

function getRecentGitDiff(): string {
  try {
    const diff = execSync('git diff --stat HEAD 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 2000,
    }).trim();
    return diff || 'No uncommitted git diff detected';
  } catch {
    return 'Git diff unavailable';
  }
}

function heuristicClassify(record: FailedTestRecord): TriageAnalysis {
  const combined = `${record.errorMessage}\n${record.snippet}\n${JSON.stringify(record.networkEvents)}`;
  const relFile = path.relative(process.cwd(), record.file);
  const reproduceCommand = `npx playwright test ${relFile}:${record.line} --project=chromium --headed`;

  if (
    record.networkEvents.some((e) => e.status >= 500) ||
    /500|Internal Server Error|payment-error/i.test(combined)
  ) {
    const failingEndpoint =
      record.networkEvents.find((e) => e.status >= 500)?.url || '/api/payment/check';
    return {
      category: 'APP_BUG',
      confidence: 0.94,
      rootCauseSummary: `Backend API returned HTTP 5xx on ${failingEndpoint}, causing downstream UI assertion failure.`,
      suggestedFix: `Inspect backend handler for ${failingEndpoint} or verify upstream payment webhook/gateway response handling.`,
      reproduceCommand,
      analysisEngine: 'heuristic-fallback',
    };
  }

  if (/WCAG|A11y Violations|critical|serious/i.test(combined)) {
    return {
      category: 'A11Y_VIOLATION',
      confidence: 0.97,
      rootCauseSummary:
        'axe-core detected WCAG 2.1 AA critical/serious accessibility violations in the rendered DOM.',
      suggestedFix:
        'Ensure interactive controls have accessible names (aria-label or visible text) and meet 4.5:1 color contrast.',
      reproduceCommand,
      analysisEngine: 'heuristic-fallback',
    };
  }

  if (/getByTestId\(|getByRole\(|waiting for locator/i.test(combined)) {
    return {
      category: 'SELECTOR_DRIFT',
      confidence: 0.89,
      rootCauseSummary:
        'Playwright timed out waiting for a target locator that either changed its data-test attribute or failed to render.',
      suggestedFix:
        'Verify whether the UI component renamed its `data-test` attribute or update the Page Object locator in `src/pages/toolshop.page.ts`.',
      reproduceCommand,
      analysisEngine: 'heuristic-fallback',
    };
  }

  return {
    category: 'FLAKY_RACE_CONDITION',
    confidence: 0.78,
    rootCauseSummary:
      'Asynchronous state transition or network hydration did not settle within the assertion timeout window.',
    suggestedFix:
      'Await the underlying network response (`page.waitForResponse(...)`) or use web-first assertions (`expect(locator).toBeVisible()`) before interacting.',
    reproduceCommand,
    analysisEngine: 'heuristic-fallback',
  };
}

async function queryLlmForTriage(record: FailedTestRecord): Promise<TriageAnalysis> {
  const relFile = path.relative(process.cwd(), record.file);
  const reproduceCommand = `npx playwright test ${relFile}:${record.line} --project=chromium --headed`;
  const prompt = `You are an autonomous Principal SDET Triage Agent. Analyze this Playwright test failure and respond ONLY with valid JSON matching:
{"category": "APP_BUG" | "SELECTOR_DRIFT" | "FLAKY_RACE_CONDITION" | "A11Y_VIOLATION", "confidence": number, "rootCauseSummary": string, "suggestedFix": string}

Test: ${record.title} (${relFile}:${record.line})
Error: ${record.errorMessage}
Code Snippet: ${record.snippet}
Recent Network Calls: ${JSON.stringify(record.networkEvents)}
Git Diff: ${record.gitDiffSummary}`;

  // 1. Try Gemini API if GEMINI_API_KEY is configured
  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      if (response.ok) {
        const data: any = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          return {
            category: parsed.category || 'APP_BUG',
            confidence: parsed.confidence || 0.9,
            rootCauseSummary: parsed.rootCauseSummary,
            suggestedFix: parsed.suggestedFix,
            reproduceCommand,
            analysisEngine: 'gemini-llm',
          };
        }
      } else {
        const errText = await response.text().catch(() => '');
        console.warn(`[AI Triage] Gemini API request returned HTTP ${response.status}: ${errText.slice(0, 150)}`);
      }
    } catch (err: any) {
      console.warn(`[AI Triage] Gemini API call error: ${err?.message || err}`);
      // Fall through to heuristic fallback
    }
  }

  // 2. Try OpenAI API if OPENAI_API_KEY is configured
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (response.ok) {
        const data: any = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) {
          const parsed = JSON.parse(text);
          return {
            category: parsed.category || 'APP_BUG',
            confidence: parsed.confidence || 0.9,
            rootCauseSummary: parsed.rootCauseSummary,
            suggestedFix: parsed.suggestedFix,
            reproduceCommand,
            analysisEngine: 'openai-llm',
          };
        }
      }
    } catch {
      // Fall through to heuristic fallback
    }
  }

  return heuristicClassify(record);
}

function formatMarkdownComment(failures: FailedTestRecord[]): string {
  const lines: string[] = [
    '## 🤖 Sentinela AI Triage & Root-Cause Report',
    '',
    `Detected **${failures.length}** failing test(s). Automated root-cause classification completed:`,
    '',
    '| Test | Category | Confidence | Root Cause & Suggested Fix |',
    '| :--- | :--- | :--- | :--- |',
  ];

  for (const f of failures) {
    const relFile = path.relative(process.cwd(), f.file);
    const a = f.analysis!;
    lines.push(
      `| \`${f.title}\`<br/><sub>\`${relFile}:${f.line}\`</sub> | **\`${a.category}\`** | ${Math.round(
        a.confidence * 100
      )}% | **Cause:** ${a.rootCauseSummary}<br/>**Fix:** ${a.suggestedFix} |`
    );
  }

  lines.push('', '### ⚡ One-Click Local Reproduction', '```bash');
  for (const f of failures) {
    lines.push(f.analysis!.reproduceCommand);
  }
  lines.push('```', '');
  return lines.join('\n');
}

class AiTriageReporter implements Reporter {
  private failedTests: FailedTestRecord[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'failed' || result.status === 'timedOut') {
      const error = result.error;
      let networkEvents: Array<{ method: string; url: string; status: number }> = [];

      const netAttachment = result.attachments.find((a) => a.name === 'network-log.json');
      if (netAttachment?.body) {
        try {
          networkEvents = JSON.parse(netAttachment.body.toString('utf-8'));
        } catch {
          networkEvents = [];
        }
      }

      this.failedTests.push({
        title: test.title,
        file: test.location.file,
        line: test.location.line,
        errorMessage:
          error?.message?.replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 4).join(' ') ||
          'Unknown failure',
        snippet: error?.snippet?.replace(/\u001b\[[0-9;]*m/g, '') || '',
        stack: error?.stack?.replace(/\u001b\[[0-9;]*m/g, '').substring(0, 600) || '',
        networkEvents,
        gitDiffSummary: getRecentGitDiff(),
      });
    }
  }

  async onEnd() {
    if (this.failedTests.length === 0) return;

    for (const failure of this.failedTests) {
      failure.analysis = await queryLlmForTriage(failure);
    }

    const triageSummary = {
      timestamp: new Date().toISOString(),
      chaosMode: process.env.CHAOS_MODE || 'none',
      totalFailures: this.failedTests.length,
      failures: this.failedTests,
    };

    fs.writeFileSync('triage-report.json', JSON.stringify(triageSummary, null, 2));
    const markdown = formatMarkdownComment(this.failedTests);
    fs.writeFileSync('triage-comment.md', markdown);

    console.log(
      `\n🤖 Sentinela AI Triage report generated: triage-report.json & triage-comment.md (${this.failedTests.length} failure[s] classified).`
    );
  }
}

export default AiTriageReporter;
