import { runScrapeAndGetData } from '../../src/scrape'; 
import type { NextApiRequest, NextApiResponse } from 'next';

// Global state (Render-də memory-də saxlanır)
let scrapeState = {
    isRunning: false,
    startTime: null as Date | null,
    lastUpdate: null as Date | null,
    progress: {
        phase: 'idle' as 'idle' | 'loading' | 'scrolling' | 'extracting' | 'salary' | 'saving' | 'completed' | 'error',
        jobsFound: 0,
        jobsProcessed: 0,
        salaryFound: 0,
        totalJobs: 0,
    },
    error: null as string | null,
};

// Progress callback funksiyası
export function updateProgress(phase: string, data?: any) {
    scrapeState.lastUpdate = new Date();
    scrapeState.progress.phase = phase as any;
    
    if (data) {
        if (data.jobsFound !== undefined) scrapeState.progress.jobsFound = data.jobsFound;
        if (data.jobsProcessed !== undefined) scrapeState.progress.jobsProcessed = data.jobsProcessed;
        if (data.salaryFound !== undefined) scrapeState.progress.salaryFound = data.salaryFound;
        if (data.totalJobs !== undefined) scrapeState.progress.totalJobs = data.totalJobs;
    }
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    
    // ═══════════════════════════════════════════════════════
    // STATUS SORĞUSU: GET /api/scrape?action=status
    // ═══════════════════════════════════════════════════════
    if (req.method === 'GET' && req.query.action === 'status') {
        const elapsedSeconds = scrapeState.startTime 
            ? Math.floor((Date.now() - scrapeState.startTime.getTime()) / 1000)
            : 0;
        
        return res.status(200).json({
            isRunning: scrapeState.isRunning,
            phase: scrapeState.progress.phase,
            jobsFound: scrapeState.progress.jobsFound,
            jobsProcessed: scrapeState.progress.jobsProcessed,
            salaryFound: scrapeState.progress.salaryFound,
            totalJobs: scrapeState.progress.totalJobs,
            elapsedTime: elapsedSeconds,
            startTime: scrapeState.startTime,
            lastUpdate: scrapeState.lastUpdate,
            error: scrapeState.error,
        });
    }

    // ═══════════════════════════════════════════════════════
    // SCRAPING BAŞLAT: POST /api/scrape VƏ YA GET /api/scrape
    // ═══════════════════════════════════════════════════════
    if (req.method === 'POST' || (req.method === 'GET' && !req.query.action)) {
        
        // Əgər artıq işləyirsə
        if (scrapeState.isRunning) {
            return res.status(429).json({ 
                message: '⏳ Scraping artıq işləyir. Status üçün /api/scrape?action=status',
                phase: scrapeState.progress.phase,
                jobsFound: scrapeState.progress.jobsFound,
                elapsedTime: scrapeState.startTime 
                    ? Math.floor((Date.now() - scrapeState.startTime.getTime()) / 1000) 
                    : 0,
            });
        }

        // State-i yenilə
        scrapeState = {
            isRunning: true,
            startTime: new Date(),
            lastUpdate: new Date(),
            progress: {
                phase: 'loading',
                jobsFound: 0,
                jobsProcessed: 0,
                salaryFound: 0,
                totalJobs: 0,
            },
            error: null,
        };

        // ✅ ƏSAS HƏLL: Background-da işlə (await ETMƏ!)
        runScrapeAndGetData()
            .then((results) => {
                scrapeState.isRunning = false;
                scrapeState.progress.phase = 'completed';
                scrapeState.progress.totalJobs = results.length;
                scrapeState.progress.salaryFound = results.filter(j => j.salary !== 'N/A').length;
                scrapeState.lastUpdate = new Date();
                
                console.log(`\n✅ SCRAPING TAMAMLANDI`);
                console.log(`   📊 Total: ${results.length} jobs`);
                console.log(`   💰 Salary: ${scrapeState.progress.salaryFound} jobs`);
                console.log(`   ⏱️  Vaxt: ${Math.floor((Date.now() - scrapeState.startTime!.getTime()) / 1000)}s\n`);
            })
            .catch((error) => {
                scrapeState.isRunning = false;
                scrapeState.progress.phase = 'error';
                scrapeState.error = error.message;
                scrapeState.lastUpdate = new Date();
                console.error('\n❌ SCRAPING XƏTASI:', error.message, '\n');
            });

        // ✅ DƏRHAL CAVAB QAYTAR (120s timeout-dan qaça bil)
        return res.status(202).json({ 
            success: true,
            message: '✅ Scraping background-da başladıldı!',
            statusUrl: '/api/scrape?action=status',
            estimatedTime: '2-5 dəqiqə',
            instructions: {
                checkStatus: 'GET /api/scrape?action=status',
                pollInterval: '5 saniyə',
            }
        });
    }

    // ═══════════════════════════════════════════════════════
    // METHOd NOT ALLOWED
    // ═══════════════════════════════════════════════════════
    return res.status(405).json({ message: 'Method Not Allowed. Use GET or POST' });
}