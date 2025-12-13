// my-scrape-project/src/scrape.ts
// ✅ YENİLƏNMİŞ VERSİYA: Angular app və LIMITLİ Paralel Detal Scraping (5-5)

import type { Browser, Page, Locator } from 'playwright';
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
const MAX_SCROLL_COUNT = 150;

const SELECTORS = {
    JOB_CONTAINER: '.job-wrapper',
    TITLE_URL: 'h4.hidden-xs a',
    COMPANY_CONTAINER: '.job-company',
    LIST_SALARY: 'div[ng-show*="model.salary_range"] span.about-job-line-text.ng-binding',
    DETAIL_SALARY_A: '.job-details-inner div:has(i.fa-money)',
    DETAIL_SALARY_B: 'div.job-detail-sidebar:has(i.fa-money)',
};

async function scrapeDetailPageForSalary(
    browser: Browser,
    url: string
): Promise<string> {
    const detailPage = await browser.newPage();
    let salary = 'N/A';

    try {
        await detailPage.goto(url, {
            timeout: 30000,
            waitUntil: 'domcontentloaded',
        });

        const locatorA = detailPage
            .locator(SELECTORS.DETAIL_SALARY_A)
            .filter({ hasText: '$' })
            .first();

        const locatorB = detailPage
            .locator(SELECTORS.DETAIL_SALARY_B)
            .filter({ hasText: '$' })
            .first();

        let salaryText: string | null = null;

        try {
            salaryText = await locatorA.innerText({ timeout: 5000 });
        } catch {
            try {
                salaryText = await locatorB.innerText({ timeout: 5000 });
            } catch {}
        }

        if (salaryText && salaryText.includes('$')) {
            const lines = salaryText
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean);
            salary = lines.find(l => l.includes('$')) ?? salaryText.trim();
        }
    } catch {
        // ignore
    } finally {
        await detailPage.close();
    }

    return salary;
}

async function extractInitialJobData(
    wrapper: Locator
): Promise<ScrapedJobData> {
    let title = '';
    let url = 'N/A';
    let companyName = 'N/A';
    let salary = 'N/A';

    try {
        const titleLocator = wrapper.locator(SELECTORS.TITLE_URL).first();
        title = (await titleLocator.innerText({ timeout: 500 })).trim();
        const relativeUrl = await titleLocator.getAttribute('href');
        url = relativeUrl ? `${BASE_URL}${relativeUrl}` : 'N/A';
    } catch {
        return { title: '', companyName, url, salary, siteUrl: BASE_URL };
    }

    try {
        const companyText = (
            await wrapper
                .locator(SELECTORS.COMPANY_CONTAINER)
                .first()
                .innerText({ timeout: 1000 })
        )
            .replace(/\s+/g, ' ')
            .trim();

        const lc = companyText.toLowerCase();
        if (
            companyText.length > 2 &&
            !lc.includes('remote') &&
            !lc.includes('full-time') &&
            !lc.includes('jobs')
        ) {
            companyName = companyText;
        }
    } catch {}

    try {
        const salaryText = await wrapper
            .locator(SELECTORS.LIST_SALARY)
            .filter({ hasText: '$' })
            .first()
            .innerText({ timeout: 500 });

        if (salaryText.includes('$')) {
            salary = salaryText.trim();
        }
    } catch {}

    return { title, companyName, url, salary, siteUrl: BASE_URL };
}

export async function runScrapeAndGetData() {
    console.log('\n--- WorkingNomads Scraper başladı ---');

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    });

    const page = await context.newPage();

    try {
        await page.goto(TARGET_URL, {
            timeout: 120000,
            waitUntil: 'domcontentloaded',
        });

        await page.waitForSelector(SELECTORS.JOB_CONTAINER, {
            timeout: 120000,
        });

        let currentCount = await page
            .locator(SELECTORS.JOB_CONTAINER)
            .count();

        let sameCount = 0;

        while (sameCount < 8 && currentCount < MAX_SCROLL_COUNT) {
            await page.evaluate(() =>
                window.scrollTo({ top: document.body.scrollHeight })
            );
            await page.waitForTimeout(3000);

            const newCount = await page
                .locator(SELECTORS.JOB_CONTAINER)
                .count();

            if (newCount > currentCount) {
                currentCount = newCount;
                sameCount = 0;
            } else {
                sameCount++;
            }
        }

        const wrappers = await page
            .locator(SELECTORS.JOB_CONTAINER)
            .all();

        const initialResults: ScrapedJobData[] = [];

        for (const wrapper of wrappers) {
            initialResults.push(await extractInitialJobData(wrapper));
        }

        const validJobs = initialResults.filter(j => j.title);
        console.log(`✅ ${validJobs.length} valid job tapıldı`);

        // ==============================
        // ✅ LIMITLİ PARALEL SALARY (5-5)
        // ==============================
        console.log('\n💰 Salary yoxlanır (5-5 paralel)...');

        const finalResults: ScrapedJobData[] = [];
        const BATCH_SIZE = 5;

        for (let i = 0; i < validJobs.length; i += BATCH_SIZE) {
            const batch = validJobs.slice(i, i + BATCH_SIZE);

            const batchPromises = batch.map(job => {
                if (job.salary === 'N/A' && job.url.startsWith(BASE_URL)) {
                    return scrapeDetailPageForSalary(browser, job.url).then(
                        detailSalary => ({
                            ...job,
                            salary: detailSalary,
                        })
                    );
                }
                return Promise.resolve(job);
            });

            const batchResults = await Promise.all(batchPromises);
            finalResults.push(...batchResults);

            console.log(
                `   💵 ${Math.min(
                    i + BATCH_SIZE,
                    validJobs.length
                )}/${validJobs.length} yoxlandı`
            );
        }

        const salaryCount = finalResults.filter(
            j => j.salary !== 'N/A'
        ).length;

        console.log(`✅ Salary tapılan: ${salaryCount}`);

        await insertOrUpdateSupabase(finalResults);

        return finalResults;
    } finally {
        await browser.close();
        console.log('--- Scraper bitdi ---\n');
    }
}
