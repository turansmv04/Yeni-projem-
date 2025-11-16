// pages/api/telegram.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { Telegraf } from 'telegraf';
import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN tapılmadı');
}

const bot = new Telegraf(BOT_TOKEN);

interface SubscriptionState {
    keyword: string | null;
    frequency: 'daily' | 'weekly' | null;
}
const userStates: Map<number, SubscriptionState> = new Map();

// /subscribe command
bot.command('subscribe', (ctx) => {
    if (!ctx.chat) return;
    userStates.set(ctx.chat.id, { keyword: null, frequency: null });
    
    ctx.reply(
        '👋 Salam! Zəhmət olmasa, axtarış etmək istədiyiniz *Keyword*-ü daxil edin.',
        { parse_mode: 'Markdown' }
    );
});

// Text mesajları
bot.on('text', async (ctx) => {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const state = userStates.get(chatId);

    if (state && !state.keyword) {
        const keyword = ctx.message.text.trim();
        state.keyword = keyword;

        ctx.reply(
            `Keyword: *${keyword}*. İndi bildirişləri hansı tezliklə almaq istədiyinizi seçin:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Günlük (Daily)', callback_data: 'freq_daily' }],
                        [{ text: 'Həftəlik (Weekly)', callback_data: 'freq_weekly' }]
                    ]
                },
                parse_mode: 'Markdown'
            }
        );
        userStates.set(chatId, state);
    }
});

// Callback query
bot.on('callback_query', async (ctx) => {
    if (!('data' in ctx.callbackQuery) || !ctx.chat) return;
    
    const callbackData = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    const state = userStates.get(chatId);
    
    if (state && state.keyword && callbackData.startsWith('freq_')) {
        const frequency = callbackData.replace('freq_', '') as 'daily' | 'weekly';
        state.frequency = frequency;

        await ctx.answerCbQuery();
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

        try {
            const postData = {
                ch_id: String(chatId),
                keyword: state.keyword,
                frequency: state.frequency
            };

            // Internal API call
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await axios.post(`${apiUrl}/api/subscribe`, postData);
            
            if (response.data.status === 'success') {
                await ctx.reply(
                    `🎉 *Təbrik edirik!* Siz \`${state.keyword}\` sözünə *${frequency.toUpperCase()}* abunə oldunuz.`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await ctx.reply(`❌ Abunəlik uğursuz oldu: ${response.data.message || 'Xəta.'}`);
            }

        } catch (error: any) {
            console.error("API xətası:", error.message);
            await ctx.reply(`❌ Xəta baş verdi: ${error.message}`);
        }

        userStates.delete(chatId);
    } else {
        await ctx.answerCbQuery('Bu seçim artıq etibarlı deyil.');
    }
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        try {
            await bot.handleUpdate(req.body);
            res.status(200).json({ ok: true });
        } catch (error) {
            console.error('Telegram webhook xətası:', error);
            res.status(500).json({ error: 'Webhook xətası' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}