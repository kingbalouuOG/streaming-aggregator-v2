/**
 * Videx Taste Profile — Playwright E2E Test Runner (Layer 2)
 *
 * Navigates the actual app through onboarding → quiz → homepage,
 * persisting data to Supabase. Each run creates a tagged test user.
 *
 * Usage (from project root):
 *   npx playwright test .claude/skills/taste-profile-tester/scripts/e2e-runner.spec.ts \
 *     --config .claude/skills/taste-profile-tester/scripts/playwright.config.ts
 */

import { test, expect, Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG_PATH = join(__dirname, 'test-config.json');
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
const e2eConfig = config.e2e;

const OUTPUT_DIR = e2eConfig.outputDir;
mkdirSync(OUTPUT_DIR, { recursive: true });

// Load Supabase env vars for marking test users
const ENV_PATH = join(__dirname, '../../../../.env');
const envVars: Record<string, string> = {};
try {
  readFileSync(ENV_PATH, 'utf-8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) envVars[match[1].trim()] = match[2].trim();
  });
} catch { /* .env not found — is_test_user marking will be skipped */ }
const SUPABASE_URL = envVars['VITE_SUPABASE_URL'] || '';
const SUPABASE_ANON_KEY = envVars['VITE_SUPABASE_ANON_KEY'] || '';

// =============================================================================
// TYPES
// =============================================================================

interface E2EScenario {
  id: string;
  scenarioType: string;
  userName: string;
  services: string[];
  clusters: string[];
  quizAnswers: ('A' | 'B' | 'Both' | 'Neither')[];
  interactionDelay: number;
}

interface E2EResult {
  id: string;
  scenarioType: string;
  userName: string;
  input: {
    services: string[];
    clusters: string[];
    quizAnswers: string[];
  };
  tasteProfile: any | null;
  homepageSections: string[];
  forYouTitles: string[];
  errors: string[];
  duration: number;
  timestamp: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function randomFromArray<T>(arr: T[], count: number | string): T[] {
  if (typeof count === 'string' && count.startsWith('random_')) {
    const [min, max] = count.replace('random_', '').split('_to_').map(Number);
    count = Math.floor(Math.random() * (max - min + 1)) + min;
  }
  if (count === 'all') return [...arr];
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count as number, arr.length));
}

function generateAnswer(distribution: Record<string, number>): 'A' | 'B' | 'Both' | 'Neither' {
  const rand = Math.random();
  let cumulative = 0;
  for (const [choice, probability] of Object.entries(distribution)) {
    cumulative += probability;
    if (rand <= cumulative) return choice as any;
  }
  return 'A';
}

// Test title uses a deterministic name; actual auth username gets a unique stamp at runtime
function makeScenarioLabel(scenarioType: string, index: number): string {
  return `${scenarioType}_${index}`;
}

const TEST_PASSWORD = 'TestPass1!';  // meets all strength requirements

/** Generate a unique, valid username at test runtime (alphanumeric, 3+ chars) */
function makeRuntimeUsername(scenarioLabel: string): string {
  const slug = scenarioLabel.replace(/[^a-z0-9]/g, '');
  const stamp = Date.now().toString(36).slice(-6);
  return `t${slug}${stamp}`;
}

function makeTestEmail(userName: string): string {
  return `${userName}@videx-e2e-test.local`;
}

// Service display names as they appear in the onboarding UI
const AVAILABLE_SERVICES = [
  'Netflix', 'Prime Video', 'Apple TV+', 'Disney+', 'NOW',
  'Sky Go', 'Paramount+', 'BBC iPlayer', 'ITVX', 'Channel 4',
];

// Cluster display names from tasteClusters.ts
const AVAILABLE_CLUSTERS = [
  'Feel-Good & Funny', 'Action & Adrenaline', 'Dark Thrillers',
  'Rom-Coms & Love Stories', 'Epic Sci-Fi & Fantasy', 'Horror & Supernatural',
  'Mind-Bending Mysteries', 'Heartfelt Drama', 'True Crime & Real Stories',
  'Anime & Animation', 'Prestige & Award-Winners', 'History & War',
  'Reality & Entertainment', 'Cult & Indie', 'Family & Kids',
  'Westerns & Frontier',
];

// =============================================================================
// SCENARIO GENERATOR
// =============================================================================

function generateScenarios(): E2EScenario[] {
  const scenarios: E2EScenario[] = [];
  let runIndex = 0;

  for (const [scenarioType, scenarioConfig] of Object.entries(e2eConfig.scenarios) as any[]) {
    for (let i = 0; i < scenarioConfig.runs; i++) {
      runIndex++;
      const userName = makeScenarioLabel(scenarioType, i + 1);

      const services = randomFromArray(AVAILABLE_SERVICES, scenarioConfig.services);
      const clusters = randomFromArray(AVAILABLE_CLUSTERS, scenarioConfig.clusters);

      const quizAnswers: ('A' | 'B' | 'Both' | 'Neither')[] = [];
      for (let q = 0; q < 10; q++) {
        quizAnswers.push(generateAnswer(scenarioConfig.answerDistribution));
      }

      scenarios.push({
        id: `e2e_${runIndex}`,
        scenarioType,
        userName,
        services,
        clusters,
        quizAnswers,
        interactionDelay: scenarioConfig.interactionDelay || 300
      });
    }
  }

  return scenarios;
}

// =============================================================================
// PAGE INTERACTION FUNCTIONS
// =============================================================================

/**
 * Auth: Create a test account via the sign-up flow.
 *
 * The app gates all content behind Supabase auth. Each E2E run
 * creates a fresh account so onboarding is guaranteed to appear.
 *
 * Flow: Sign-in screen → click "Sign up" → fill form → submit →
 *       sign-up success interstitial (auto-advances ~2.6s) → onboarding
 */
async function signUpTestUser(page: Page, scenario: E2EScenario) {
  const runtimeUsername = makeRuntimeUsername(scenario.userName);
  const email = makeTestEmail(runtimeUsername);

  // Wait for auth screen to load (sign-in is the default view)
  await page.locator('h1').filter({ hasText: 'Welcome back' }).waitFor({ state: 'visible', timeout: 15000 });

  // Navigate to sign-up ("Don't have an account? Create one")
  await page.locator('button').filter({ hasText: 'Create one' }).click();
  // Wait for sign-up screen to fully render (slide animation)
  await page.locator('h1').filter({ hasText: 'Create Account' }).waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);

  // Fill email (now on the sign-up screen's email input)
  await page.locator('input[placeholder="Email address"]').fill(email);
  await page.waitForTimeout(100);

  // Fill username and wait for availability check to resolve
  await page.locator('input[placeholder="Username"]').fill(runtimeUsername);
  // Wait for "Username is available" indicator (600ms debounce + API call)
  try {
    await page.locator('text=Username is available').waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    console.warn('Username availability check did not resolve — proceeding anyway');
  }

  // Fill password
  await page.locator('input[placeholder="Password"]').fill(TEST_PASSWORD);
  await page.waitForTimeout(100);

  // Fill confirm password
  await page.locator('input[placeholder="Confirm password"]').fill(TEST_PASSWORD);
  await page.waitForTimeout(300);

  // Submit — wait for the button to become enabled (all validations pass)
  const createBtn = page.locator('button').filter({ hasText: 'Create Account' });
  await expect(createBtn).toBeEnabled({ timeout: 10000 });
  await createBtn.click();

  // Wait for sign-up success screen to auto-advance (~2.6s animation)
  await page.waitForTimeout(4000);

  // Mark as test user in Supabase profiles table
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    await page.evaluate(async ({ url, anonKey }) => {
      // Find the Supabase session in localStorage
      const keys = Object.keys(localStorage);
      const sessionKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (!sessionKey) return;
      const session = JSON.parse(localStorage.getItem(sessionKey)!);
      const accessToken = session?.access_token;
      const userId = session?.user?.id;
      if (!accessToken || !userId) return;

      await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${accessToken}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ is_test_user: true }),
      });
    }, { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  }
}

/**
 * Step 0: Select streaming services.
 *
 * Services are displayed in a 2-column grid of rounded buttons.
 * Each button contains the platform logo + name as a span.
 */
async function selectServices(page: Page, scenario: E2EScenario) {
  await page.locator('text=Your Services').waitFor({ state: 'visible', timeout: 10000 });

  for (const service of scenario.services) {
    try {
      const serviceButton = page.locator('button.rounded-2xl').filter({ hasText: service }).first();
      await serviceButton.click();
      await page.waitForTimeout(100);
    } catch (e) {
      console.warn(`Could not select service: ${service}`);
    }
  }

  const continueBtn = page.locator('button').filter({ hasText: 'Continue' }).last();
  await continueBtn.click();
  await page.waitForTimeout(scenario.interactionDelay);
}

/**
 * Step 1: Select taste clusters (3–5).
 *
 * Clusters are displayed in a 2-column grid with emoji + name.
 * Continue is disabled until at least 3 are selected.
 */
async function selectClusters(page: Page, scenario: E2EScenario) {
  await page.locator('text=Your Taste').waitFor({ state: 'visible', timeout: 10000 });

  for (const cluster of scenario.clusters) {
    try {
      const clusterButton = page.locator('button.rounded-2xl').filter({ hasText: cluster }).first();
      await clusterButton.click();
      await page.waitForTimeout(100);
    } catch (e) {
      console.warn(`Could not select cluster: ${cluster}`);
    }
  }

  const continueBtn = page.locator('button').filter({ hasText: 'Continue' }).last();
  await continueBtn.click();
  await page.waitForTimeout(scenario.interactionDelay);
}

/**
 * Step 2a: Click through the quiz intro screen.
 */
async function startQuiz(page: Page, scenario: E2EScenario) {
  const letsGoBtn = page.locator('button').filter({ hasText: "Let's go" });
  await letsGoBtn.waitFor({ state: 'visible', timeout: 10000 });
  await letsGoBtn.click();
  await page.waitForTimeout(scenario.interactionDelay);
}

/**
 * Step 2b: Complete the 10-question taste quiz.
 *
 * Each question shows two poster cards side-by-side (A = left, B = right).
 * Below the cards are "Neither" and "Both" buttons.
 * After question 5, an interstitial auto-advances after ~2.3s.
 */
async function completeQuiz(page: Page, scenario: E2EScenario) {
  for (let q = 0; q < 10; q++) {
    const answer = scenario.quizAnswers[q];

    await page.waitForTimeout(scenario.interactionDelay);

    // After Q5, wait for the interstitial to auto-advance
    if (q === 5) {
      await page.waitForTimeout(3000);
    }

    try {
      switch (answer) {
        case 'A':
          // Left poster card — first flex-1 button in the pair container
          await page.locator('button.flex-1').first().click();
          break;
        case 'B':
          // Right poster card — second flex-1 button
          await page.locator('button.flex-1').nth(1).click();
          break;
        case 'Both':
          await page.locator('button').filter({ hasText: 'Both' }).click();
          break;
        case 'Neither':
          await page.locator('button').filter({ hasText: 'Neither' }).click();
          break;
      }
    } catch (e) {
      console.warn(`Quiz question ${q + 1}: could not click ${answer}, trying fallback`);
      const anyPoster = page.locator('button.flex-1').first();
      if (await anyPoster.isVisible()) {
        await anyPoster.click();
      }
    }

    // Wait for answer animation + transition
    await page.waitForTimeout(500);
  }

  // Wait for quiz completion screen to appear
  await page.waitForTimeout(2000);
}

/**
 * Step 2c: Click through the quiz completion screen.
 */
async function completeQuizFinish(page: Page, scenario: E2EScenario) {
  const readyHeading = page.locator('h1').filter({ hasText: 'Your taste profile is ready' });
  try {
    await readyHeading.waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    console.warn('Quiz completion screen not detected — may have auto-advanced');
  }

  const startBtn = page.locator('button').filter({ hasText: 'Start exploring' });
  if (await startBtn.isVisible()) {
    await startBtn.click();
    await page.waitForTimeout(scenario.interactionDelay);
  }
}

/**
 * Extract section headers and "For You" content from the homepage.
 */
async function extractHomepageData(page: Page): Promise<{
  sections: string[];
  forYouTitles: string[];
}> {
  await page.waitForTimeout(3000);

  const sections: string[] = [];
  try {
    const sectionTexts = await page.locator('h2').allTextContents();
    sections.push(...sectionTexts.filter(Boolean));
  } catch (e) {
    console.warn('Could not extract section titles');
  }

  const forYouTitles: string[] = [];
  try {
    const forYouH2 = page.locator('h2').filter({ hasText: 'For You' });
    if (await forYouH2.isVisible()) {
      // Navigate up to the section container, then extract card alt texts
      const section = forYouH2.locator('..').locator('..');
      const titles = await section.locator('img').evaluateAll(
        (imgs) => imgs.map(img => img.getAttribute('alt')).filter(Boolean)
      );
      forYouTitles.push(...titles as string[]);
    }
  } catch (e) {
    console.warn('Could not extract For You titles');
  }

  return { sections, forYouTitles };
}

/**
 * Extract the taste profile from localStorage.
 * Storage key: @taste_profile (from src/lib/storage/tasteProfile.ts)
 */
async function extractTasteProfile(page: Page): Promise<any | null> {
  try {
    const profile = await page.evaluate(() => {
      const raw = localStorage.getItem('@taste_profile');
      return raw ? JSON.parse(raw) : null;
    });
    return profile;
  } catch (e) {
    console.warn('Could not extract taste profile from localStorage');
    return null;
  }
}

/**
 * Clear all app state to prepare for the next run.
 */
async function clearAppState(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

// =============================================================================
// TEST EXECUTION
// =============================================================================

const scenarios = generateScenarios();
const results: E2EResult[] = [];

test.describe('Taste Profile E2E Tests', () => {
  test.setTimeout(120000);

  for (const scenario of scenarios) {
    test(`${scenario.id}: ${scenario.scenarioType} — ${scenario.userName}`, async ({ page }) => {
      const startTime = Date.now();
      const errors: string[] = [];

      try {
        // Navigate to app
        await page.goto(e2eConfig.baseUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        // Auth: Create test account
        await signUpTestUser(page, scenario);

        // Step 0: Services
        await selectServices(page, scenario);

        // Step 1: Clusters
        await selectClusters(page, scenario);

        // Step 2: Quiz (intro → 10 questions → completion)
        await startQuiz(page, scenario);
        await completeQuiz(page, scenario);
        await completeQuizFinish(page, scenario);

        // Step 3: Extract results from homepage
        const { sections, forYouTitles } = await extractHomepageData(page);
        const tasteProfile = await extractTasteProfile(page);

        const result: E2EResult = {
          id: scenario.id,
          scenarioType: scenario.scenarioType,
          userName: scenario.userName,
          input: {
            services: scenario.services,
            clusters: scenario.clusters,
            quizAnswers: scenario.quizAnswers
          },
          tasteProfile,
          homepageSections: sections,
          forYouTitles,
          errors,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };

        results.push(result);

        writeFileSync(
          join(OUTPUT_DIR, `${scenario.id}.json`),
          JSON.stringify(result, null, 2)
        );

      } catch (e: any) {
        errors.push(e.message || String(e));
        console.error(`FAILED: ${scenario.id} — ${e.message}`);

        results.push({
          id: scenario.id,
          scenarioType: scenario.scenarioType,
          userName: scenario.userName,
          input: {
            services: scenario.services,
            clusters: scenario.clusters,
            quizAnswers: scenario.quizAnswers
          },
          tasteProfile: null,
          homepageSections: [],
          forYouTitles: [],
          errors,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
      } finally {
        await clearAppState(page);
        await page.waitForTimeout(e2eConfig.delayBetweenRuns || 1000);
      }
    });
  }

  test.afterAll(async () => {
    writeFileSync(
      join(OUTPUT_DIR, 'all-results.json'),
      JSON.stringify(results, null, 2)
    );

    const summary = {
      totalRuns: results.length,
      passed: results.filter(r => r.errors.length === 0).length,
      failed: results.filter(r => r.errors.length > 0).length,
      byScenario: {} as Record<string, { total: number; passed: number; failed: number }>,
      averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
      timestamp: new Date().toISOString()
    };

    for (const r of results) {
      if (!summary.byScenario[r.scenarioType]) {
        summary.byScenario[r.scenarioType] = { total: 0, passed: 0, failed: 0 };
      }
      summary.byScenario[r.scenarioType].total++;
      if (r.errors.length === 0) {
        summary.byScenario[r.scenarioType].passed++;
      } else {
        summary.byScenario[r.scenarioType].failed++;
      }
    }

    writeFileSync(
      join(OUTPUT_DIR, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('\n=== E2E Test Summary ===');
    console.log(`Total: ${summary.totalRuns} | Passed: ${summary.passed} | Failed: ${summary.failed}`);
    console.log(`Average duration: ${Math.round(summary.averageDuration)}ms`);
    console.log(`Results written to: ${OUTPUT_DIR}`);
  });
});
