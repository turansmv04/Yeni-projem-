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
const NEXTJS_SUBSCRIBE_URL = process.env.SUBSCRIBE_API_URL || 'http://localhost:3000/api/subscribe';

if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN .env faylında təyin edilməyib.');
}

const bot = new Telegraf<Context>(BOT_TOKEN);

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
        '👋 Salam! Zəhmət olmasa, axtarış etmək istədiyiniz *Keyword*-ü (məsələn: CyberSecurity, Developer, Engineer) daxil edin.',
        { parse_mode: 'Markdown' }
    );
});

// Text message handler - keyword qəbul edir
bot.on(message('text'), async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const state = userStates.get(chatId);
    
    // Əgər state yoxdursa və ya keyword artıq alınıbsa, geri qayıt
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

// Callback query handler - frequency seçimi
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

            console.log('API-yə göndərilir:', NEXTJS_SUBSCRIBE_URL);
            console.log('Data:', postData);

            const response = await axios.post(NEXTJS_SUBSCRIBE_URL, postData, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
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
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            await ctx.reply(`❌ Xəta baş verdi. Zəhmət olmasa, serverin işlək olduğundan əmin olun.\nXəta: ${error.message}`);
        }

        userStates.delete(chatId);
    } else {
        await ctx.answerCbQuery('Bu seçim artıq etibarlı deyil.');
    }
});

// Bot-u işə sal
bot.launch().then(async () => {
    console.log('🤖 Telegram Botu uğurla işə düşdü!');
    console.log(`Abunəlik API-si: ${NEXTJS_SUBSCRIBE_URL}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Webhook məlumatlarını yoxla
    try {
        const webhookInfo = await bot.telegram.getWebhookInfo();
        console.log('Webhook info:', webhookInfo);
        
        // Əgər webhook qurulubsa və siz local test edirsinizsə, silin
        if (webhookInfo.url && process.env.NODE_ENV !== 'production') {
            console.log('Webhook silinir (local development üçün)...');
            await bot.telegram.deleteWebhook();
            console.log('Webhook silindi. Long polling aktiv.');
        }
    } catch (error) {
        console.error('Webhook yoxlanılarkən xəta:', error);
    }
}).catch(err => {
    console.error('Bot işə düşərkən kritik xəta:', err);
    process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('SIGINT siqnalı alındı. Bot dayanır...');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('SIGTERM siqnalı alındı. Bot dayanır...');
    bot.stop('SIGTERM');
});