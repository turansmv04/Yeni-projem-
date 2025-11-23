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
    
    console.log(`⏰ Cron: ${bakuTime.toLocaleString('az-AZ')} | ${hour}:${minute}`);
    
    try {
        if (hour === 20 && minute < 15) {
            console.log('🔄 Scraping başladılır...');
            
            fetch(`${BASE_URL}/api/scrape`, { 
                method: 'GET'
            }).then(() => {
                console.log('✅ Scraping request sent');
            }).catch(err => {
                console.error('❌ Scrape fetch error:', err);
            });
            
            return res.status(200).json({ 
                message: 'Scraping request sent (01:00 AM)', 
                hour, 
                minute 
            });
        }
        
        if (hour === 21 && minute < 15) {
            console.log('📨 Bildirişlər göndərilir...');
            
            fetch(`${BASE_URL}/api/cron_daily`, {
                method: 'GET'
            }).catch(err => console.error('Daily error:', err));
            
            if (dayOfWeek === 1) {
                fetch(`${BASE_URL}/api/cron_weekly`, {
                    method: 'GET'
                }).catch(err => console.error('Weekly error:', err));
                
                return res.status(200).json({ 
                    message: 'Daily + Weekly started (10:00 AM)', 
                    hour, 
                    minute 
                });
            }
            
            return res.status(200).json({ 
                message: 'Daily started (10:00 AM)', 
                hour, 
                minute 
            });
        }

        return res.status(200).json({ 
            message: 'No action', 
            hour, 
            minute
        });

    } catch (error: any) {
        console.error('❌ Cron error:', error);
        return res.status(500).json({ 
            message: 'Error', 
            error: error.message 
        });
    }
}