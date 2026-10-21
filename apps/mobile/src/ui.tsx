import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

export const colors = { primary: '#2f6fed', text: '#1d2433', muted: '#667085', border: '#e3e6eb', bg: '#f6f7f9', danger: '#c4320a', ok: '#067647' };

export function Button({ title, onPress, variant = 'primary', disabled }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary'; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, variant === 'primary' ? s.btnPrimary : s.btnSecondary, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={[s.btnText, variant === 'primary' && { color: '#fff' }]}>{title}</Text>
    </Pressable>
  );
}

export function Input({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={s.input} {...props} />
    </View>
  );
}

export const Card = ({ children }: { children: ReactNode }) => <View style={s.card}>{children}</View>;
export const ErrorText = ({ error }: { error: string | null }) => (error ? <Text style={s.error}>{error}</Text> : null);
export const Loading = () => <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 8 },
  muted: { color: colors.muted },
  label: { color: colors.muted, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fff', color: colors.text },
  btn: { padding: 14, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  btnText: { fontSize: 16, fontWeight: '600', color: colors.text },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
  error: { color: colors.danger, marginVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kpiLabel: { color: colors.muted, fontSize: 13 },
  kpiValue: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 4 },
});
