import 'dotenv/config';
import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';

type InlineKeyboardMarkupFinal = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const NEXTJS_SUBSCRIBE_URL = process.env.NEXTJS_SUBSCRIBE_URL || 'http://localhost:3000/api/subscribe';

if (!BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN .env faylında təyin edilməyib.');
}

const bot = new Telegraf<Context>(BOT_TOKEN);

interface SubscriptionState {
  keyword: string | null;
  frequency: 'daily' | 'weekly' | null;
}

const userStates: Map<number, SubscriptionState> = new Map();

// /subscribe komandası
bot.command('subscribe', (ctx) => {
  if (!ctx.chat) return;
  
  userStates.set(ctx.chat.id, { keyword: null, frequency: null });
  
  ctx.reply(
    '👋 Salam! Zəhmət olmasa, axtarış etmək istədiyiniz *Keyword*-ü (məsələn: CyberSecurity, Developer, Engineer) daxil edin.',
    { parse_mode: 'Markdown' }
  );
});

// TEXT MESAJ HANDLER - BU ƏSAS HİSSƏ EKSİK İDİ!
bot.on(message('text'), async (ctx) => {
  if (!ctx.chat || !ctx.message.text) return;
  
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();
  
  // Əgər komanda deyilsə və state varsa
  if (!text.startsWith('/')) {
    const state = userStates.get(chatId);
    
    // Keyword gözləyirik
    if (state && !state.keyword) {
      state.keyword = text;
      
      // Frequency seçimi üçün klaviatura göstər
      const keyboard: InlineKeyboardMarkupFinal = {
        inline_keyboard: [
          [
            { text: '📅 Gündəlik (Daily)', callback_data: 'freq_daily' },
            { text: '📆 Həftəlik (Weekly)', callback_data: 'freq_weekly' }
          ]
        ]
      };
      
      await ctx.reply(
        `✅ Keyword: *${text}*\n\n📊 İndi tezliyini seçin:`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    }
  }
});

// Callback query handler (frequency seçimi)
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
        frequency: state.frequency,
      };
      
      console.log('📤 API-yə göndərilir:', postData);
      
      const response = await axios.post(NEXTJS_SUBSCRIBE_URL, postData, {
        timeout: 10000, // 10 saniyə timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data.status === 'success') {
        await ctx.reply(
          `🎉 *Təbrik edirik!* Siz "${state.keyword}" sözünə *${frequency.toUpperCase()}* abunə oldunuz.`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          `❌ Abunəlik uğursuz oldu: ${response.data.message || 'Daxili API xətası.'}`
        );
      }
    } catch (error: any) {
      console.error('❌ API xətası:', error);
      console.error('📋 Response data:', error.response?.data);
      console.error('📋 Status:', error.response?.status);
      
      let errorMsg = `❌ Xəta baş verdi.\n\nAPI URL: ${NEXTJS_SUBSCRIBE_URL}\n`;
      
      if (error.response) {
        // Server cavab verdi amma xəta kodu ilə (4xx, 5xx)
        errorMsg += `\n🔴 Status: ${error.response.status}`;
        errorMsg += `\n📄 Cavab: ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        // Sorğu göndərildi amma cavab gəlmədi
        errorMsg += '\n🔴 Serverdən cavab gəlmədi. Server işləyirmi?';
        errorMsg += '\n💡 Next.js serveri başlatmağı unutmusunuz?';
      } else {
        // Başqa xəta
        errorMsg += `\n🔴 Xəta: ${error.message}`;
      }
      
      await ctx.reply(errorMsg);
    }
    
    userStates.delete(chatId);
  } else {
    await ctx.answerCbQuery('Bu seçim artıq etibarlı deyil.');
  }
});

bot.launch()
  .then(() => {
    console.log('🤖 Telegram Botu uğurla işə düşdü!');
    console.log(`📡 Abunəlik API-si: ${NEXTJS_SUBSCRIBE_URL}`);
  })
  .catch(err => {
    console.error('❌ Bot işə düşərkən kritik xəta:', err);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));