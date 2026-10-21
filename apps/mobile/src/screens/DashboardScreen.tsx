import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { fmt, request } from '../api';
import { Card, ErrorText, Loading, s } from '../ui';

interface Dashboard { income: string; expenses: string; result: string; cash: string; receivable: string; payable: string; overdueInvoices: number }

export function DashboardScreen({ currency }: { currency: string }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await request<Dashboard>('GET', '/reports/dashboard'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return error ? <ErrorText error={error} /> : <Loading />;
  const kpis: [string, string][] = [
    ['Ingresos del mes', data.income], ['Gastos del mes', data.expenses], ['Resultado del mes', data.result],
    ['Caja y bancos', data.cash], ['Por cobrar', data.receivable], ['Por pagar', data.payable],
  ];
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <Text style={s.title}>Resumen</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {kpis.map(([label, value]) => (
          <View key={label} style={{ width: '47%' }}>
            <Card>
              <Text style={s.kpiLabel}>{label}</Text>
              <Text style={s.kpiValue}>{fmt(value, currency)}</Text>
            </Card>
          </View>
        ))}
      </View>
      {data.overdueInvoices > 0 && (
        <Card><Text style={{ color: '#b54708' }}>Tienes {data.overdueInvoices} factura(s) vencida(s) por cobrar.</Text></Card>
      )}
    </ScrollView>
  );
}
