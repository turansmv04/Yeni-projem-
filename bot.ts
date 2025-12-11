import 'dotenv/config';
import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';

type InlineKeyboardMarkupFinal = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// NEXTJS URL-ləri
const NEXTJS_SUBSCRIBE_URL = 'https://yeni-projem-1.onrender.com/api/subscribe';
// Ləğvetmə (Unsubscribe) endpointi
const NEXTJS_UNSUBSCRIBE_URL = 'https://yeni-projem-1.onrender.com/api/unsubscribe';

// YENİ: İstifadəçi məlumatlarını çəkmək üçün endpoint
const NEXTJS_GET_SUBSCRIPTIONS_URL = 'https://yeni-projem-1.onrender.com/api/myinfo'; // <--- YENİ URL

if (!BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN .env faylında təyin edilməyib.');
}

const bot = new Telegraf<Context>(BOT_TOKEN);

// SubscriptionState tipini yeniləyirik (Vəziyyəti izləmək üçün 'step' əlavə edildi)
interface SubscriptionState {
  keyword: string | null;
  frequency: 'daily' | 'weekly' | null;
  step: 'waitingForKeyword' | 'waitingForUnsubscribeKeyword' | 'initial';
}

const userStates: Map<number, SubscriptionState> = new Map();

bot.command('subscribe', (ctx) => {
  if (!ctx.chat) return;
  userStates.set(ctx.chat.id, { keyword: null, frequency: null, step: 'waitingForKeyword' });
  console.log(`[DEBUG] /subscribe əmri alındı. Chat ID: ${ctx.chat.id}`);
  ctx.reply(
    '👋 Salam! Zəhmət olmasa, axtarış etmək istədiyiniz *Keyword*-ü (məsələn: CyberSecurity, Developer, Engineer) daxil edin.',
    { parse_mode: 'Markdown' }
  );
});

// /unsubscribe əmri
bot.command('unsubscribe', (ctx) => {
  if (!ctx.chat) return;
  // State-i ləğvetmə rejiminə keçiririk
  userStates.set(ctx.chat.id, { 
    keyword: null, 
    frequency: null, 
    step: 'waitingForUnsubscribeKeyword' 
  });
  console.log(`[DEBUG] /unsubscribe əmri alındı. Chat ID: ${ctx.chat.id}`);
  ctx.reply(
    '❌ Ləğv etmək istədiyiniz abunəliyin **Keyword**-ünü (məsələn: CyberSecurity) daxil edin.',
    { parse_mode: 'Markdown' }
  );
});

// YENİ: /myinfo əmri
bot.command('myinfo', async (ctx) => {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    await ctx.reply('ℹ️ Abunəlik məlumatlarınız yoxlanılır...');

    try {
        // GET sorğusu göndəririk. Chat ID URL query-də ötürülür.
        const response = await axios.get(NEXTJS_GET_SUBSCRIPTIONS_URL, {
            params: {
                ch_id: String(chatId)
            }
        });
        
        const { subscriptions } = response.data;

        if (subscriptions && subscriptions.length > 0) {
            let message = '⭐ **Sizin Aktiv Abunəlikləriniz** ⭐\n\n';

            subscriptions.forEach((sub: { keyword: string; frequency: 'daily' | 'weekly' }, index: number) => {
                // Keyword-un ilk hərfini böyüdürük (Gözəl görünməsi üçün)
                const formattedKeyword = sub.keyword.charAt(0).toUpperCase() + sub.keyword.slice(1);
                const formattedFrequency = sub.frequency === 'daily' ? 'Gündəlik ☀️' : 'Həftəlik 📅';

                message += `${index + 1}. **${formattedKeyword}**\n`;
                message += `    Tezlik: *${formattedFrequency}*\n`;
            });

            await ctx.reply(message, { parse_mode: 'Markdown' });

        } else {
            await ctx.reply('❌ Sizin hazırda heç bir aktiv abunəliyiniz yoxdur.\nAbunə olmaq üçün: /subscribe');
        }

    } catch (error: any) {
        console.error("❌❌ XƏTA: /myinfo API çağırışı uğursuz oldu:", error.message);
        await ctx.reply('❌ Məlumatları çəkərkən xəta baş verdi. Zəhmət olmasa, sonra yenidən cəhd edin.');
    }
});

// ✅ Keyword-ü tutan handler (Bütün mətn girişləri bu hissədə işlənir)
bot.on(message('text'), async (ctx) => {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const userText = ctx.message.text.trim();
    const state = userStates.get(chatId);
    
    // 1. Abunəlik üçün Keyword gözlənilir (Mövcud subscribe məntiqi)
    if (state?.step === 'waitingForKeyword' && state.keyword === null) {
        state.keyword = userText;
        console.log(`[DEBUG] Keyword qeyd edildi (Subscribe): ${state.keyword}`);

        const inlineKeyboard: InlineKeyboardMarkupFinal = {
            inline_keyboard: [
                [
                    { text: 'Gündəlik', callback_data: 'freq_daily' },
                    { text: 'Həftəlik', callback_data: 'freq_weekly' },
                ],
            ],
        };

        await ctx.reply(
            `✅ Keyword olaraq **${state.keyword}** seçildi.\nZəhmət olmasa, *Tezlik*-i (Frequency) seçin:`,
            { parse_mode: 'Markdown', reply_markup: inlineKeyboard }
        );
    } 
    
    // 2. Ləğvetmə üçün Keyword gözlənilir (YENİ MƏNTİQ)
    else if (state?.step === 'waitingForUnsubscribeKeyword') {
        const keywordToDelete = userText;
        
        try {
            // Unsubscribe üçün DELETE sorğusu göndəririk
            const response = await axios.delete(NEXTJS_UNSUBSCRIBE_URL, {
                data: { // DELETE metodunda body-ni data obyekti ilə ötürürük
                    ch_id: String(chatId),
                    keyword: keywordToDelete
                }
            });
            
            if (response.data.status === 'success') {
                await ctx.reply(`✅ '${keywordToDelete}' abunəliyi uğurla ləğv edildi.`);
            } else if (response.data.status === 'error' && response.data.message.includes('not found')) {
                await ctx.reply(`❌ Abunəlik tapılmadı. '${keywordToDelete}' açar sözünə abunə deyilsiniz.`);
            }
            else {
                await ctx.reply(`❌ Ləğvetmə uğursuz oldu: ${response.data.message || 'Daxili API xətası.'}`);
            }
        } catch (error: any) {
            console.error("❌❌ KRİTİK XƏTA: Unsubscribe API-yə qoşularkən xəta:", error.message);
            await ctx.reply(
                `❌ Ləğvetmə zamanı xəta baş verdi. Serverdə problem ola bilər.`
            );
        }
        
        userStates.delete(chatId); // State-i silin
    } 
    
    // 3. Əgər state mövcuddursa, amma nəsə səhv gedibsə (məsələn, düymə gözlənilir)
    else if (state && state.step !== 'initial') {
        await ctx.reply('Zəhmət olmasa, əməliyyatı bitirin və ya yenidən `/subscribe` və ya `/unsubscribe` yazın.');
    }
    // 4. Əgər heç bir state yoxdursa, boş buraxılır
});

// ✅ Callback (Düymə) handler (Köhnə subscribe callback-i)
bot.on('callback_query', async (ctx) => {
    if (!('data' in ctx.callbackQuery) || !ctx.chat) return;
    const callbackData = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    const state = userStates.get(chatId);

    // DEBUG: 1. Callback-in alındığını yoxla
    console.log(`[DEBUG] Callback alındı. Chat ID: ${chatId}, Data: ${callbackData}`);

    if (state && state.keyword && callbackData.startsWith('freq_')) {
        console.log('[DEBUG] Şərtlər ödənir. Prosesə başlanılır...');
        
        const frequency = callbackData.replace('freq_', '') as 'daily' | 'weekly';
        state.frequency = frequency;

        await ctx.answerCbQuery('Seçim qeydə alındı.');
        
        // Düymələri silmək (Təhlükəsiz try/catch əlavə edildi)
        try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] } as InlineKeyboardMarkupFinal);
        } catch (error) {
            console.error("[DEBUG] Düymə silinərkən kiçik xəta (normal ola bilər):", error);
        }

        try {
            const postData = {
                ch_id: String(chatId),
                keyword: state.keyword,
                frequency: state.frequency,
            };
            
            console.log("[DEBUG] API-yə göndərilən data:", postData);
            
            const response = await axios.post(NEXTJS_SUBSCRIBE_URL, postData);
            
            console.log("[DEBUG] API-dən gələn status kodu:", response.status);
            console.log("[DEBUG] API-dən gələn DATA:", response.data);

            if (response.data.status === 'success') {
                await ctx.reply(
                    `🎉 *Təbrik edirik!* Siz **${state.keyword}** sözünə *${state.frequency.toUpperCase()}* abunə oldunuz.`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await ctx.reply(
                    `❌ Abunəlik uğursuz oldu: ${response.data.message || 'Daxili API xətası.'}`
                );
            }

        } catch (error: any) {
            // DEBUG: 6. Əsas Xəta bloku
            console.error("❌❌ KRİTİK XƏTA: API-yə qoşularkən xəta:", error.message);
            await ctx.reply(
                `❌ Xəta baş verdi. Zəhmət olmasa, serverin işlək olduğundan əmin olun.\nXəta: ${error.message}`
            );
        }
        userStates.delete(chatId);
    } else {
        await ctx.answerCbQuery('Bu seçim artıq etibarlı deyil və ya proses bitib.');
    }
});

bot.launch()
  .then(() => {
    console.log('🤖 Telegram Botu uğurla işə düşdü!');
    console.log(`Abunəlik API-si: ${NEXTJS_SUBSCRIBE_URL}`);
  })
  .catch(err => {
    console.error('Bot işə düşərkən kritik xəta:', err);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));