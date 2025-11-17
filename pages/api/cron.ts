// pages/api/cron.ts

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
    const bakuTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baku' }));
    
    const hour = bakuTime.getHours();
    const minute = bakuTime.getMinutes();
    const dayOfWeek = bakuTime.getDay(); // 0=Bazar, 1=Bazar ertəsi
    
    try {
        // Hər gün saat 13:00 - Scraping
        if (hour === 14 && minute < 15) {
            fetch(`${BASE_URL}/api/cron_scrape`, { 
                method: 'GET',
                signal: AbortSignal.timeout(300000)
            }).catch(err => console.error('Scrape error:', err));
            
            return res.status(200).json({ message: 'Scraping started (13:00)' });
        }
        
        // Hər gün saat 13:45 - Gündəlik bildirişlər
        if (hour === 14 && minute >= 45) {
            fetch(`${BASE_URL}/api/cron_daily`, {
                method: 'GET',
                signal: AbortSignal.timeout(60000)
            }).catch(err => console.error('Daily error:', err));
            
            // Bazar ertəsi isə həftəlik də göndər
            if (dayOfWeek === 1) {
                fetch(`${BASE_URL}/api/cron_weekly`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(60000)
                }).catch(err => console.error('Weekly error:', err));
                
                return res.status(200).json({ message: 'Daily + Weekly started (13:45)' });
            }
            
            return res.status(200).json({ message: 'Daily started (13:45)' });
        }

        return res.status(200).json({ message: 'No action', hour, minute });

    } catch (error: any) {
        return res.status(500).json({ message: 'Error', error: error.message });
    }
}