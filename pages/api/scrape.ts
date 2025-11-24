// pages/api/scrape.ts (Uptime Robot və Asinxron İcra üçün)

import { runScrapeAndGetData } from '../../src/scrape'; 
import type { NextApiRequest, NextApiResponse } from 'next';

// 🛑 Serverless mühitdə isRunning tam etibarlı deyil, lakin işi sığortalamaq üçün saxlayırıq.
let isRunning = false; 

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // 1. Vaxtı Yoxla (Baku Time Zone)
    const now = new Date();
    const bakuTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baku' }));
    const hour = bakuTime.getHours();
    
    // İşləməli olan saatlar: 20:00 (Axşam 8), 04:00 (Səhər 4), 12:00 (Günorta 12)
    const isScheduleTime = (hour === 20 || hour === 4 || hour === 12); 

    if (!isScheduleTime) {
        // Əgər vaxt deyilsə (Uptime Robot hər 5 dəq-dən bir zəng edir), OK cavabını ver və kodu dayandır.
        return res.status(200).json({ message: `Scrape skipped. Current hour is ${hour}. Scheduled for 20, 4, or 12.` });
    }
    
    // 2. İşləmə Vaxtıdırsa, Artıq İşləyib-İşləmədiyini Yoxla
    if (isRunning) {
        return res.status(429).json({ 
            message: '⏳ Scraping artıq işləyir. Növbəti zəngi gözləyin.'
        });
    }

    try {
        isRunning = true;
        
        // 🛑 KRİTİK DÜZƏLİŞ: runScrapeAndGetData() funksiyasını await etmədən çağır. 
        // Bu, API-nin dərhal cavab verməsini və işin arxa fonda (35 dəqiqə) davam etməsini təmin edir.
        runScrapeAndGetData() 
            .then(() => console.log('✅ Scraping işi uğurla tamamlandı.'))
            .catch((error) => console.error('❌ Scraping işində xəta:', error))
            .finally(() => {
                // İş bitdikdə (35 dəqiqə sonra) isRunning statusunu sıfırla.
                isRunning = false;
            }); 
            
        // 3. DƏRHƏL cavab qaytar (Uptime Robot-un 30 saniyə Timeout-u bitməzdən əvvəl)
        return res.status(200).json({ 
            message: 'Scraping arxa fonda uğurla başladıldı. (Saat: ' + hour + ')',
        });

    } catch (error: any) {
        isRunning = false; 
        console.error("API-də başlanğıc xətası:", error);
        return res.status(500).json({ 
            message: 'Başlanğıc xətası.', 
            error: error.message 
        });
    }
}