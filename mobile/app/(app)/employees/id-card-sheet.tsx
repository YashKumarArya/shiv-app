import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { api, errorMessage, fileUrl } from '@/api/client';
import { employeeInitials, employeeName, type Assignment, type Employee } from '@/api/types';
import { SearchBar } from '@/components/ui/SearchBar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useList } from '@/hooks/useCrud';
import {
  A4_HEIGHT_POINTS,
  A4_WIDTH_POINTS,
  buildA4IdCardSheetHtml,
  embedIdCardImages,
  ID_CARDS_PER_A4_PAGE,
} from '@/lib/idCardPrint';
import { today } from '@/lib/format';
import { notify } from '@/lib/notify';

export default function IdCardSheet() {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [pdfAction, setPdfAction] = useState<'print' | 'share' | null>(null);
  const employeesQuery = useList<Employee>('employees', { status: 'Active', limit: 200 });
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
  });

  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return employeesQuery.data ?? [];
    return (employeesQuery.data ?? []).filter((employee) =>
      [employeeName(employee), employee.employee_code, employee.designation_name]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(term)),
    );
  }, [employeesQuery.data, search]);

  const toggleEmployee = (employeeId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allVisibleSelected = visibleEmployees.length > 0
        && visibleEmployees.every((employee) => next.has(employee.id));
      visibleEmployees.forEach((employee) => {
        if (allVisibleSelected) next.delete(employee.id);
        else next.add(employee.id);
      });
      return next;
    });
  };

  const handlePdf = async (action: 'print' | 'share') => {
    if (!selectedIds.size) return;
    if (Platform.OS === 'web') {
      notify('Not available on web', 'Open this screen on a phone to print, save or share the ID card sheet.');
      return;
    }

    setPdfAction(action);
    try {
      // Refresh immediately so every protected image URL is valid while the PDF
      // renderer downloads the employee photos, company logo, and signature.
      const [{ data: freshEmployees }, { data: freshAssignments }, { data: freshSettings }] = await Promise.all([
        api.get<Employee[]>('/employees', { params: { status: 'Active', limit: 200 } }),
        api.get<Assignment[]>('/assignments', { params: { status: 'Active', limit: 200 } }),
        api.get<Record<string, string>>('/settings'),
      ]);
      const currentDate = today();
      const selectedEmployees = freshEmployees.filter((employee) => selectedIds.has(employee.id));
      if (!selectedEmployees.length) throw new Error('The selected employees are no longer available');

      const cards = selectedEmployees.map((employee) => ({
        employee,
        companyName: freshSettings.company_name || settings?.company_name || 'Company name not set',
        companyAddress: freshSettings.company_address,
        companyPhone: freshSettings.company_phone,
        logo: freshSettings.company_logo,
        signature: freshSettings.company_signature,
        siteName: freshAssignments.find((assignment) =>
          assignment.employee_id === employee.id
          && assignment.start_date.slice(0, 10) <= currentDate
          && (!assignment.end_date || assignment.end_date.slice(0, 10) >= currentDate),
        )?.site_name,
      }));
      const embeddedCards = await embedIdCardImages(cards);
      const { uri } = await Print.printToFileAsync({
        width: A4_WIDTH_POINTS,
        height: A4_HEIGHT_POINTS,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        html: buildA4IdCardSheetHtml(embeddedCards),
      });
      if (action === 'print') {
        await Print.printAsync({ uri });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${cards.length} Employee ID Cards — A4`,
        });
      } else {
        notify('Sharing unavailable', 'This device cannot share files.');
      }
    } catch (pdfError) {
      notify(action === 'print' ? 'Couldn’t print ID cards' : 'Couldn’t export ID cards', errorMessage(pdfError));
    } finally {
      setPdfAction(null);
    }
  };

  if (employeesQuery.isLoading) {
    return <Screen className="items-center justify-center"><ActivityIndicator color="#2457d6" /></Screen>;
  }
  if (employeesQuery.isError) {
    return <Screen error={errorMessage(employeesQuery.error)} onRetry={() => void employeesQuery.refetch()} />;
  }

  const selectedCount = selectedIds.size;
  const pageCount = Math.ceil(selectedCount / ID_CARDS_PER_A4_PAGE);
  const allVisibleSelected = visibleEmployees.length > 0
    && visibleEmployees.every((employee) => selectedIds.has(employee.id));

  return (
    <Screen
      footer={(
        <View>
          <Text className="mb-2 text-center text-xs font-semibold text-slate-500">
            {selectedCount
              ? `${selectedCount} ${selectedCount === 1 ? 'card' : 'cards'} selected · ${pageCount} A4 ${pageCount === 1 ? 'page' : 'pages'}`
              : 'Select one or more employees'}
          </Text>
          <Button
            title="Print now"
            icon="print-outline"
            onPress={() => void handlePdf('print')}
            loading={pdfAction === 'print'}
            disabled={!selectedCount || pdfAction !== null}
          />
          <View className="mt-2">
            <Button
              title="Save / share A4 PDF"
              icon="share-social-outline"
              variant="secondary"
              onPress={() => void handlePdf('share')}
              loading={pdfAction === 'share'}
              disabled={!selectedCount || pdfAction !== null}
            />
          </View>
        </View>
      )}
    >
      <View className="border-b border-slate-100 bg-white px-4 pb-3 pt-4">
        <Text className="text-sm leading-5 text-slate-600">
          Select active employees. Each A4 page holds 10 cards at the exact 85.60 × 53.98 mm size.
        </Text>
      </View>
      <SearchBar value={search} onChange={setSearch} placeholder="Search employee or code" />
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-xs font-semibold text-slate-500">
          {selectedCount} selected
        </Text>
        <Pressable
          onPress={toggleVisible}
          disabled={!visibleEmployees.length}
          accessibilityRole="button"
          accessibilityLabel={allVisibleSelected ? 'Clear visible employees' : 'Select all visible employees'}
          className="min-h-11 justify-center rounded-xl px-3 active:bg-brand-50"
        >
          <Text className="text-sm font-bold text-brand-600">
            {allVisibleSelected ? 'Clear visible' : 'Select all visible'}
          </Text>
        </Pressable>
      </View>
      <FlatList
        className="flex-1"
        data={visibleEmployees}
        keyExtractor={(employee) => String(employee.id)}
        contentContainerClassName="px-4 pb-8"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: employee }) => {
          const selected = selectedIds.has(employee.id);
          return (
            <Pressable
              onPress={() => toggleEmployee(employee.id)}
              accessibilityRole="checkbox"
              accessibilityLabel={`${employeeName(employee)}, ${employee.employee_code}`}
              accessibilityState={{ checked: selected }}
              className={`mb-2 min-h-[70px] flex-row items-center rounded-2xl border p-3 active:bg-brand-50 ${
                selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'
              }`}
            >
              {employee.photo ? (
                <Image source={{ uri: fileUrl(employee.photo) }} className="h-11 w-11 rounded-xl bg-slate-100" />
              ) : (
                <View className="h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                  <Text className="text-sm font-bold text-slate-600">{employeeInitials(employee) || 'ID'}</Text>
                </View>
              )}
              <View className="ml-3 flex-1">
                <Text className="font-bold text-slate-900" numberOfLines={1}>{employeeName(employee)}</Text>
                <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                  {employee.employee_code} · {employee.designation_name || 'No designation'}
                </Text>
              </View>
              <View className={`h-7 w-7 items-center justify-center rounded-full border-2 ${
                selected ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white'
              }`}>
                {selected ? <Ionicons name="checkmark" size={17} color="white" /> : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={(
          <View className="items-center px-6 py-12">
            <Ionicons name="search-outline" size={30} color="#94a3b8" />
            <Text className="mt-3 text-sm text-slate-500">
              {search ? 'No active employees match this search.' : 'No active employees available.'}
            </Text>
          </View>
        )}
      />
    </Screen>
  );
}
