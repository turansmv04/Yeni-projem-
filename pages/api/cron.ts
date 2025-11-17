import type { NextApiRequest, NextApiResponse } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const now = new Date();
    // Baku vaxtı (UTC+4) ilə dəqiq vaxtı əldə edirik
    const bakuTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baku' }));
    
    const hour = bakuTime.getHours();
    const minute = bakuTime.getMinutes();
    const dayOfWeek = bakuTime.getDay(); // 0=Bazar, 1=Bazar ertəsi
    
    try {
        // Hər gün saat 17:35-də - Scraping işini başladır
        // Saat 17-dir VƏ dəqiqə 35-dən böyük və 50-dən kiçikdir (15 dəqiqə icra intervalı veririk)
        if (hour === 17 && (minute >= 35 && minute < 50)) { // 17:35 - 17:49 arası işləyir
            // Scraping işini asinxron olaraq başladır
            fetch(`${BASE_URL}/api/cron_scrape`, { 
                method: 'GET',
                signal: AbortSignal.timeout(300000) // 5 dəqiqə timeout
            }).catch(err => console.error('Scrape error:', err));
            
            return res.status(200).json({ message: 'Scraping started (17:35)' });
        }
        
        // Hər gün saat 18:05-də - Gündəlik/Həftəlik bildirişlər
        if (hour === 18 && (minute >= 5 && minute < 20)) { // 18:05 - 18:19 arası işləyir
            // Gündəlik bildiriş işini başladır
            fetch(`${BASE_URL}/api/cron_daily`, {
                method: 'GET',
                signal: AbortSignal.timeout(60000) // 1 dəqiqə timeout
            }).catch(err => console.error('Daily error:', err));
            
            // Bazar ertəsi (dayOfWeek === 1) isə həftəlik də göndər
            if (dayOfWeek === 1) {
                fetch(`${BASE_URL}/api/cron_weekly`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(60000)
                }).catch(err => console.error('Weekly error:', err));
                
                return res.status(200).json({ message: 'Daily + Weekly started (18:05)' });
            }
            
            return res.status(200).json({ message: 'Daily started (18:05)' });
        }

        return res.status(200).json({ message: 'No action', hour, minute });

    } catch (error: any) {
        return res.status(500).json({ message: 'Error', error: error.message });
    }
}