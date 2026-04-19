import os
import logging

from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes

load_dotenv()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

SPORTS_MENU = InlineKeyboardMarkup([
    [InlineKeyboardButton("⚽ כדורגל", callback_data="football"),
     InlineKeyboardButton("🏀 כדורסל", callback_data="basketball")],
    [InlineKeyboardButton("🎾 טניס", callback_data="tennis"),
     InlineKeyboardButton("🏐 כדורעף", callback_data="volleyball")],
    [InlineKeyboardButton("ℹ️ עזרה", callback_data="help")],
])

SPORT_INFO = {
    "football": "⚽ *כדורגל*\n\nליגות פופולריות:\n• ליגת העל הישראלית\n• פרמייר ליג\n• לה ליגה\n• סריה A\n• בונדסליגה",
    "basketball": "🏀 *כדורסל*\n\nליגות פופולריות:\n• ליגת Winner סאל\n• NBA\n• יורוליג",
    "tennis": "🎾 *טניס*\n\nטורנירים גדולים:\n• אליפות אוסטרליה\n• רולאן גארוס\n• ווימבלדון\n• US Open",
    "volleyball": "🏐 *כדורעף*\n\nליגות ותחרויות:\n• ליגת העל בישראל\n• ליגת האומות\n• אליפות אירופה",
}


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    await update.message.reply_text(
        f"שלום {user.first_name}! 🏆\n\n"
        "ברוכים הבאים לבוט הספורט! 🇮🇱\n"
        "בחר ענף ספורט מהתפריט:",
        reply_markup=SPORTS_MENU,
    )


async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    if query.data == "help":
        await query.edit_message_text(
            "ℹ️ *עזרה*\n\n"
            "פקודות זמינות:\n"
            "/start \\- התחל והצג תפריט\n"
            "/help \\- הצג עזרה\n\n"
            "לחץ על ענף ספורט כדי לקבל מידע\\!",
            parse_mode="MarkdownV2",
            reply_markup=SPORTS_MENU,
        )
        return

    text = SPORT_INFO.get(query.data, "לא נמצא מידע.")
    back_button = InlineKeyboardMarkup([
        [InlineKeyboardButton("🔙 חזרה לתפריט", callback_data="back")],
    ])
    await query.edit_message_text(text, parse_mode="Markdown", reply_markup=back_button)


async def back_to_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(
        "בחר ענף ספורט מהתפריט: 🏆",
        reply_markup=SPORTS_MENU,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "פקודות זמינות:\n"
        "/start - התחל והצג תפריט\n"
        "/help - הצג עזרה\n\n"
        "לחץ על ענף ספורט כדי לקבל מידע!",
        reply_markup=SPORTS_MENU,
    )


async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "שלח /start כדי לראות את התפריט 🏆",
        reply_markup=SPORTS_MENU,
    )


def main() -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set. Copy .env.example to .env and add your token.")

    app = ApplicationBuilder().token(token).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CallbackQueryHandler(back_to_menu, pattern="^back$"))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))

    logger.info("Bot started")
    app.run_polling()


if __name__ == "__main__":
    main()
