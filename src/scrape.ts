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
    // ✅ DƏYİŞDİRİLDİ: hidden-xs-i sildik, hamı h4 > a götür
    TITLE_URL: 'h4 a',
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
        console.warn(`⚠️ Detal səhifəsi yüklənmədi: ${url}`);
    } finally {
        await detailPage.close();
    }
    return salary;
}

async function extractInitialJobData(wrapper: Locator, index: number): Promise<ScrapedJobData> {
    
    let title = '', relativeUrl = null, url = 'N/A', companyName = 'N/A', salary = 'N/A';
    
    try {
        const titleElement = wrapper.locator(SELECTORS.TITLE_URL).first();
        
        const count = await titleElement.count();
        if (count === 0) {
            return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL }; 
        }
        
        title = (await titleElement.textContent({ timeout: 3000 }) || '').trim();
        relativeUrl = await titleElement.getAttribute('href');
        url = relativeUrl ? `${BASE_URL}${relativeUrl}` : 'N/A';
        
        // ✅ YENİ: Sponsored linkləri filter et
        if (!url.startsWith(BASE_URL)) {
            console.log(`⏭️ [${index}] Sponsored post keçildi: ${url.substring(0, 50)}...`);
            return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL };
        }
        
    } catch (e) {
        return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL }; 
    }

    if (!title || title.length === 0) {
        return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL };
    }

    try {
        const companyContainerLocator = wrapper.locator(SELECTORS.COMPANY_CONTAINER).first(); 
        let rawText = (await companyContainerLocator.textContent({ timeout: 3000 }) || '').trim(); 
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
        const salaryText = await salaryLocator.textContent({ timeout: 500 });
        if (salaryText && salaryText.includes('$') && salaryText.length > 5) {
            salary = salaryText.trim();
        }
    } catch (e) { /* Salary yoxdur */ }

    return { title, companyName, url, salary, siteUrl: BASE_URL };
}

export async function runScrapeAndGetData() {
    
    console.log(`\n--- WorkingNomads Scraper işə düşdü ---`);
    console.log(`Naviqasiya edilir: ${TARGET_URL}`);
    
    const browser: Browser = await chromium.launch({ 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
    });    
    
    const page: Page = await browser.newPage();
    
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });
    
    try {
        console.log('⏳ Səhifə yüklənir...');
        await page.goto(TARGET_URL, { 
            timeout: 90000, 
            waitUntil: 'networkidle'
        });
        
        console.log('⏳ JavaScript yüklənməsi gözlənilir...');
        await page.waitForTimeout(5000);
        
        await page.waitForSelector(SELECTORS.LIST_PARENT, { timeout: 40000 }); 
        console.log('✅ List parent yükləndi');
        
        await page.waitForSelector(SELECTORS.JOB_CONTAINER, { timeout: 15000 });
        const initialCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
        console.log(`✅ ${initialCount} Job container aşkar edildi`);

        // SCROLL
        let currentJobCount = initialCount;
        let previousCount = 0;
        let sameCountIterations = 0; 
        
        while (currentJobCount < MAX_SCROLL_COUNT && sameCountIterations < 10) { 
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(3000);
            
            previousCount = currentJobCount;
            currentJobCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
            console.log(`-> Mövcud elan sayı: ${currentJobCount}`);
            
            if (currentJobCount === previousCount) {
                sameCountIterations++;
            } else {
                sameCountIterations = 0;
            }

            if (sameCountIterations >= 10 && currentJobCount > 0) { 
                console.log("✅ Bütün elanlar tapıldı.");
                break;
            }
        }
        
        console.log(`\n📊 ${currentJobCount} elementdən məlumat çıxarılır...`);
        const jobWrappers = await page.locator(SELECTORS.JOB_CONTAINER).all();
        
        const initialResults: ScrapedJobData[] = [];
        for (let i = 0; i < jobWrappers.length; i++) {
            const result = await extractInitialJobData(jobWrappers[i], i);
            initialResults.push(result);
        }
        
        const finalResults: ScrapedJobData[] = []; 
        
        for (const job of initialResults) {
            if (job.title.length > 0) {
                if (job.salary === 'N/A' && job.url.startsWith(BASE_URL)) {
                    const detailSalary = await scrapeDetailPageForSalary(browser, job.url); 
                    job.salary = detailSalary;
                }
                finalResults.push(job);
            }
        }
        
        const filteredResults = finalResults.filter(job => job.url !== 'N/A');

        console.log("\n--- SCRAPING NƏTİCƏLƏRİ ---");
        console.log(`✅ Yekun: ${filteredResults.length} elan çıxarıldı.`);

        await insertOrUpdateSupabase(filteredResults);

        return filteredResults; 

    } catch (e) {
        console.error(`❌ Xəta: ${e instanceof Error ? e.message : String(e)}`);
        throw e; 
    } finally {
        await browser.close();
        console.log('--- Scraper bitdi ---');
    }
}