/** Single source of truth for the storefront contact number. */
export const PHONE_DISPLAY = '+1 (876) 430-0550';
export const PHONE_TEL = '+18764300550';

// WhatsApp click-to-chat: digits only, no '+' or spaces.
const WHATSAPP_NUMBER = '18764300550';
const WHATSAPP_TEXT = "Hi Tools Jamaica! I'd like to ask about a product.";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;

/** Build a WhatsApp click-to-chat link with a custom prefilled message (e.g. per-product enquiries). */
export const whatsappUrl = (message: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
