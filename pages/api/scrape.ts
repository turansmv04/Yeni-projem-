// pages/api/scrape.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { runScrapeAndGetData } from '../../src/scrape';

let isRunning = false;

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Yalnız GET icazəlidir
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // Cron job üçün dərhal cavab qaytarılır
    res.status(200).json({
        message:
            'Scraping prosesi arxa fonda başladıldı. Logları Render-də yoxlayın.',
    });

    // Eyni anda 2 dəfə işləməsin
    if (isRunning) {
        console.log('⏳ Scraping artıq işləyir. Yeni iş ləğv edildi.');
        return;
    }

    try {
        isRunning = true;

        // Əsas scraping prosesi ASYNC başladılır (await YOXDUR)
        runScrapeAndGetData()
            .then(() => {
                console.log(
                    '--- SCRAPING UĞURLA TAMAMLANDI (Background job bitdi) ---'
                );
            })
            .catch(error => {
                console.error(
                    '--- Arxa fonda scraping zamanı KRİTİK XƏTA ---',
                    error
                );
            })
            .finally(() => {
                isRunning = false;
            });
    } catch (error) {
        console.error(
            'Scraping prosesini başlatma zamanı xəta baş verdi:',
            error
        );
        isRunning = false;
    }
}
