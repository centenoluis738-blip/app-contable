import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { request } from '../api';
import { Button, Card, ErrorText, Input, colors, s } from '../ui';

const TAX_OPTIONS = [['IVA15', 'IVA 15 %'], ['EXENTO', 'Exento'], ['IVA0', 'Tasa cero']] as const;

interface Account { id: string; name: string; type: string; parentId: string | null; isActive: boolean }

/** Registro rápido de un gasto con foto del ticket (la captura funciona sin conexión en la fase 2). */
export function ExpenseScreen() {
  const [categories, setCategories] = useState<Account[]>([]);
  const [form, setForm] = useState({ description: '', amount: '', taxCode: 'IVA15', deductible: true, accountId: '', paid: true });
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void request<Account[]>('GET', '/accounts')
      .then((a) => setCategories(a.filter((x) => x.type === 'expense' && x.parentId && x.isActive)))
      .catch((e: Error) => setError(e.message));
  }, []);

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError('Necesitamos permiso para usar la cámara');
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled) setPhoto(res.assets[0]);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const exp = await request<{ id: string }>('POST', '/expenses', {
        ...form, currency: 'NIO', taxIncluded: true, paymentMethod: 'card',
      });
      if (photo) {
        const fd = new FormData();
        // React Native acepta este objeto como archivo en FormData
        fd.append('file', { uri: photo.uri, name: photo.fileName ?? 'ticket.jpg', type: photo.mimeType ?? 'image/jpeg' } as unknown as Blob);
        await request('POST', `/expenses/${exp.id}/receipt`, fd);
      }
      setDone(true);
      setForm({ description: '', amount: '', taxCode: form.taxCode, deductible: true, accountId: '', paid: true });
      setPhoto(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Nuevo gasto</Text>
      {done && <Card><Text style={{ color: colors.ok }}>Gasto guardado.</Text></Card>}
      <Input label="Descripción" value={form.description} onChangeText={(description) => { setDone(false); setForm({ ...form, description }); }} placeholder="Ej. Comida con cliente" />
      <Input label="Total del ticket en C$ (con IVA)" keyboardType="decimal-pad" value={form.amount} onChangeText={(amount) => setForm({ ...form, amount })} />
      <Text style={s.label}>IVA del ticket</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TAX_OPTIONS.map(([code, label]) => (
          <Pressable
            key={code}
            onPress={() => setForm({ ...form, taxCode: code })}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: form.taxCode === code ? colors.primary : colors.border, backgroundColor: form.taxCode === code ? '#e8efff' : '#fff' }}
          >
            <Text>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.label}>Categoría</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setForm({ ...form, accountId: c.id })}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: form.accountId === c.id ? colors.primary : colors.border, backgroundColor: form.accountId === c.id ? '#e8efff' : '#fff' }}
          >
            <Text>{c.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[s.row, { marginVertical: 8 }]}>
        <Text>Gasto deducible (con factura a nombre del negocio)</Text>
        <Switch value={form.deductible} onValueChange={(deductible) => setForm({ ...form, deductible })} />
      </View>
      <View style={[s.row, { marginVertical: 8 }]}>
        <Text>Ya está pagado</Text>
        <Switch value={form.paid} onValueChange={(paid) => setForm({ ...form, paid })} />
      </View>
      {photo && <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 220, borderRadius: 12 }} resizeMode="cover" />}
      <Button title={photo ? 'Repetir foto' : 'Fotografiar ticket'} variant="secondary" onPress={takePhoto} />
      <ErrorText error={error} />
      <Button title={busy ? 'Guardando…' : 'Guardar gasto'} onPress={save} disabled={busy || !form.accountId || !form.amount || !form.description} />
    </ScrollView>
  );
}
