export function isPlaceholderContactName(name: string | null | undefined, blockedNames?: Array<string | null | undefined>): boolean;
export function isPhoneOnlyName(name: string | null | undefined, phone?: string | null): boolean;
export function isPixOrPaymentMessage(textContent: string | null | undefined): boolean;
export function resolvePhoneFallback(phone?: string | null, whatsappJid?: string | null): string;
export function sanitizeContactNameValue(
  targetName: string | null | undefined,
  fallbackPhone?: string | null,
  blockedNames?: Array<string | null | undefined>
): string | null;
export function needsContactName(contact?: {
  name?: string | null;
  custom_name?: string | null;
  phone?: string | null;
} | null): boolean;
export function extractContactNameFromAutomation(params: {
  textContent?: string | null;
  conditionText?: string | null;
  senderType?: string | null;
  direction?: string | null;
  fromMe?: boolean;
  existingContact?: {
    name?: string | null;
    custom_name?: string | null;
    phone?: string | null;
  } | null;
  blockedNames?: Array<string | null | undefined>;
}): string | null;
