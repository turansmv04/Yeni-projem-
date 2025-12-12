// my-scrape-project/src/scrape.ts
// ⚡ EN YAXŞI HƏLL: Optimized + Progress tracking

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

const BASE_URL: string = 'https://www.workingnomads.com'; 
const TARGET_URL: string = `${BASE_URL}/jobs?postedDate=1`; 
const MAX_SCROLL_COUNT = 200; 
const MAX_PARALLEL_SALARY = 15;

const SELECTORS = {
    JOB_CONTAINER: '.job-wrapper',
    TITLE_URL: 'h4.hidden-xs a',
    COMPANY_CONTAINER: '.job-company', 
    LIST_SALARY: 'div[ng-show*="model.salary_range"] span.about-job-line-text.ng-binding',
    DETAIL_SALARY_A: '.job-details-inner div:has(i.fa-money)', 
    DETAIL_SALARY_B: 'div.job-detail-sidebar:has(i.fa-money)',
};

// Progress callback (API-dan gəlir)
let updateProgress: ((phase: string, data?: any) => void) = () => {};

try {
    const apiModule = await import('../pages/api/scrape');
    updateProgress = apiModule.updateProgress;
} catch (e) {
    updateProgress = (phase, data) => console.log(`[${phase}]`, data || '');
}

async function scrapeDetailPageForSalary(browser: Browser, url: string): Promise<string> {
    const detailPage = await browser.newPage();
    let salary = 'N/A';
    try {
        await detailPage.goto(url, { timeout: 25000, waitUntil: 'domcontentloaded' });
        const locatorA = detailPage.locator(SELECTORS.DETAIL_SALARY_A).filter({ hasText: '$' }).first();
        const locatorB = detailPage.locator(SELECTORS.DETAIL_SALARY_B).filter({ hasText: '$' }).first();
        let salaryText: string | null = null;
        
        try { salaryText = await locatorA.innerText({ timeout: 4000 }); } catch (e) {
            try { salaryText = await locatorB.innerText({ timeout: 4000 }); } catch (e) { }
        }
        
        if (salaryText && salaryText.includes('$')) {
            const lines = salaryText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const salaryLine = lines.find(line => line.includes('$'));
            salary = salaryLine ? salaryLine : salaryText.trim();
        }
    } catch (e) { }
    finally { await detailPage.close(); }
    return salary;
}

async function extractInitialJobData(wrapper: Locator): Promise<ScrapedJobData> {
    const titleLocator = wrapper.locator(SELECTORS.TITLE_URL).first();
    let title = '', relativeUrl = null, url = 'N/A', companyName = 'N/A', salary = 'N/A';
    
    try {
        title = (await titleLocator.innerText({ timeout: 500 })).trim();
        relativeUrl = await titleLocator.getAttribute('href');
        url = relativeUrl ? `${BASE_URL}${relativeUrl}` : 'N/A';
    } catch (e) {
        return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL }; 
    }

    try {
        const companyContainerLocator = wrapper.locator(SELECTORS.COMPANY_CONTAINER).first(); 
        let rawText = (await companyContainerLocator.innerText({ timeout: 1000 })).trim(); 
        let cleanedText = rawText.replace(/\s+/g, ' ').trim(); 
        const lowerCaseName = cleanedText.toLowerCase();
        if (cleanedText.length > 2 && !lowerCaseName.includes('full-time') && 
            !lowerCaseName.includes('remote') && !lowerCaseName.includes('jobs')) {
            companyName = cleanedText;
        }
    } catch (e) { }
    
    if (companyName === 'N/A' || companyName.length < 3) {
        const urlParts = url.split('-');
        const companyIndex = urlParts.findIndex(part => /^\d{7}$/.test(part)); 
        if (companyIndex > 0) {
            let guess = urlParts[companyIndex - 1];
            companyName = guess.charAt(0).toUpperCase() + guess.slice(1);
        }
    }
    
    try {
        const salaryLocator = wrapper.locator(SELECTORS.LIST_SALARY).filter({ hasText: '$' }).first();
        const salaryText = await salaryLocator.innerText({ timeout: 500 });
        if (salaryText.includes('$') && salaryText.length > 5) salary = salaryText.trim();
    } catch (e) { }

    return { title, companyName, url, salary, siteUrl: BASE_URL };
}

async function processBatch<T>(items: T[], batchSize: number, fn: (item: T) => Promise<any>): Promise<any[]> {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
    }
    return results;
}

export async function runScrapeAndGetData() {
    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║  WorkingNomads Scraper (OPTIMIZED)     ║`);
    console.log(`╚════════════════════════════════════════╝\n`);
    console.log(`🌐 URL: ${TARGET_URL}\n`);
    const startTime = Date.now();
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }); 
    
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    try {
        updateProgress('loading', {});
        console.log('⏳ Səhifə yüklənir...');
        await page.goto(TARGET_URL, { timeout: 60000 });
        
        await page.waitForSelector(SELECTORS.JOB_CONTAINER, { timeout: 60000, state: 'visible' });
        await page.waitForTimeout(2000);
        console.log('✅ Səhifə yükləndi!\n');
        
        let currentJobCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
        console.log(`📊 İlk: ${currentJobCount} job\n`);
        updateProgress('scrolling', { jobsFound: currentJobCount });
        
        // Scroll optimizasiyası
        let scrollAttempts = 0, sameCount = 0;
        const MAX_SCROLL = 15;
        
        console.log('🔄 Scroll başladı...\n');
        while (scrollAttempts < MAX_SCROLL && sameCount < 5 && currentJobCount < MAX_SCROLL_COUNT) { 
            await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
            await page.waitForTimeout(2000);
            
            const prev = currentJobCount;
            currentJobCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
            scrollAttempts++;
            
            if (currentJobCount > prev) {
                console.log(`✅ [${scrollAttempts}] ${prev} → ${currentJobCount}`);
                updateProgress('scrolling', { jobsFound: currentJobCount });
                sameCount = 0;
            } else {
                sameCount++;
                console.log(`⏸️  [${scrollAttempts}] Yeni yoxdur (${sameCount}/5)`);
            }
            
            if (currentJobCount >= MAX_SCROLL_COUNT) {
                console.log(`🎯 Limit (${MAX_SCROLL_COUNT}) çatıldı!\n`);
                break;
            }
        }
        
        console.log(`\n📦 ${currentJobCount} job-dan məlumat çıxarılır...\n`);
        updateProgress('extracting', { jobsFound: currentJobCount });
        
        const jobWrappers = await page.locator(SELECTORS.JOB_CONTAINER).all();
        const initialResults = await processBatch(jobWrappers, 30, extractInitialJobData);
        
        const validJobs = initialResults.filter(j => j.title.length > 0);
        console.log(`✅ ${validJobs.length} valid job tapıldı\n`);
        updateProgress('salary', { jobsProcessed: validJobs.length });
        
        // Salary scraping (batch)
        console.log('💰 Salary məlumatları (paralel)...\n');
        const jobsNeedingSalary = validJobs.filter(j => j.salary === 'N/A' && j.url.startsWith(BASE_URL));
        
        if (jobsNeedingSalary.length > 0) {
            const batchSize = MAX_PARALLEL_SALARY;
            for (let i = 0; i < jobsNeedingSalary.length; i += batchSize) {
                const batch = jobsNeedingSalary.slice(i, Math.min(i + batchSize, jobsNeedingSalary.length));
                const salaryResults = await Promise.all(
                    batch.map(job => scrapeDetailPageForSalary(browser, job.url).then(s => ({ url: job.url, salary: s })))
                );
                salaryResults.forEach(({ url, salary }) => {
                    const job = validJobs.find(j => j.url === url);
                    if (job) job.salary = salary;
                });
                const done = Math.min(i + batchSize, jobsNeedingSalary.length);
                console.log(`   💵 ${done}/${jobsNeedingSalary.length} yoxlanıldı`);
                const salaryCount = validJobs.filter(j => j.salary !== 'N/A').length;
                updateProgress('salary', { salaryFound: salaryCount });
            }
        }
        
        const filteredResults = validJobs.filter(j => j.url !== 'N/A');
        const salaryCount = filteredResults.filter(j => j.salary !== 'N/A').length;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        
        console.log(`\n╔════════════════════════════════════════╗`);
        console.log(`║         NƏTİCƏLƏR                      ║`);
        console.log(`╚════════════════════════════════════════╝`);
        console.log(`✅ Toplam: ${filteredResults.length} elan`);
        console.log(`💰 Salary: ${salaryCount} elan`);
        console.log(`🔄 Scroll: ${scrollAttempts} dəfə`);
        console.log(`⏱️  Vaxt: ${elapsed}s\n`);

        updateProgress('saving', { totalJobs: filteredResults.length, salaryFound: salaryCount });
        await insertOrUpdateSupabase(filteredResults);

        return filteredResults; 

    } catch (e) {
        console.error(`\n❌ XƏTA: ${e instanceof Error ? e.message : String(e)}\n`);
        throw e; 
    } finally {
        await browser.close();
        console.log('--- Scraper bitdi ---\n');
    }
}