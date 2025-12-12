// pages/api/scrape.ts
import { runScrapeAndGetData } from '../../src/scrape'; 
import type { NextApiRequest, NextApiResponse } from 'next';

let isRunning = false;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // Cron job-u dərhal uğurlu etmək üçün cavabı birinci qaytarırıq.
    res.status(200).json({ 
        message: 'Scraping prosesi arxa fonda başladılır. Logları Render-də yoxlayın.',
    });
    
    if (isRunning) {
        return console.log('⏳ Scraping artıq işləyir. Yeni iş ləğv edildi.');
    }
    
    // Əsas İşi Başlat (Asinxron)
    try {
        isRunning = true;
        
        // 'await' olmadan başladılır, beləcə yuxarıdakı cavab funksiyası bloklanmır.
        runScrapeAndGetData() 
            .then(() => {
                console.log("--- SCRAPING UĞURLA TAMAMLANDI (35 Dəqiqə Bitdi) ---");
            })
            .catch((error) => {
                console.error("--- Arxa fon işində kritik xəta ---", error);
            })
            .finally(() => {
                isRunning = false;
            });
            
    } catch (error: any) {
        console.error("Scraping işini başlatma zamanı xəta baş verdi:", error);
    } 
}