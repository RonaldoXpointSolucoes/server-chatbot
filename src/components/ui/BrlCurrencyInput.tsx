import React, { useEffect, useRef, useState } from 'react';
import {
  formatCentsAsBrlInput,
  formatLiveBrlInput,
  formatReaisAsBrlInput,
  parseFormattedBrlToCents,
  parseFormattedBrlToReais
} from '../../utils/currencyInputMask.mjs';

interface BrlCurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'defaultValue'> {
  /** Valor controlado em centavos inteiros (preferencial para conciliação). */
  valueCents?: number | null;
  onChangeCents?: (cents: number | null) => void;
  /** Valor controlado em reais (number), para cadastros CRM / Planos / Vouchers. */
  valueReais?: number | null;
  onChangeReais?: (reais: number) => void;
  /** Valor controlado em string BRL formatada ('50,00') ou numérica ('50'). */
  valueText?: string;
  onChangeText?: (formattedText: string, meta: { cents: number | null; reais: number }) => void;
  /** Quando true e o valor numérico for 0, exibe vazio para mostrar o placeholder. */
  allowEmptyZero?: boolean;
}

function resolveIncomingText({
  valueCents,
  valueReais,
  valueText,
  allowEmptyZero
}: Pick<BrlCurrencyInputProps, 'valueCents' | 'valueReais' | 'valueText' | 'allowEmptyZero'>): string {
  if (valueCents !== undefined) {
    if (valueCents === null) return '';
    if (allowEmptyZero && valueCents === 0) return '';
    return formatCentsAsBrlInput(valueCents);
  }
  if (valueReais !== undefined) {
    if (valueReais === null || Number.isNaN(Number(valueReais))) return '';
    return formatReaisAsBrlInput(valueReais, { allowEmptyZero });
  }
  if (valueText !== undefined) {
    const trimmed = String(valueText).trim();
    if (!trimmed) return '';
    const cents = parseFormattedBrlToCents(trimmed);
    if (cents === null) return '';
    if (allowEmptyZero && cents === 0) return '';
    return formatCentsAsBrlInput(cents);
  }
  return '';
}

function resolveIncomingCents({
  valueCents,
  valueReais,
  valueText,
  allowEmptyZero
}: Pick<BrlCurrencyInputProps, 'valueCents' | 'valueReais' | 'valueText' | 'allowEmptyZero'>): number | null {
  if (valueCents !== undefined) {
    if (valueCents === null) return null;
    if (allowEmptyZero && valueCents === 0) return null;
    return Math.round(Number(valueCents));
  }
  if (valueReais !== undefined) {
    if (valueReais === null || Number.isNaN(Number(valueReais))) return null;
    const cents = Math.round(Number(valueReais) * 100);
    if (allowEmptyZero && cents === 0) return null;
    return cents;
  }
  if (valueText !== undefined) {
    const trimmed = String(valueText).trim();
    if (!trimmed) return null;
    const cents = parseFormattedBrlToCents(trimmed);
    if (cents === null) return null;
    if (allowEmptyZero && cents === 0) return null;
    return cents;
  }
  return null;
}

/**
 * Input monetário BRL universal com máscara automática em tempo real (ATM):
 * digitar "33010" exibe "330,10" automaticamente sem precisar de ponto nem vírgula.
 */
export const BrlCurrencyInput: React.FC<BrlCurrencyInputProps> = ({
  valueCents,
  onChangeCents,
  valueReais,
  onChangeReais,
  valueText,
  onChangeText,
  allowEmptyZero = false,
  placeholder = '0,00',
  onFocus,
  onBlur,
  ...rest
}) => {
  const [displayText, setDisplayText] = useState<string>(() =>
    resolveIncomingText({ valueCents, valueReais, valueText, allowEmptyZero })
  );
  const displayTextRef = useRef(displayText);
  displayTextRef.current = displayText;
  const isFocusedRef = useRef(false);

  useEffect(() => {
    const incomingCents = resolveIncomingCents({ valueCents, valueReais, valueText, allowEmptyZero });
    const currentCents = parseFormattedBrlToCents(displayTextRef.current);
    if (incomingCents !== currentCents) {
      // Se estiver focado com '0,00' explícito e allowEmptyZero=true com valor 0, mantém '0,00' enquanto usuário digita
      if (isFocusedRef.current && allowEmptyZero && currentCents === 0 && incomingCents === null) {
        return;
      }
      setDisplayText(resolveIncomingText({ valueCents, valueReais, valueText, allowEmptyZero }));
    }
  }, [valueCents, valueReais, valueText, allowEmptyZero]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={displayText}
      placeholder={placeholder}
      onFocus={(e) => {
        isFocusedRef.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        isFocusedRef.current = false;
        const normalized = resolveIncomingText({ valueCents, valueReais, valueText, allowEmptyZero });
        if (normalized !== displayTextRef.current) {
          setDisplayText(normalized);
        }
        onBlur?.(e);
      }}
      onChange={(e) => {
        const res = formatLiveBrlInput(e.target.value, displayTextRef.current);
        setDisplayText(res.text);
        if (onChangeCents) onChangeCents(res.cents);
        if (onChangeReais) onChangeReais(res.reais);
        if (onChangeText) onChangeText(res.text, { cents: res.cents, reais: parseFormattedBrlToReais(res.text) });
      }}
    />
  );
};
