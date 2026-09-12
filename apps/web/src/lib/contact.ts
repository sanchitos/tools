/** Single source of truth for the storefront contact number. */
export const PHONE_DISPLAY = '+1 (876) 430-0550';

// WhatsApp click-to-chat: digits only, no '+' or spaces.
const WHATSAPP_NUMBER = '18764300550';

/**
 * Build a WhatsApp click-to-chat link with a prefilled message.
 *
 * There is deliberately no baked-in WHATSAPP_URL constant: the prefilled text
 * is user-facing copy and must follow the selected language, so every caller
 * passes `t('whatsapp.defaultMessage')` (or a per-product enquiry string).
 */
export const whatsappUrl = (message: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
