import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { request, setSession } from '../api';
import { Button, ErrorText, Input, s } from '../ui';

export function LoginScreen({ onLogin }: { onLogin: (currency: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { token } = await request<{ token: string }>('POST', '/auth/login', { email, password });
      await setSession(token, null);
      const me = await request<{ companies: { id: string; currency: string }[] }>('GET', '/auth/me');
      if (!me.companies.length) throw new Error('Primero crea tu empresa en la versión web');
      await setSession(token, me.companies[0].id);
      onLogin(me.companies[0].currency);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.screen, { justifyContent: 'center' }]}>
      <View style={s.content}>
        <Text style={s.title}>App Contable</Text>
        <Text style={[s.muted, { marginBottom: 16 }]}>Inicia sesión con tu cuenta</Text>
        <Input label="Correo" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
        <Input label="Contraseña" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
        <ErrorText error={error} />
        <Button title={busy ? 'Entrando…' : 'Entrar'} onPress={submit} disabled={busy} />
      </View>
    </KeyboardAvoidingView>
  );
}
