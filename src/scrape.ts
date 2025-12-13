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

const SELECTORS = {
    JOB_CONTAINER: '.job-wrapper',
    TITLE_URL: 'h4.hidden-xs a',
    COMPANY_CONTAINER: '.job-company', 
    LIST_SALARY: 'div[ng-show*="model.salary_range"] span.about-job-line-text.ng-binding',
    LIST_PARENT: 'div.jobs-list',
    DETAIL_SALARY_A: '.job-details-inner div:has(i.fa-money)', 
    DETAIL_SALARY_B: 'div.job-detail-sidebar:has(i.fa-money)',
};

// 🔥 FIXED: SINGLE CONTEXT, NO NEW CONTEXT!
async function scrapeDetailPageForSalary(page: Page, url: string): Promise<string> {
    let salary = 'N/A';

    try {
        // 🔥 REUSE MAIN PAGE (no new page!)
        await page.goto(url, { 
            timeout: 7000, 
            waitUntil: 'domcontentloaded' 
        });
        
        // Salary A və ya B
        const locatorA = page.locator(SELECTORS.DETAIL_SALARY_A).filter({ hasText: '$' }).first();
        const locatorB = page.locator(SELECTORS.DETAIL_SALARY_B).filter({ hasText: '$' }).first();
        
        let salaryText: string | null = null;
        
        try { 
            salaryText = await locatorA.innerText({ timeout: 1500 }); 
        } catch (e) {
            try { 
                salaryText = await locatorB.innerText({ timeout: 1500 }); 
            } catch (e) { }
        }
        
        if (salaryText && salaryText.includes('$')) {
            const lines = salaryText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const salaryLine = lines.find(line => line.includes('$'));
            salary = salaryLine ? salaryLine : salaryText.trim();
        }
        
    } catch (e) {
        // Səssiz
    }
    
    return salary;
}

async function extractInitialJobData(wrapper: Locator): Promise<ScrapedJobData> {
    const titleLocator = wrapper.locator(SELECTORS.TITLE_URL).first();
    let title = '', relativeUrl = null, url = 'N/A', companyName = 'N/A', salary = 'N/A';
    
    try {
        title = (await titleLocator.innerText({ timeout: 1500 })).trim();
        relativeUrl = await titleLocator.getAttribute('href');
        url = relativeUrl ? `${BASE_URL}${relativeUrl}` : 'N/A';
    } catch (e) {
        return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL }; 
    }

    // Company
    try {
        const companyContainerLocator = wrapper.locator(SELECTORS.COMPANY_CONTAINER).first(); 
        let rawText = (await companyContainerLocator.innerText({ timeout: 1000 })).trim(); 
        let cleanedText = rawText.replace(/\s+/g, ' ').trim();
        
        const lowerCaseName = cleanedText.toLowerCase();
        if (cleanedText.length > 2 && 
            !lowerCaseName.includes('full-time') && 
            !lowerCaseName.includes('remote') &&
            !lowerCaseName.includes('jobs')) {
            companyName = cleanedText;
        }
    } catch (e) { companyName = 'N/A'; }
    
    // URL-dən company
    if (companyName === 'N/A' || companyName.length < 3) {
        const urlParts = url.split('-');
        const companyIndex = urlParts.findIndex(part => /^\d{7}$/.test(part)); 
        if (companyIndex > 0) {
            let guess = urlParts[companyIndex - 1];
            companyName = guess.charAt(0).toUpperCase() + guess.slice(1);
        }
    }
    
    // List salary backup
    try {
        const salaryLocator = wrapper.locator(SELECTORS.LIST_SALARY).filter({ hasText: '$' }).first();
        const salaryText = await salaryLocator.innerText({ timeout: 500 });
        if (salaryText.includes('$') && salaryText.length > 5) {
            salary = salaryText.trim();
        }
    } catch (e) { }

    return { title, companyName, url, salary, siteUrl: BASE_URL };
}

// 🔥 FIXED: SINGLE PAGE REUSE (No parallel crash!)
async function scrapeDetailSalaries(
    page: Page, 
    jobs: ScrapedJobData[], 
    maxJobs: number = 20
): Promise<void> {
    const jobsToCheck = jobs
        .filter(job => job.salary === 'N/A' && job.url.startsWith(BASE_URL))
        .slice(0, maxJobs);
    
    console.log(`💰 ${jobsToCheck.length}/${jobs.length} detail salary yoxlanılır (SINGLE PAGE)...`);
    
    // 🔥 SEQUENTIAL (no parallel - Render-safe!)
    for (let i = 0; i < jobsToCheck.length; i++) {
        const job = jobsToCheck[i];
        console.log(`💰 ${i+1}/${jobsToCheck.length}: ${job.title.slice(0,30)}...`);
        job.salary = await scrapeDetailPageForSalary(page, job.url);
        await page.waitForTimeout(300); // Rate limit
    }
}

export async function runScrapeAndGetData() {
    console.log(`🚀 WorkingNomads Scraper START (SINGLE PAGE FIXED)`);
    console.log(`🌐 ${TARGET_URL}`);
    
    const browser: Browser = await chromium.launch({ 
        headless: true,
        timeout: 60000,
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
        ]
    });     
    
    // 🔥 SINGLE CONTEXT ONLY
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        bypassCSP: true,
        ignoreHTTPSErrors: true,
    });
    
    const page: Page = await context.newPage();
    
    // 🔥 Resource blocking
    await page.route('**/*', route => {
        const resourceType = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            route.abort();
        } else {
            route.continue();
        }
    });

    try {
        // Main page load
        console.log('⏳ Ana səhifə...');
        await page.goto(TARGET_URL, { 
            timeout: 20000, 
            waitUntil: 'networkidle' 
        });
        
        console.log('✅ Ana səhifə yükləndi');
        await page.waitForTimeout(2000);
        await page.waitForSelector(SELECTORS.LIST_PARENT, { timeout: 10000 });
        console.log('✅ List tapıldı');

        // Scroll
        let scrollCount = 0, previousCount = 0;
        while (scrollCount < 12) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1200);
            
            const currentCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
            if (currentCount === previousCount) break;
            
            console.log(`📊 ${currentCount} elan`);
            previousCount = currentCount;
            scrollCount++;
        }
        
        // Extract jobs
        const jobWrappers = await page.locator(SELECTORS.JOB_CONTAINER).all();
        const initialResults: ScrapedJobData[] = await Promise.all(
            jobWrappers.slice(0, 40).map(extractInitialJobData)
        );
        
        const validJobs = initialResults.filter(job => job.title.length > 0 && job.url !== 'N/A');
        console.log(`✅ ${validJobs.length} valid iş`);

        // 🔥 SINGLE PAGE DETAIL SALARY (NO CRASH!)
        await scrapeDetailSalaries(page, validJobs, 20);

        console.log('💾 Supabase-ə yazılır...');
        await insertOrUpdateSupabase(validJobs);

        const salaryCount = validJobs.filter(j => j.salary !== 'N/A').length;
        console.log(`✅ TAMAMLANDI! ${salaryCount}/${validJobs.length} salary tapıldı 💰`);
        return validJobs;

    } catch (e: any) {
        console.error(`❌ XƏTA: ${e.message}`);
        throw new Error(`Scrape failed: ${e.message}`);
    } finally {
        await browser.close();
        console.log('🔚 Browser bağlandı');
    }
}
