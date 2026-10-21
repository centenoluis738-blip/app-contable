import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { fmt, request } from '../api';
import { Card, ErrorText, s } from '../ui';

interface Invoice { id: string; series: string; number: number | null; contactName: string; issueDate: string; total: string; balance: string; status: string; overdue: boolean }
const STATUS: Record<string, string> = { draft: 'Borrador', issued: 'Emitida', partial: 'Cobro parcial', paid: 'Cobrada', void: 'Anulada' };

export function InvoicesScreen({ currency }: { currency: string }) {
  const [items, setItems] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setItems(await request<Invoice[]>('GET', '/invoices?limit=100'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={items}
      keyExtractor={(i) => i.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListHeaderComponent={<><Text style={s.title}>Facturas</Text><ErrorText error={error} /></>}
      ListEmptyComponent={!refreshing ? <Text style={s.muted}>Aún no hay facturas.</Text> : null}
      renderItem={({ item }) => (
        <Card>
          <View style={s.row}>
            <Text style={{ fontWeight: '600' }}>{item.number ? `${item.series}-${item.number}` : 'Borrador'}</Text>
            <Text style={{ fontWeight: '600' }}>{fmt(item.total, currency)}</Text>
          </View>
          <View style={[s.row, { marginTop: 4 }]}>
            <Text style={s.muted}>{item.contactName} · {item.issueDate}</Text>
            <Text style={{ color: item.overdue ? '#c4320a' : '#667085' }}>{item.overdue ? 'Vencida' : STATUS[item.status]}</Text>
          </View>
        </Card>
      )}
    />
  );
}
