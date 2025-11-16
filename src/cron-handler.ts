// src/cron-handler.ts

import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function runCronJobs() {
    const now = new Date();
    const bakuTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baku' }));
    
    const hour = bakuTime.getHours();
    const dayOfWeek = bakuTime.getDay(); // 0=Sunday, 1=Monday...
    
    console.log(`🕐 Bakı vaxtı: ${bakuTime.toLocaleString('az-AZ')} | Saat: ${hour} | Gün: ${dayOfWeek}`);
    
    try {
        // Hər gün saat 10:00 - Scraping
        if (hour === 10) {
            console.log('🔄 Scraping başlayır...');
            await axios.get(`${BASE_URL}/api/cron_scrape`);
            console.log('✅ Scraping tamamlandı!');
        }
        
        // Hər gün saat 11:00 - Gündəlik bildirişlər
        if (hour === 11) {
            console.log('📨 Gündəlik bildirişlər göndərilir...');
            await axios.get(`${BASE_URL}/api/cron_daily`);
            console.log('✅ Gündəlik bildirişlər göndərildi!');
            
            // Bazar ertəsi isə həftəlik də göndər
            if (dayOfWeek === 1) {
                console.log('📨 Həftəlik bildirişlər göndərilir...');
                await axios.get(`${BASE_URL}/api/cron_weekly`);
                console.log('✅ Həftəlik bildirişlər göndərildi!');
            }
        }
        
    } catch (error: any) {
        console.error('❌ Cron xətası:', error.message);
    }
}

runCronJobs();