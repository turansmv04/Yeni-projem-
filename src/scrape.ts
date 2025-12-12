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
        console.warn(`\n⚠️ XƏBƏRDARLIQ: Detal səhifəsi yüklənmədi və ya Salary tapılmadı: ${url}`);
    } finally {
        await detailPage.close();
    }
    return salary;
}

async function extractInitialJobData(wrapper: Locator, index: number): Promise<ScrapedJobData> {
    
    let title = '', relativeUrl = null, url = 'N/A', companyName = 'N/A', salary = 'N/A';
    
    try {
        // ✅ ƏVVƏLCƏ Ən SADƏ YOLLA TRY EDƏK - innerText yox, textContent
        const titleElement = wrapper.locator(SELECTORS.TITLE_URL).first();
        
        // Əvvəlcə element var mı yoxla
        const count = await titleElement.count();
        if (count === 0) {
            console.warn(`⚠️ [${index}] Title elementi tapılmadı, HTML yoxlanılır...`);
            const html = await wrapper.innerHTML();
            console.log(`HTML snippet: ${html.substring(0, 300)}`);
            return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL }; 
        }
        
        title = (await titleElement.textContent({ timeout: 10000 }) || '').trim();
        relativeUrl = await titleElement.getAttribute('href');
        url = relativeUrl ? `${BASE_URL}${relativeUrl}` : 'N/A';
        
    } catch (e) {
        console.warn(`⚠️ [${index}] Title çıxarıla bilmədi:`, e instanceof Error ? e.message : String(e));
        return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL }; 
    }

    if (!title || title.length === 0) {
        console.warn(`⚠️ [${index}] Boş title tapıldı`);
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
    } catch (e) { /* Siyahıda Salary tapılmadı */ }

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
        // ✅ AngularJS tələb edirsə, bunu əlavə et
        (window as any).angular = (window as any).angular || {};
    });
    
    try {
        // ✅ networkidle - JavaScript tamamilə yüklənməsini gözlə
        console.log('⏳ Səhifə yüklənir...');
        await page.goto(TARGET_URL, { 
            timeout: 90000, 
            waitUntil: 'networkidle' // ← ÖNƏMLİ DƏYİŞİKLİK
        });
        
        console.log('⏳ JavaScript execution gözlənilir...');
        await page.waitForTimeout(5000); // 5 saniyə əlavə gözlə
        
        await page.waitForSelector(SELECTORS.LIST_PARENT, { timeout: 40000 }); 
        console.log('✅ List parent yükləndi');
        
        await page.waitForSelector(SELECTORS.JOB_CONTAINER, { timeout: 15000 });
        const initialCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
        console.log(`✅ ${initialCount} Job container aşkar edildi`);
        
        // ✅ İLK ELEMENTIN HTML-NI YOXLA
        if (initialCount > 0) {
            const firstHTML = await page.locator(SELECTORS.JOB_CONTAINER).first().innerHTML();
            console.log('\n🔍 İLK JOB WRAPPER HTML (ilk 800 simvol):');
            console.log(firstHTML.substring(0, 800));
            console.log('...\n');
        }

        // SCROLL DÖVRÜ
        let currentJobCount = initialCount;
        let previousCount = 0;
        let sameCountIterations = 0; 
        
        while (currentJobCount < MAX_SCROLL_COUNT && sameCountIterations < 10) { 
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(3000); // 3 saniyə gözlə
            
            previousCount = currentJobCount;
            currentJobCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
            console.log(`-> Mövcud elan sayı: ${currentJobCount}`);
            
            if (currentJobCount === previousCount) {
                sameCountIterations++;
            } else {
                sameCountIterations = 0;
            }

            if (sameCountIterations >= 10 && currentJobCount > 0) { 
                console.log("✅ Say dəyişmir. Bütün mövcud elanlar tapıldı.");
                break;
            }
        }
        
        console.log(`\n📊 ${currentJobCount} elementdən məlumat çıxarılır...`);
        const jobWrappers = await page.locator(SELECTORS.JOB_CONTAINER).all();
        
        // ✅ Index əlavə et ki, hansı elementdə xəta olduğunu görək
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
        console.log(`✅ Yekun Nəticə: ${filteredResults.length} elan çıxarıldı.`);

        await insertOrUpdateSupabase(filteredResults);

        return filteredResults; 

    } catch (e) {
        console.error(`❌ Əsas Xəta: ${e instanceof Error ? e.message : String(e)}`);
        throw e; 
    } finally {
        await browser.close();
        console.log('--- Scraper bitdi ---');
    }
}