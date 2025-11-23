// my-scrape-project/bot.ts

import 'dotenv/config'; // 🛑 DÜZƏLİŞ: En yuxarıya qoyuldu!

import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';

// Problem yaradan telegraf/types importlarını silirik və tipin təyinatını özümüz edirik.
type InlineKeyboardMarkupFinal = {
    inline_keyboard: {
        text: string;
        callback_data: string;
    }[][];
};

// --- KONFİQURASİYA ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const NEXTJS_SUBSCRIBE_URL = 'http://localhost:3000/api/subscribe'; 

if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN .env faylında təyin edilməyib.');
}

// Context tipi düzgün təyin olunur
const bot = new Telegraf<Context>(BOT_TOKEN);

interface SubscriptionState {
    keyword: string | null;
    frequency: 'daily' | 'weekly' | null;
}
const userStates: Map<number, SubscriptionState> = new Map();

// --- 1. /subscribe əmri ---
bot.command('subscribe', (ctx) => {
    if (!ctx.chat) return;
    userStates.set(ctx.chat.id, { keyword: null, frequency: null });
    
    ctx.reply(
        '👋 Salam! Zəhmət olmasa, axtarış etmək istədiyiniz *Keyword*-ü (məsələn: React, Developer, Senior Python) daxil edin.',
        { parse_mode: 'Markdown' }
    );
});

// --- 2. Keyword-ü qəbul etmək ---
 

// --- 3. Frequency-i qəbul etmək və API-yə göndərmək ---
bot.on('callback_query', async (ctx) => {
    if (!('data' in ctx.callbackQuery) || !ctx.chat) return; 
    
    const callbackData = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    const state = userStates.get(chatId);
    
    if (state && state.keyword && callbackData.startsWith('freq_')) {
        const frequency = callbackData.replace('freq_', '') as 'daily' | 'weekly';
        state.frequency = frequency;

        await ctx.answerCbQuery();
        
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] } as InlineKeyboardMarkupFinal); 

        // --- POST API SORĞUSU ---
        try {
            const postData = {
                ch_id: String(chatId), 
                keyword: state.keyword,
                frequency: state.frequency
            };

            const response = await axios.post(NEXTJS_SUBSCRIBE_URL, postData);
            
            if (response.data.status === 'success') {
                await ctx.reply(
                    `🎉 *Təbrik edirik!* Siz \`${state.keyword}\` sözünə *${state.frequency.toUpperCase()}* abunə oldunuz.`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await ctx.reply(`❌ Abunəlik uğursuz oldu: ${response.data.message || 'Daxili API xətası.'}`);
            }

        } catch (error: any) {
            console.error("API-yə qoşularkən xəta:", error.message);
            await ctx.reply(`❌ Xəta baş verdi. Zəhmət olmasa, serverin işlək olduğundan əmin olun. Xəta: ${error.message}`);
        }

        userStates.delete(chatId);
    } else {
        await ctx.answerCbQuery('Bu seçim artıq etibarlı deyil.');
    }
});


// Botu işə salırıq
bot.launch().then(() => {
    console.log('🤖 Telegram Botu uğurla işə düşdü!');
    console.log(`Abunəlik API-si: ${NEXTJS_SUBSCRIBE_URL}`);
}).catch(err => {
    console.error('Bot işə düşərkən kritik xəta:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));