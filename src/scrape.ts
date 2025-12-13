// my-scrape-project/src/scrape.ts (Son gücləndirilmiş versiya)

import type { Browser, Page, Locator } from 'playwright'; 
import { chromium } from 'playwright';
import { insertOrUpdateSupabase } from './supabase'; 
import chrome from '@sparticuz/chromium'; 

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
    LIST_PARENT: 'div.jobs-list',
};

// Bu funksiya çağırılmayacaq
async function scrapeDetailPageForSalary(browser: Browser, url: string): Promise<string> {
    // ... (kod eynidir) ...
    return 'N/A';
}

async function extractInitialJobData(wrapper: Locator): Promise<ScrapedJobData> {
    
    const titleLocator = wrapper.locator(SELECTORS.TITLE_URL).first();
    let title = '', relativeUrl = null, url = 'N/A', companyName = 'N/A', salary = 'N/A';
    
    try {
        title = (await titleLocator.innerText()).trim(); 
        relativeUrl = await titleLocator.getAttribute('href');
        url = relativeUrl ? `${BASE_URL}${relativeUrl}` : 'N/A';
    } catch (e) {
        return { title: '', companyName: 'N/A', url: 'N/A', salary: 'N/A', siteUrl: BASE_URL }; 
    }

    try {
        const companyContainerLocator = wrapper.locator(SELECTORS.COMPANY_CONTAINER).first(); 
        let rawText = (await companyContainerLocator.innerText()).trim(); 
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
        const salaryText = await salaryLocator.innerText(); 
        if (salaryText.includes('$') && salaryText.length > 5) {
            salary = salaryText.trim();
        }
    } catch (e) { /* Siyahıda Salary tapılmadı */ }

    return { title, companyName, url, salary, siteUrl: BASE_URL };
}

// --- ƏSAS FUNKSİYA ---
export async function runScrapeAndGetData() {
    
    console.log(`\n--- WorkingNomads Scraper işə düşdü ---`);
    console.log(`Naviqasiya edilir: ${TARGET_URL}`);
    
const browser: Browser = await chromium.launch({ 
    headless: true,
    executablePath: await chrome.executablePath(), 
    // Yaddaşa qənaət edən əlavə arqumentlər!
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process', 
        '--no-zygote', 
        '--disable-web-security',
        '--disable-features=site-per-process',
        '--no-service-autorun', 
        '--no-default-browser-check',
        '--disable-extensions', 
        '--disable-default-apps', 
        '--disable-popup-blocking', 
        '--disable-ipc-flooding-protection',
        '--disable-background-timer-throttling',
        ...chrome.args, 
    ]
});    
    const page: Page = await browser.newPage();
    // Timeout 180 saniyə (3 dəqiqə)
    page.setDefaultTimeout(180000); 
    
    try {
        // Timeout 180 saniyə (3 dəqiqə)
        await page.goto(TARGET_URL, { timeout: 180000, waitUntil: 'domcontentloaded' });
        
        // Timeout 180 saniyə (3 dəqiqə)
        const listParentLocator = page.locator(SELECTORS.LIST_PARENT);
        await listParentLocator.waitFor({ state: 'visible', timeout: 180000 }); 

        console.log("✅ Ana səhifə uğurla yükləndi və əsas element tapıldı.");

        // --- SCROLL DÖVRÜ ---
        let currentJobCount = 0;
        let previousCount = 0;
        let sameCountIterations = 0; 
        
        while (currentJobCount < MAX_SCROLL_COUNT && sameCountIterations < 10) { 
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2000); 
            
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
        
        // --- MƏLUMATIN ÇIXARILMASI ---
        console.log(`\n${currentJobCount} elementdən əsas məlumat çıxarılır...`);
        const jobWrappers = await page.locator(SELECTORS.JOB_CONTAINER).all();
        
        const initialResults: ScrapedJobData[] = await Promise.all(
            jobWrappers.map(extractInitialJobData)
        );
        
        // --- YEKUN NƏTİCƏNİN FİLTRLƏNMƏSİ ---
        const finalResults: ScrapedJobData[] = []; 
        
        for (const job of initialResults) {
            if (job.title.length > 0) {
                finalResults.push(job);
            }
        }
        
        const filteredResults = finalResults.filter(job => job.url !== 'N/A');

        console.log("\n--- SCRAPING NƏTİCƏLƏRİ ---");
        console.log(`\n✅ Yekun Nəticə: ${filteredResults.length} elan çıxarıldı.`);

        // --- SUPABASE-Ə YAZMA HİSSƏSİ ---
        await insertOrUpdateSupabase(filteredResults);

        return filteredResults; 

    } catch (e) {
        console.error(`❌ Əsas Xəta: ${e instanceof Error ? e.message : String(e)}`);
        // Yaddaş sızmasının qarşısını almaq üçün brauzeri məcburən bağla
        try { await browser.close(); } catch (err) { console.error('Browser close failed on error:', err); }
        throw e; 
    } finally {
        // Hər halda yenidən bağla
        try { await browser.close(); } catch (err) { /* ignore */ }
        console.log('--- Scraper bitdi ---');
    }
}