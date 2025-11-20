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
        // Hər gün gecə saat 01:00 AM - Scraping
        if (hour === 1 && minute < 15) {
            fetch(`${BASE_URL}/api/scrape`, { 
                method: 'GET',
                signal: AbortSignal.timeout(600000) // 10 dəqiqə
            }).catch(err => console.error('Scrape error:', err));
            
            return res.status(200).json({ message: 'Scraping started (01:00 AM)', hour, minute });
        }
        
        // Hər gün səhər saat 10:00 AM - Bildirişlər
        if (hour === 10 && minute < 15) {
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
                
                return res.status(200).json({ message: 'Daily + Weekly started (10:00 AM)', hour, minute });
            }
            
            return res.status(200).json({ message: 'Daily started (10:00 AM)', hour, minute });
        }

        return res.status(200).json({ message: 'No action', hour, minute });

    } catch (error: any) {
        return res.status(500).json({ message: 'Error', error: error.message });
    }
}