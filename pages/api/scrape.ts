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
        await runScrapeAndGetData(); 

        return res.status(200).json({ 
            message: 'Scraping prosesi uğurla başladıldı və tamamlandı.',
        });

    } catch (error: any) {
        console.error("API-də kritik xəta baş verdi:", error);
        return res.status(500).json({ 
            message: 'Daxili server xətası. Konsolda daha ətraflı baxın.', 
            error: error.message 
        });
    }
}