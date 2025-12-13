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
const MAX_SCROLL_COUNT = 500; 

const SELECTORS = {
    JOB_CONTAINER: '.job-wrapper',
    TITLE_URL: 'h4.hidden-xs a',
    COMPANY_CONTAINER: '.job-company', 
    LIST_SALARY: 'div[ng-show*="model.salary_range"] span.about-job-line-text.ng-binding',
    DETAIL_SALARY_A: '.job-details-inner div:has(i.fa-money)', 
    DETAIL_SALARY_B: 'div.job-detail-sidebar:has(i.fa-money)',
    LIST_PARENT: 'div.jobs-list',
};

async function scrapeDetailPageForSalary(browser: Browser, url: string): Promise<string> {
    const detailPage = await browser.newPage();
    let salary = 'N/A';

    try {
        await detailPage.goto(url, { timeout: 40000, waitUntil: 'domcontentloaded' });
        const locatorA = detailPage.locator(SELECTORS.DETAIL_SALARY_A).filter({ hasText: '$' }).first();
        const locatorB = detailPage.locator(SELECTORS.DETAIL_SALARY_B).filter({ hasText: '$' }).first();
        let salaryText: string | null = null;
        
        try { salaryText = await locatorA.innerText({ timeout: 5000 }); } catch (e) {
            try { salaryText = await locatorB.innerText({ timeout: 5000 }); } catch (e) { }
        }
        
        if (salaryText && salaryText.includes('$')) {
            const lines = salaryText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const salaryLine = lines.find(line => line.includes('$'));
            salary = salaryLine ? salaryLine : salaryText.trim();
        }

    } catch (e) {
        // Salary yoxdur
    } finally {
        await detailPage.close();
    }
    return salary;
}

async function extractInitialJobData(wrapper: Locator): Promise<ScrapedJobData> {
    
    const titleLocator = wrapper.locator(SELECTORS.TITLE_URL).first();
    let title = '', relativeUrl = null, url = 'N/A', companyName = 'N/A', salary = 'N/A';
    
    try {
        title = (await titleLocator.innerText({ timeout: 3000 })).trim();
        relativeUrl = await titleLocator.getAttribute('href');
        url = relativeUrl ? `${BASE_URL}${relativeUrl}` : 'N/A';
    } catch (e) {
        return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL }; 
    }

    if (!title || title.length === 0) {
        return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL };
    }

    try {
        const companyContainerLocator = wrapper.locator(SELECTORS.COMPANY_CONTAINER).first(); 
        let rawText = (await companyContainerLocator.innerText({ timeout: 2000 })).trim(); 
        let cleanedText = rawText.replace(/\s+/g, ' ').trim(); 
        
        const lowerCaseName = cleanedText.toLowerCase();
        if (cleanedText.length > 2 && 
            !lowerCaseName.includes('full-time') && 
            !lowerCaseName.includes('remote') &&
            !lowerCaseName.includes('jobs')) 
        {
            companyName = cleanedText;
        }

    } catch (e) { 
        companyName = 'N/A';
    }
    
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
        if (salaryText.includes('$') && salaryText.length > 5) {
            salary = salaryText.trim();
        }
    } catch (e) { }

    return { title, companyName, url, salary, siteUrl: BASE_URL };
}

export async function runScrapeAndGetData() {
    
    console.log(`\n🚀 WorkingNomads Scraper START`);
    console.log(`🌐 ${TARGET_URL}`);
    
    const browser: Browser = await chromium.launch({ 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
        ]
    });    
    
    const page: Page = await browser.newPage();
    
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
    });
    
    try {
        // ✅ DƏYİŞİKLİK: networkidle → domcontentloaded (daha sürətli)
        console.log('⏳ Naviqasiya...');
        await page.goto(TARGET_URL, { 
            timeout: 60000,
            waitUntil: 'domcontentloaded'
        });
        
        console.log('✅ Səhifə yükləndi');
        
        // ✅ AngularJS yüklənməsi üçün əlavə gözləmə
        console.log('⏳ AngularJS gözlənilir...');
        await page.waitForTimeout(8000); // 8 saniyə gözlə
        
        // ✅ Element gözlə
        console.log('⏳ Elementlər yüklənir...');
        await page.waitForSelector(SELECTORS.LIST_PARENT, { timeout: 60000 }); 
        console.log('✅ List parent tapıldı');
        
        await page.waitForSelector(SELECTORS.JOB_CONTAINER, { timeout: 30000 });
        const initialCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
        console.log(`✅ ${initialCount} job container tapıldı`);

        let currentJobCount = initialCount;
        let previousCount = 0;
        let sameCountIterations = 0; 
        
        console.log('🔄 Scroll başlayır...');
        while (currentJobCount < MAX_SCROLL_COUNT && sameCountIterations < 10) { 
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2500); 
            
            previousCount = currentJobCount;
            currentJobCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
            
            if (currentJobCount !== previousCount) {
                console.log(`📊 ${currentJobCount} elan`);
                sameCountIterations = 0;
            } else {
                sameCountIterations++;
            }

            if (sameCountIterations >= 10) { 
                console.log("✅ Hamısı yükləndi");
                break;
            }
        }
        
        console.log(`\n📥 ${currentJobCount} elan extract edilir...`);
        const jobWrappers = await page.locator(SELECTORS.JOB_CONTAINER).all();
        
        const initialResults: ScrapedJobData[] = [];
        
        for (let i = 0; i < jobWrappers.length; i++) {
            const result = await extractInitialJobData(jobWrappers[i]);
            initialResults.push(result);
        }
        
        const validJobs = initialResults.filter(j => j.title.length > 0);
        console.log(`✅ ${validJobs.length} valid iş tapıldı`);
        
        const finalResults: ScrapedJobData[] = []; 
        
        console.log('💰 Salary məlumatları yoxlanılır...');
        for (const job of validJobs) {
            if (job.salary === 'N/A' && job.url.startsWith(BASE_URL)) {
                const detailSalary = await scrapeDetailPageForSalary(browser, job.url); 
                job.salary = detailSalary;
            }
            finalResults.push(job);
        }
        
        const filteredResults = finalResults.filter(job => job.url !== 'N/A');

        console.log(`\n✨ YEKİN: ${filteredResults.length} elan hazır`);
        console.log('💾 Supabase-ə yazılır...');

        await insertOrUpdateSupabase(filteredResults);

        console.log('✅ TAMAMLANDI!');
        return filteredResults; 

    } catch (e) {
        console.error(`❌ XƏTA: ${e instanceof Error ? e.message : String(e)}`);
        throw e; 
    } finally {
        await browser.close();
        console.log('🔚 Browser bağlandı\n');
    }
}