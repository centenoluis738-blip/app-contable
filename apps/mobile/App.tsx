import { useEffect, useState } from 'react';
import { Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { HELP_URL, loadSession, request, setSession } from './src/api';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { InvoicesScreen } from './src/screens/InvoicesScreen';
import { ExpenseScreen } from './src/screens/ExpenseScreen';
import { Loading, colors } from './src/ui';

type Tab = 'inicio' | 'facturas' | 'gasto';
const TABS: [Tab, string][] = [['inicio', 'Inicio'], ['facturas', 'Facturas'], ['gasto', '+ Gasto']];

export default function App() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
  const [currency, setCurrency] = useState('NIO');
  const [tab, setTab] = useState<Tab>('inicio');

  useEffect(() => {
    void (async () => {
      const { token } = await loadSession();
      if (!token) return setState('out');
      try {
        const me = await request<{ companies: { id: string; currency: string }[] }>('GET', '/auth/me');
        setCurrency(me.companies[0]?.currency ?? 'NIO');
        setState('in');
      } catch {
        await setSession(null, null);
        setState('out');
      }
    })();
  }, []);

  if (state === 'loading') return <Loading />;
  if (state === 'out') return <LoginScreen onLogin={(c) => { setCurrency(c); setState('in'); }} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.brand}>App Contable</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable onPress={() => Linking.openURL(HELP_URL)}><Text style={styles.link}>Ayuda</Text></Pressable>
          <Pressable onPress={async () => { await setSession(null, null); setState('out'); }}><Text style={styles.link}>Salir</Text></Pressable>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'inicio' && <DashboardScreen currency={currency} />}
        {tab === 'facturas' && <InvoicesScreen currency={currency} />}
        {tab === 'gasto' && <ExpenseScreen />}
      </View>
      <View style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
            <Text style={[styles.tabText, tab === key && { color: colors.primary, fontWeight: '700' }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: colors.border },
  brand: { fontWeight: '700', fontSize: 17, color: colors.text },
  link: { color: colors.primary },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabText: { color: colors.muted, fontSize: 15 },
});
