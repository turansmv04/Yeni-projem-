import type { Browser, Page, Locator, BrowserContext } from 'playwright';
import { chromium } from 'playwright';
import { insertOrUpdateSupabase } from './supabase';

export interface ScrapedJobData {
  title: string;
  companyName: string;
  url: string;
  salary: string;
  siteUrl: string;
}

const BASE_URL = 'https://www.workingnomads.com';
const TARGET_URL = `${BASE_URL}/jobs?postedDate=1`;

const SELECTORS = {
  JOB_CONTAINER: '.job-wrapper',
  TITLE_URL: 'h4.hidden-xs a',
  COMPANY_CONTAINER: '.job-company',
  LIST_SALARY:
    'div[ng-show*="model.salary_range"] span.about-job-line-text.ng-binding',
  LIST_PARENT: 'div.jobs-list',
  DETAIL_SALARY_A: '.job-details-inner div:has(i.fa-money)',
  DETAIL_SALARY_B: 'div.job-detail-sidebar:has(i.fa-money)',
};

// ---------------- SALARY DETAIL PAGE ----------------

async function scrapeDetailSalary(
  salaryContext: BrowserContext,
  url: string
): Promise<string> {
  let salary = 'N/A';
  let detailPage: Page | undefined;

  try {
    detailPage = await salaryContext.newPage();

    await detailPage.goto(url, {
      timeout: 5000,
      waitUntil: 'domcontentloaded',
    });

    // variant A
    try {
      const textA = await detailPage
        .locator(SELECTORS.DETAIL_SALARY_A)
        .filter({ hasText: '$' })
        .first()
        .innerText({ timeout: 1000 });

      if (textA.includes('$')) {
        salary = textA.trim();
        return salary;
      }
    } catch (_) {}

    // variant B
    try {
      const textB = await detailPage
        .locator(SELECTORS.DETAIL_SALARY_B)
        .filter({ hasText: '$' })
        .first()
        .innerText({ timeout: 1000 });

      if (textB.includes('$')) {
        salary = textB.trim();
        return salary;
      }
    } catch (_) {}
  } catch (_) {
    // səssiz
  } finally {
    if (detailPage) {
      await detailPage.close().catch(() => {});
    }
  }

  return salary;
}

// ---------------- LIST PAGE PARSING ----------------

async function extractInitialJobData(wrapper: Locator): Promise<ScrapedJobData> {
  const titleLocator = wrapper.locator(SELECTORS.TITLE_URL).first();
  let title = '';
  let relativeUrl: string | null = null;
  let url = 'N/A';
  let companyName = 'N/A';
  let salary = 'N/A';

  try {
    title = (await titleLocator.innerText({ timeout: 1000 })).trim();
    relativeUrl = await titleLocator.getAttribute('href');
    url = relativeUrl ? `${BASE_URL}${relativeUrl}` : 'N/A';
  } catch (_) {
    return {
      title: '',
      companyName: 'N/A',
      url: 'N/A',
      salary: 'N/A',
      siteUrl: BASE_URL,
    };
  }

  // company
  try {
    const companyLocator = wrapper.locator(SELECTORS.COMPANY_CONTAINER).first();
    const rawText = (await companyLocator.innerText({ timeout: 800 })).trim();
    const cleanedText = rawText.replace(/\s+/g, ' ').trim();

    const lower = cleanedText.toLowerCase();
    if (
      cleanedText.length > 2 &&
      !lower.includes('full-time') &&
      !lower.includes('remote') &&
      !lower.includes('jobs')
    ) {
      companyName = cleanedText;
    }
  } catch (_) {
    companyName = 'N/A';
  }

  // url-dən company backup
  if (companyName === 'N/A' || companyName.length < 3) {
    const parts = url.split('-');
    const idx = parts.findIndex((p) => /^\d{7}$/.test(p));
    if (idx > 0) {
      const guess = parts[idx - 1];
      companyName = guess.charAt(0).toUpperCase() + guess.slice(1);
    }
  }

  // list salary backup
  try {
    const salaryLocator = wrapper
      .locator(SELECTORS.LIST_SALARY)
      .filter({ hasText: '$' })
      .first();
    const salaryText = await salaryLocator.innerText({ timeout: 400 });
    if (salaryText.includes('$') && salaryText.length > 5) {
      salary = salaryText.trim();
    }
  } catch (_) {}

  return { title, companyName, url, salary, siteUrl: BASE_URL };
}

// ---------------- MAIN SCRAPER ----------------

export async function runScrapeAndGetData() {
  console.log('🚀 WorkingNomads + SALARY SCRAPER START');
  console.log(`🌐 ${TARGET_URL}`);

  const browser: Browser = await chromium.launch({
    headless: true,
    timeout: 45000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-plugins',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });

  const mainContext = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  });

  const salaryContext = await browser.newContext({
    viewport: { width: 400, height: 700 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
  });

  const mainPage = await mainContext.newPage();

  await mainPage.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'stylesheet', 'font', 'media', 'websocket'].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  try {
    console.log('⏳ Ana səhifə (10s)...');
    await mainPage.goto(TARGET_URL, {
      timeout: 10000,
      waitUntil: 'domcontentloaded',
    });

    console.log('✅ Ana səhifə OK');
    await mainPage.waitForTimeout(1500);
    await mainPage.waitForSelector(SELECTORS.LIST_PARENT, { timeout: 5000 });
    console.log('✅ List tapıldı');

    // scroll
    let scrollCount = 0;
    let prevCount = 0;
    while (scrollCount < 6) {
      await mainPage.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight)
      );
      await mainPage.waitForTimeout(800);

      const count = await mainPage.locator(SELECTORS.JOB_CONTAINER).count();
      if (count === prevCount) break;
      console.log(`📊 ${count} elan`);
      prevCount = count;
      scrollCount++;
    }

    const wrappers = await mainPage.locator(SELECTORS.JOB_CONTAINER).all();
    const jobs: ScrapedJobData[] = await Promise.all(
      wrappers.slice(0, 25).map(extractInitialJobData)
    );

    const validJobs = jobs.filter(
      (j) => j.title.length > 5 && j.url !== 'N/A'
    );
    console.log(`✅ ${validJobs.length} valid iş`);

    // detail salary
    const needsSalary = validJobs
      .filter((j) => j.salary === 'N/A')
      .slice(0, 15);

    console.log(`💰 ${needsSalary.length} iş üçün detail salary yoxlanılır...`);

    for (let i = 0; i < needsSalary.length; i++) {
      const job = needsSalary[i];
      console.log(`💰 ${i + 1}/${needsSalary.length}: ${job.title.slice(0, 40)}...`);
      job.salary = await scrapeDetailSalary(salaryContext, job.url);
      await mainPage.waitForTimeout(200);
    }

    const withSalary = validJobs.filter((j) => j.salary !== 'N/A').length;
    console.log(`💰 FINAL: ${withSalary}/${validJobs.length} işdə salary tapıldı`);

    await insertOrUpdateSupabase(validJobs);
    console.log('✅ Supabase yazıldı, scraper bitdi');
    return validJobs;
  } catch (e: any) {
    console.error('❌ Xəta:', e.message || e);
    throw e;
  } finally {
    await mainContext.close().catch(() => {});
    await salaryContext.close().catch(() => {});
    await browser.close().catch(() => {});
    console.log('🔚 Browser bağlandı');
  }
}
