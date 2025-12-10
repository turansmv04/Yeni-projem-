import 'dotenv/config';

import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';

type InlineKeyboardMarkupFinal = {
    inline_keyboard: {
        text: string;
        callback_data: string;
    }[][];
};

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// NEXTJS_SUBSCRIBE_URL Render/Public mühitdə işləməsi üçün ENV-dən götürülməlidir.
const NEXTJS_SUBSCRIBE_URL = process.env.SUBSCRIBE_API_URL || 'http://localhost:3000/api/subscribe'; 

if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN .env faylında təyin edilməyib.');
}
if (!process.env.SUBSCRIBE_API_URL && process.env.NODE_ENV === 'production') {
    // Renderdə olarkən bu URL-in təyin edilməsi vacibdir.
    throw new Error('SUBSCRIBE_API_URL .env/Render dəyişənlərində təyin edilməlidir.');
}


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
        '👋 Salam! Zəhmət olmasa, axtarış etmək istədiyiniz *Keyword*-ü (məsələn: CyberSecurity, Developer, Engineer) daxil edin.',
        { parse_mode: 'Markdown' }
    );
});

// --- 2. BƏRPA EDİLMİŞ HİSSƏ: Keyword Qəbulu (Text Message Handler) ---
bot.on(message('text'), async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const state = userStates.get(chatId);
    
    // Yoxlama: Abunəlik prosesi başlamayıbsa və ya keyword artıq alınıbsa, geri qayıt
    if (!state || state.keyword !== null) return;

    const keyword = ctx.message.text.trim();
    state.keyword = keyword;

    const keyboard: InlineKeyboardMarkupFinal = {
        inline_keyboard: [
            [
                { text: '📅 Daily', callback_data: 'freq_daily' },
                { text: '🗓 Weekly', callback_data: 'freq_weekly' }
            ]
        ]
    };

    await ctx.reply(
        `✅ Keyword: *${keyword}* qəbul edildi.\n\nİndi tezliyi seçin:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
    );
});


// --- 3. Callback Query (Frequency seçimi) ---
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

        
        try {
            const postData = {
                ch_id: String(chatId), 
                keyword: state.keyword,
                frequency: state.frequency
            };

            // Timeout 30 saniyəyə qaldırıldı (Renderdə yuxudan oyanmaya vaxt vermək üçün)
            const response = await axios.post(NEXTJS_SUBSCRIBE_URL, postData, {
                 timeout: 30000 
            });
            
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
            await ctx.reply(`❌ Xəta baş verdi. Serverlə əlaqə kəsildi (Timeout). Zəhmət olmasa, serverin işlək olduğundan əmin olun.`);
        }

        userStates.delete(chatId);
    } else {
        await ctx.answerCbQuery('Bu seçim artıq etibarlı deyil.');
    }
});


// --- Botu İşə Salma (Long Polling) ---
bot.launch().then(async () => {
    console.log('🤖 Telegram Botu uğurla işə düşdü!');
    console.log(`Abunəlik API-si: ${NEXTJS_SUBSCRIBE_URL}`);
    
    // Təmizlik (Webhook-u silmək, əgər təsadüfən qurulubsa)
    await bot.telegram.deleteWebhook().catch(() => {});
    console.log('Local Long Polling aktiv.');
}).catch(err => {
    console.error('Bot işə düşərkən kritik xəta:', err);
    process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));