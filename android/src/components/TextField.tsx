import { Check, type LucideIcon } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors, iconSizes, radii, sizes, spacing, strokes, typography } from '@/theme';

import { Text, textTones } from './Text';

export type FieldStatusTone = 'accent' | 'muted' | 'warning' | 'danger';

export type FieldStatus = {
  tone: FieldStatusTone;
  text: string;
  /** Check (accent), a spinner (checking), or any lucide icon. */
  icon?: 'check' | 'spinner' | LucideIcon;
};

export type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  label: string;
  variant?: 'default' | 'mono' | 'pin';
  helper?: string;
  status?: FieldStatus;
  error?: string;
  /** Confirmed valid: accent border. */
  valid?: boolean;
  /** Gallery only: draw the focused state. */
  previewFocused?: boolean;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    variant = 'default',
    helper,
    status,
    error,
    valid = false,
    previewFocused = false,
    editable = true,
    onFocus,
    onBlur,
    ...inputProps
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const hasError = !!error || status?.tone === 'danger';
  const borderColor = hasError
    ? colors.danger
    : focused || previewFocused || valid
      ? colors.accentBorder
      : colors.border;

  return (
    <View style={styles.field}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <TextInput
        ref={ref}
        {...inputProps}
        editable={editable}
        accessibilityLabel={label}
        accessibilityState={{ disabled: !editable }}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, inputText[variant], { borderColor }, !editable && styles.disabled]}
      />
      {error ? (
        <Text variant="status" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : status ? (
        <StatusLine status={status} />
      ) : helper ? (
        <Text variant="helper" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

export function StatusLine({ status }: { status: FieldStatus }) {
  const color = textTones[status.tone];
  const Icon = status.icon === 'check' ? Check : status.icon === 'spinner' ? null : status.icon;
  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      {status.icon === 'spinner' ? (
        <ActivityIndicator size={iconSizes.status} color={color} />
      ) : Icon ? (
        <Icon
          size={iconSizes.status}
          color={color}
          strokeWidth={status.icon === 'check' ? strokes.check : strokes.icon}
        />
      ) : null}
      <Text variant="status" tone={status.tone} style={styles.statusText}>
        {status.text}
      </Text>
    </View>
  );
}

// TextInput ignores lineHeight well on Android only when height is fixed, so drop it here.
const inputText = StyleSheet.create({
  default: { ...typography.body, lineHeight: undefined, color: colors.text },
  mono: { ...typography.mono, lineHeight: undefined, color: colors.text },
  pin: { ...typography.pin, lineHeight: undefined, color: colors.text },
});

const styles = StyleSheet.create({
  field: { gap: spacing.fieldLabelGap, alignSelf: 'stretch' },
  input: {
    height: sizes.input,
    borderRadius: radii.input,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  disabled: { opacity: 0.6 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { flexShrink: 1 },
});
