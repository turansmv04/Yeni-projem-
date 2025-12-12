// my-scrape-project/src/scrape.ts
// ✅ WORKING VERSION - Angular app üçün

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
        // Salary tapılmadı
    } finally {
        await detailPage.close();
    }
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
        ]
    });    
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
    });
    
    const page: Page = await context.newPage();
    
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });
    
    try {
        console.log('⏳ Səhifə yüklənir...');
        await page.goto(TARGET_URL, { 
            timeout: 90000, 
            waitUntil: 'domcontentloaded' 
        });
        console.log('✅ Səhifə DOM yükləndi!');
        
        // ✅ ƏSAS HƏLL: Angular app-in başlamasını gözlə
        console.log('⏳ Angular app-in başlaması gözlənilir...');
        
        // 1. Job container-lərin yüklənməsini gözlə (DAHA UZUN TIMEOUT)
        await page.waitForSelector(SELECTORS.JOB_CONTAINER, { 
            timeout: 120000, // 2 dəqiqə
            state: 'visible' 
        });
        
        console.log('✅ Angular app başladı və job-lar yükləndi!');
        
        // 2. İlk job-ların tam render olmasına vaxt ver
        await page.waitForTimeout(3000);
        
        // 3. İlk say-ı götür
        let initialCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
        console.log(`📊 İlk olaraq ${initialCount} job tapıldı`);
        
        // ✅ SCROLL STRATEGIYASI: Angular infinite scroll işləməsi üçün
        let currentJobCount = initialCount;
        let previousCount = 0;
        let sameCountIterations = 0;
        let scrollAttempts = 0;
        const MAX_SCROLL_ATTEMPTS = 100;
        
        console.log('🔄 Infinite scroll aktivləşdirilir...\n');
        
        while (scrollAttempts < MAX_SCROLL_ATTEMPTS && sameCountIterations < 8) { 
            // Smooth scroll (Angular-ın scroll event-ini trigger edir)
            await page.evaluate(() => {
                window.scrollTo({ 
                    top: document.body.scrollHeight, 
                    behavior: 'smooth' 
                });
            });
            
            // Angular-a yeni job-ları yükləməyə vaxt ver
            await page.waitForTimeout(3000);
            
            previousCount = currentJobCount;
            currentJobCount = await page.locator(SELECTORS.JOB_CONTAINER).count();
            
            scrollAttempts++;
            
            if (currentJobCount > previousCount) {
                console.log(`✅ [${scrollAttempts}] Yeni job-lar yükləndi: ${previousCount} → ${currentJobCount}`);
                sameCountIterations = 0;
            } else {
                sameCountIterations++;
                console.log(`⏸️  [${scrollAttempts}] Yeni job yoxdur (${sameCountIterations}/8)`);
            }
            
            // MAX_SCROLL_COUNT-a çatdıqsa dayan
            if (currentJobCount >= MAX_SCROLL_COUNT) {
                console.log(`🎯 Maksimum limitə (${MAX_SCROLL_COUNT}) çatıldı!`);
                break;
            }
            
            // 8 dəfə yeni job gəlməsə, bitir
            if (sameCountIterations >= 8) {
                console.log(`✅ Bütün job-lar yükləndi (${currentJobCount} toplam)`);
                break;
            }
        }
        
        console.log(`\n📦 ${currentJobCount} job-dan məlumat çıxarılır...\n`);
        const jobWrappers = await page.locator(SELECTORS.JOB_CONTAINER).all();
        
        const initialResults: ScrapedJobData[] = [];
        
        for (let i = 0; i < jobWrappers.length; i++) {
            const result = await extractInitialJobData(jobWrappers[i]);
            initialResults.push(result);
            
            // Progress indicator
            if ((i + 1) % 25 === 0) {
                console.log(`   📝 ${i + 1}/${jobWrappers.length} elan işləndi...`);
            }
        }
        
        const validJobs = initialResults.filter(j => j.title.length > 0);
        console.log(`\n✅ ${validJobs.length} valid job tapıldı`);
        
        // Salary scraping (detail page-dən)
        console.log('\n💰 Salary məlumatları yoxlanılır...');
        const finalResults: ScrapedJobData[] = []; 
        let salaryCount = 0;
        
        for (let i = 0; i < validJobs.length; i++) {
            const job = validJobs[i];
            
            if (job.salary === 'N/A' && job.url.startsWith(BASE_URL)) {
                const detailSalary = await scrapeDetailPageForSalary(browser, job.url);
                if (detailSalary !== 'N/A') {
                    salaryCount++;
                }
                job.salary = detailSalary;
            } else if (job.salary !== 'N/A') {
                salaryCount++;
            }
            
            finalResults.push(job);
            
            // Progress indicator
            if ((i + 1) % 25 === 0) {
                console.log(`   💵 ${i + 1}/${validJobs.length} job yoxlanıldı (${salaryCount} salary tapıldı)`);
            }
        }
        
        const filteredResults = finalResults.filter(job => job.url !== 'N/A');

        console.log("\n╔══════════════════════════════════════╗");
        console.log("║     SCRAPING NƏTİCƏLƏRİ              ║");
        console.log("╚══════════════════════════════════════╝");
        console.log(`\n✅ Yekun: ${filteredResults.length} elan çıxarıldı`);
        console.log(`💰 Salary məlumatı: ${salaryCount} elan`);
        console.log(`🔄 Scroll cəhdi: ${scrollAttempts}\n`);

        await insertOrUpdateSupabase(filteredResults);

        return filteredResults; 

    } catch (e) {
        console.error(`\n❌ Əsas Xəta: ${e instanceof Error ? e.message : String(e)}`);
        
        // Debug info
        try {
            const url = page.url();
            console.log(`📍 Son URL: ${url}`);
            await page.screenshot({ path: 'error-final.png', fullPage: true });
            console.log('📸 Screenshot: error-final.png');
        } catch {}
        
        throw e; 
    } finally {
        await browser.close();
        console.log('--- Scraper bitdi ---\n');
    }
} 