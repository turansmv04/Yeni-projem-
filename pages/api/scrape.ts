// my-scrape-project/pages/api/scrape.ts

// DÜZƏLİŞ: pages/api-dən src-nin daxilinə çıxış (../../)
import { runScrapeAndGetData } from '../../src/scrape'; 
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        // Bütün proses (scrape və upsert) bu funksiya daxilində tamamlanır
        await runScrapeAndGetData(); 

        return res.status(200).json({ 
            message: 'Scraping prosesi uğurla başladıldı və tamamlandı.',
        });

    } catch (error: any) {
        // Xəta halında konsola tam xətanı yazdırır
        console.error("API-də kritik xəta baş verdi:", error);
        return res.status(500).json({ message: 'Daxili server xətası. Konsolda daha ətraflı baxın.', error: error.message });
    }
}