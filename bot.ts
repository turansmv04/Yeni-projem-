import 'dotenv/config';
import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';

// --- Mühit Dəyişənlərini Yoxlayın ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const NEXTJS_SUBSCRIBE_URL = process.env.SUBSCRIBE_API_URL;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN; 
const BOT_SECRET_PATH = process.env.BOT_SECRET_PATH || '/telegraf-webhook-default'; 
const PORT = process.env.PORT || 3000; // Render portu avtomatik təyin olunacaq

if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN təyin edilməyib.');
if (!NEXTJS_SUBSCRIBE_URL) throw new Error('SUBSCRIBE_API_URL təyin edilməyib.');
if (process.env.NODE_ENV === 'production' && !WEBHOOK_DOMAIN) {
    throw new Error('NODE_ENV=production rejimində WEBHOOK_DOMAIN təyin edilməlidir.');
}

const bot = new Telegraf<Context>(BOT_TOKEN);

// --- Type Definitions ---
type InlineKeyboardMarkupFinal = {
    inline_keyboard: {
        text: string;
        callback_data: string;
    }[][];
};

interface SubscriptionState {
    keyword: string | null;
    frequency: 'daily' | 'weekly' | null;
}
const userStates: Map<number, SubscriptionState> = new Map();

// --- Bot Command Handlers ---

bot.command('subscribe', (ctx) => {
    if (!ctx.chat) return;
    userStates.set(ctx.chat.id, { keyword: null, frequency: null });
    
    ctx.reply(
        '👋 Salam! Zəhmət olmasa, axtarış etmək istədiyiniz *Keyword*-ü (məsələn: CyberSecurity, Developer, Engineer) daxil edin.',
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

            // API-nin yuxu rejimindən oyanması üçün Timeout 30 saniyəyə qaldırıldı.
            const response = await axios.post(NEXTJS_SUBSCRIBE_URL, postData, {
                timeout: 30000, 
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
            await ctx.reply(`❌ Xəta baş verdi. Server cavab vermədi (Timeout). Zəhmət olmasa, yenidən cəhd edin.`);
        }

        userStates.delete(chatId);
    } else {
        await ctx.answerCbQuery('Bu seçim artıq etibarlı deyil.');
    }
});

// --- İŞƏ SALMA MƏNTİQİ (Launch Logic) ---

async function launchBot() {
    if (process.env.NODE_ENV === 'production') {
        // Production (Render) - Webhook istifadəsi
        const fullWebhookUrl = `https://${WEBHOOK_DOMAIN}${BOT_SECRET_PATH}`;
        
        console.log('Production mühiti. Webhook quraşdırılır...');
        
        // 1. Öncəki webhookları sil (təmizlik)
        await bot.telegram.deleteWebhook().catch(e => console.log('Təmizləmə zamanı xəta:', e.message));
        
        // 2. Webhook-u Telegraf daxilində quraşdır. '!' ilə qırmızı xətlər aradan qaldırıldı.
        await bot.launch({
            webhook: {
                domain: WEBHOOK_DOMAIN!, 
                hookPath: BOT_SECRET_PATH!, 
                port: Number(PORT)
            }
        });
        
        // 3. Telegram API-yə Webhook URL-imizi təyin et
        await bot.telegram.setWebhook(fullWebhookUrl);

        console.log(`🤖 Bot Webhook rejimində işə düşdü. Dinləyir port: ${PORT}`);
        console.log(`Webhook URL: ${fullWebhookUrl}`);

    } else {
        // Development (Local) - Long Polling istifadəsi
        console.log('Local mühitdə işləyir. Webhook silinir və Long Polling aktivləşdirilir.');
        await bot.telegram.deleteWebhook().catch(e => console.log('Silinəcək Webhook yoxdur.'));
        await bot.launch();
        console.log('🤖 Telegram Botu Long Polling rejimində uğurla işə düşdü!');
    }
}

launchBot().catch(err => {
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