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
const NEXTJS_SUBSCRIBE_URL = process.env.NEXT_PUBLIC_SUBSCRIBE_API_URL;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN yoxdur');
if (!NEXTJS_SUBSCRIBE_URL) throw new Error('NEXTJS_SUBSCRIBE_URL yoxdur');

const bot = new Telegraf<Context>(BOT_TOKEN);

interface SubscriptionState {
    keyword: string | null;
    frequency: 'daily' | 'weekly' | null;
}
const userStates: Map<number, SubscriptionState> = new Map();

bot.command('subscribe', (ctx) => {
    if (!ctx.chat) return;
    userStates.set(ctx.chat.id, { keyword: null, frequency: null });
    
    ctx.reply(
        'Keyword daxil edin. Misal: CyberSecurity, Developer, Engineer',
        { parse_mode: 'Markdown' }
    );
});

bot.on(message('text'), async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const state = userStates.get(chatId);
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
        `Keyword: *${keyword}* qəbul edildi.\nTezliyi seçin:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
    );
});

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

            const response = await axios.post(NEXTJS_SUBSCRIBE_URL, postData);
            
            if (response.data.status === 'success') {
                await ctx.reply(
                    `🎉 Siz \`${state.keyword}\` üçün *${state.frequency.toUpperCase()}* abunə oldunuz.`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await ctx.reply(`❌ Xəta: ${response.data.message || 'API xətası'}`);
            }

        } catch (error: any) {
            console.error("API Error:", error.message);
            await ctx.reply(`❌ Serverlə əlaqə mümkün olmadı. Xəta: ${error.message}`);
        }

        userStates.delete(chatId);
    } else {
        await ctx.answerCbQuery('Artıq etibarlı deyil.');
    }
});

bot.launch()
    .then(() => {
        console.log('Telegram Bot İşə düşdü!');
        console.log(`API endpoint: ${NEXTJS_SUBSCRIBE_URL}`);
    })
    .catch(err => {
        console.error('Bot start xətası:', err);
    });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
