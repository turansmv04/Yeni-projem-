import 'dotenv/config';
import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';

type InlineKeyboardMarkupFinal = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// 1. ✅ DÜZƏLİŞ: Public URL təyin edildi
const NEXTJS_SUBSCRIBE_URL = 'https://yeni-projem-1.onrender.com/api/subscribe';

if (!BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN .env faylında təyin edilməyib.');
}

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
    '👋 Salam! Zəhmət olmasa, axtarış etmək istədiyiniz *Keyword*-ü (məsələn: CyberSecurity, Developer, Engineer) daxil edin.',
    { parse_mode: 'Markdown' }
  );
});

// 2. ✅ DÜZƏLİŞ: Keyword-ü tutan və frequency-i soruşan handler əlavə edildi
bot.on(message('text'), async (ctx) => {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const state = userStates.get(chatId);

    // Əgər state mövcuddursa və keyword hələ qeyd edilməyibsə
    if (state && state.keyword === null) {
        state.keyword = ctx.message.text.trim();

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
    } else if (state && state.keyword !== null && state.frequency === null) {
        // İstifadəçi frequency gözlənilərkən başqa mətn yazarsa
        await ctx.reply('Zəhmət olmasa, yuxarıdakı düymələrdən birini seçin: Gündəlik və ya Həftəlik.');
    }
    // Əks halda (əgər state yoxdursa və ya abunəlik prosesi bitibsə), mətnə cavab vermir.
});

bot.on('callback_query', async (ctx) => {
  if (!('data' in ctx.callbackQuery) || !ctx.chat) return;
  const callbackData = ctx.callbackQuery.data;
  const chatId = ctx.chat.id;
  const state = userStates.get(chatId);
  
  // Əmin oluruq ki, state, keyword var və bu bir frequency seçimidir.
  if (state && state.keyword && callbackData.startsWith('freq_')) {
    const frequency = callbackData.replace('freq_', '') as 'daily' | 'weekly';
    state.frequency = frequency;
    
    // Düyməyə basılmasını təsdiqləyir və düymələri silir
    await ctx.answerCbQuery('Seçim qeydə alındı.');
    
    // Düymələri sildikdə bəzən Telegraf xəta verə bilər. Aşağıdakı sətir bu məqsədlə istifadə olunur.
    // Lakin, biz indi editMessageReplyMarkup istifadə edirik
    try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] } as InlineKeyboardMarkupFinal);
    } catch (error) {
        // Mesaj çox köhnədirsə, bu xəta normaldır.
        console.log("Mesaj markupu silinərkən xəta baş verdi (yəqin ki, çox köhnədir).");
    }

    try {
      const postData = {
        ch_id: String(chatId),
        keyword: state.keyword,
        frequency: state.frequency,
      };
      
      // API müraciəti
      const response = await axios.post(NEXTJS_SUBSCRIBE_URL, postData);
      
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
      console.error("API-yə qoşularkən xəta:", error.message);
      await ctx.reply(
        `❌ Xəta baş verdi. Zəhmət olmasa, serverin işlək olduğundan əmin olun.\nXəta: ${error.message}`
      );
    }
    
    // Proses bitdi, state silinir
    userStates.delete(chatId);
  } else {
    await ctx.answerCbQuery('Bu seçim artıq etibarlı deyil və ya proses tamamlanıb.');
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