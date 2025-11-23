// pages/api/cron.ts

import type { NextApiRequest, NextApiResponse } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://yeni-projem-1.onrender.com';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const now = new Date();
    const bakuTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baku' }));
    
    const hour = bakuTime.getHours();
    const minute = bakuTime.getMinutes();
    const dayOfWeek = bakuTime.getDay();
    
    try {
        // Hər gün saat 18:00 - Scraping
        if (hour === 18 && minute < 15) {
            fetch(`${BASE_URL}/api/scrape`, { 
                method: 'GET',
                signal: AbortSignal.timeout(2700000) // 45 dəqiqə (30 dəqiqədən uzun scraping üçün)
            }).catch(err => console.error('Scrape error:', err));
            
            return res.status(200).json({ message: 'Scraping started (18:00)', hour, minute });
        }
        
        // Hər gün saat 19:00 - Bildirişlər
        if (hour === 19 && minute < 15) {
            fetch(`${BASE_URL}/api/cron_daily`, {
                method: 'GET',
                signal: AbortSignal.timeout(60000)
            }).catch(err => console.error('Daily error:', err));
            
            // Bazar ertəsi həftəlik də göndər
            if (dayOfWeek === 1) {
                fetch(`${BASE_URL}/api/cron_weekly`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(60000)
                }).catch(err => console.error('Weekly error:', err));
                
                return res.status(200).json({ message: 'Daily + Weekly started (19:00)', hour, minute });
            }
            
            return res.status(200).json({ message: 'Daily started (19:00)', hour, minute });
        }

        return res.status(200).json({ message: 'No action', hour, minute });

    } catch (error: any) {
        return res.status(500).json({ message: 'Error', error: error.message });
    }
}
