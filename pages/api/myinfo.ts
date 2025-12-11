import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseClient } from '../../src/supabase'; 

// Bu API istifadəçinin bütün aktiv abunəliklərini Supabase-dən çəkir.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    // Yalnız GET metodunu qəbul edirik
    if (req.method !== 'GET') {
        return res.status(405).json({ status: 'error', message: 'Method Not Allowed. Yalnız GET icazəlidir.' });
    }

    const { ch_id } = req.query; // GET sorğusunda Chat ID URL query-də (req.query) gəlir

    if (!ch_id || typeof ch_id !== 'string') {
        return res.status(400).json({ status: 'error', message: 'Chat ID (ch_id) tələb olunur.' });
    }

    const chatIdNumber = parseInt(ch_id, 10);
    if (isNaN(chatIdNumber)) {
        return res.status(400).json({ status: 'error', message: 'ch_id düzgün rəqəm formatında deyil.' });
    }

    try {
        const supabase = createSupabaseClient();
        
        // Supabase-dən abunəlikləri çəkirik
        const { data: subscriptions, error } = await supabase
            .from('subscribe') // Sizin 'subscribe' cədvəlinizin adı
            .select('keyword, frequency') // Yalnız keyword və frequency sütunlarını seçirik
            .eq('chat_id', chatIdNumber)
            .order('keyword', { ascending: true }); // Keyword-ə görə sıralayırıq

        if (error) {
            console.error('❌ Supabase məlumat çəkmə xətası:', error.message);
            return res.status(500).json({ status: 'error', message: `Bazadan məlumat çəkilərkən xəta: ${error.message}` });
        }

        return res.status(200).json({ 
            status: 'success', 
            subscriptions: subscriptions || [], 
        });

    } catch (error: any) {
        console.error('API GetSubscriptions Gözlənilməyən Xəta:', error);
        return res.status(500).json({ status: 'error', message: 'Daxili server xətası.' });
    }
}