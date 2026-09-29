import 'server-only';

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

/** wa.me link to the business number (digits only). */
export function whatsappLink(number: string | undefined | null, text: string) {
  const digits = (number || process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
