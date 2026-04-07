import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utilitário padrão do Shadcn/UI para mesclar classes Tailwind condicionalmente.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
