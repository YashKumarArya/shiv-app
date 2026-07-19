import {
  type ComponentProps,
  useState,
} from 'react';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import {
  ActivityIndicator,
  Image,
  Platform,
  type StyleProp,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  api,
  errorMessage,
  fileUrl,
} from '@/api/client';
import {
  type Assignment,
  type Employee,
  employeeInitials,
  employeeName,
} from '@/api/types';
import { Button } from '@/components/ui/Button';
import { depth } from '@/components/ui/depth';
import { Screen } from '@/components/ui/Screen';
import {
  useItem,
  useList,
} from '@/hooks/useCrud';
import { useSettings } from '@/hooks/useSettings';
import { formatDate, today } from '@/lib/format';
import {
  A4_HEIGHT_POINTS,
  A4_WIDTH_POINTS,
  buildA4IdCardSheetHtml,
  embedIdCardImages,
} from '@/lib/idCardPrint';
import { notify } from '@/lib/notify';
import { Ionicons } from '@expo/vector-icons';

// Hardcoded pixel size — deliberately NOT derived from screen width (no `w-full`,
// no percentages). A phone and a tablet must lay out this view with the exact same
// numbers, or the exported file ends up a different size/crop depending on device.
// Height is sized to comfortably hold the fullest content (all fields + a 3-line
// address); the text is fixed-pixel, so the box must be tall enough for it.
const CARD_WIDTH = 360;
const CARD_HEIGHT = 227;
// Card text should lay out consistently on every device, so CardText pins down
// the platform-dependent text properties we can control:
//   - allowFontScaling={false}: ignore the OS "Font size / Display size" setting
//     (tablets often default larger, which overflowed the fixed box).
//   - A bundled font (Inter) instead of the system font: iOS (San Francisco) and
//     Android (Roboto) have different glyph widths, so text measured/centered
//     differently per platform — the header group visibly shifted sideways.
//   - Explicit fontSize + lineHeight and includeFontPadding: false: Android pads
//     text vertically by default; iOS doesn't.
//   - No adjustsFontSizeToFit anywhere: iOS and Android implement auto-shrink
//     differently (Android far more aggressively on multiline), which is why the
//     address came out tiny on the tablet but fine on the iPhone. Fixed sizes only.
const interFamilies = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  extrabold: 'Inter_800ExtraBold',
} as const;

interface CardTextProps extends ComponentProps<typeof Text> {
  size: number;
  weight?: keyof typeof interFamilies;
  lineHeight?: number;
}

const CardText = ({ size, weight = 'regular', lineHeight, style, ...props }: CardTextProps) => (
  <Text
    {...props}
    allowFontScaling={false}
    style={[
      {
        fontFamily: interFamilies[weight],
        fontSize: size,
        lineHeight: lineHeight ?? Math.round(size * 1.35),
        includeFontPadding: false,
      },
      style,
    ]}
  />
);

interface IdRowProps {
  label: string;
  value?: string | null;
  bold?: boolean;
  /** The employee's name — the one field that should read as the card's headline. */
  large?: boolean;
  numberOfLines?: number;
  /** Top-align the label instead of centering it, for a row that may wrap to several lines. */
  multiline?: boolean;
  valueStyle?: StyleProp<TextStyle>;
}

const IdRow = ({ label, value, bold, large, numberOfLines, multiline, valueStyle }: IdRowProps) => {
  if (!value) return null;
  return (
    <View className={`flex-row ${multiline ? 'items-start' : 'items-center'} ${large ? 'mb-0.5' : ''}`}>
      <CardText size={8} lineHeight={12} weight="semibold" className="w-[70px] uppercase tracking-wide text-slate-400">
        {label}
      </CardText>
      <CardText
        size={large ? 15 : 10}
        lineHeight={large ? 20 : 13}
        weight={bold ? 'extrabold' : 'medium'}
        numberOfLines={numberOfLines}
        style={valueStyle}
        className={`flex-1 ${bold ? 'text-slate-900' : 'text-slate-800'}`}
      >
        {value}
      </CardText>
    </View>
  );
};

export default function EmployeeIdCard() {
  const { employee_id: employeeId } = useLocalSearchParams<{ employee_id: string }>();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [pdfAction, setPdfAction] = useState<'print' | 'share' | null>(null);
  // Wait for the bundled card font before rendering — capturing with the fallback
  // system font would reintroduce the per-device layout differences.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_800ExtraBold,
  });

  const { data: employee, error, isError, isLoading, refetch } = useItem<Employee>('employees', employeeId);
  const { data: assignments } = useList<Assignment>('assignments', {
    employee_id: employeeId,
    limit: 200,
  });
  const { data: settings } = useSettings();

  if (isError) return <Screen error={errorMessage(error)} onRetry={() => void refetch()} />;
  if (isLoading || !employee || !fontsLoaded) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#2457d6" />
      </Screen>
    );
  }

  const companyName = settings?.company_name || 'Company name not set';
  const companyAddress = settings?.company_address;
  const companyPhone = settings?.company_phone;
  const logo = settings?.company_logo;
  const signature = settings?.company_signature;
  const currentDate = today();
  const siteName = assignments?.find(
    (assignment) => assignment.start_date.slice(0, 10) <= currentDate
      && (!assignment.end_date || assignment.end_date.slice(0, 10) >= currentDate),
  )?.site_name;
  // Screen adds 16pt padding on each side. Scale the complete card uniformly when
  // that leaves less room than the fixed design canvas. This affects only preview;
  // PDF export is generated independently at the exact CR80 physical dimensions.
  const previewScale = Math.min(1, (screenWidth - 32) / CARD_WIDTH);

  const handlePdf = async (action: 'print' | 'share') => {
    if (Platform.OS === 'web') {
      notify('Not available on web', 'Open this screen on a phone to print, save or share the ID card.');
      return;
    }
    setPdfAction(action);
    try {
      // The PDF renderer cannot attach the app's Authorization header. Refresh
      // immediately before printing so its embedded image URLs retain their
      // full short-lived validity window, even if this screen stayed open.
      const [{ data: printableEmployee }, { data: printableSettings }] = await Promise.all([
        api.get<Employee>(`/employees/${employee.id}`),
        api.get<Record<string, string>>('/settings'),
      ]);
      const cards = await embedIdCardImages([{
        employee: printableEmployee,
        companyName: printableSettings.company_name || companyName,
        companyAddress: printableSettings.company_address,
        companyPhone: printableSettings.company_phone,
        logo: printableSettings.company_logo,
        signature: printableSettings.company_signature,
        siteName,
      }]);
      const { uri } = await Print.printToFileAsync({
        width: A4_WIDTH_POINTS,
        height: A4_HEIGHT_POINTS,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        html: buildA4IdCardSheetHtml(cards),
      });
      if (action === 'print') {
        await Print.printAsync({ uri });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${employeeName(employee)} — ID Card`,
        });
      } else {
        notify('Sharing unavailable', 'This device cannot share files.');
      }
    } catch (pdfError) {
      notify(action === 'print' ? 'Couldn’t print ID card' : 'Couldn’t export ID card', errorMessage(pdfError));
    } finally {
      setPdfAction(null);
    }
  };

  return (
    <Screen scroll className="items-center pt-5">
      {/* Fixed design size (see CARD_WIDTH/CARD_HEIGHT), like a printable ID card.
          CardText also removes the main font-layout differences between platforms. */}
      <View
        style={{
          width: CARD_WIDTH * previewScale,
          height: CARD_HEIGHT * previewScale,
          alignSelf: 'center',
        }}
      >
        <View
          style={[
            depth.raised,
            {
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              transform: [{ scale: previewScale }],
              transformOrigin: 'top left',
            },
          ]}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3"
        >
        {logo ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}
          >
            <Image
              source={{ uri: fileUrl(logo) }}
              resizeMode="contain"
              style={{ width: '60%', height: '80%', opacity: 0.07 }}
            />
          </View>
        ) : null}

        <View className="flex-row items-center justify-center">
          {logo ? (
            <Image source={{ uri: fileUrl(logo) }} resizeMode="contain" className="h-11 w-11 rounded-lg" />
          ) : (
            <View className="h-11 w-11 items-center justify-center rounded-lg bg-brand-50">
              <Ionicons name="shield-checkmark-outline" size={20} color="#2457d6" />
            </View>
          )}
          <View className="ml-2 max-w-[70%] items-center">
            <CardText size={15} weight="extrabold" numberOfLines={1} className="text-slate-900">
              {companyName}
            </CardText>
            {companyAddress ? (
              <CardText size={8.5} lineHeight={11} numberOfLines={2} className="text-center text-slate-500">
                {companyAddress}
              </CardText>
            ) : null}
            {companyPhone ? (
              <CardText size={9.5} numberOfLines={1} className="text-slate-500">
                Ph: {companyPhone}
              </CardText>
            ) : null}
          </View>
        </View>

        <View className="mt-2 flex-row items-start">
          <View className="flex-1 pr-2">
            <IdRow label="Name" value={employeeName(employee).toUpperCase()} bold large numberOfLines={1} />
            <IdRow label="Rank" value={employee.designation_name} numberOfLines={1} />
            <IdRow label="ID" value={employee.employee_code} numberOfLines={1} />
            <IdRow label="Blood Grp" value={employee.blood_group} numberOfLines={1} />
            <IdRow
              label="D.O.B"
              value={employee.date_of_birth ? formatDate(employee.date_of_birth) : undefined}
              numberOfLines={1}
            />
            <IdRow label="Site" value={siteName} numberOfLines={1} />
          </View>

          <View
            style={{ width: 64, height: 74 }}
            className={`items-center justify-center overflow-hidden rounded-md ${employee.photo ? '' : 'border border-slate-300 bg-slate-50'}`}
          >
            {employee.photo ? (
              <Image
                source={{ uri: fileUrl(employee.photo) }}
                resizeMode="cover"
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
              />
            ) : (
              <View className="h-full w-full items-center justify-center bg-slate-100">
                <CardText size={18} weight="semibold" className="text-slate-400">
                  {employeeInitials(employee) || 'ID'}
                </CardText>
              </View>
            )}
          </View>
        </View>

        {/* Keep the address out of the photo/signature columns. Previously the
            signature padding left only ~96pt for it, so even ordinary addresses
            were truncated after two very short lines. */}
        <IdRow
          label="Address"
          value={employee.address}
          numberOfLines={3}
          multiline
          valueStyle={{ fontSize: 9, lineHeight: 12, paddingRight: signature ? 84 : 0 }}
        />

        {signature ? (
          <View
            style={{ position: 'absolute', right: 0, bottom: 10, width: 96, alignItems: 'center' }}
          >
            <Image source={{ uri: fileUrl(signature) }} resizeMode="contain" style={{ width: 84, height: 30 }} />
            <View style={{ width: 84, height: 1, backgroundColor: '#94a3b8' }} />
            <CardText
              size={7.5}
              lineHeight={10}
              weight="semibold"
              numberOfLines={1}
              style={{ width: 96, marginTop: 2, letterSpacing: 0.15, textAlign: 'center', color: '#64748b' }}
            >
              Authorized Signatory
            </CardText>
          </View>
        ) : null}
        </View>
      </View>

      <View className="mt-6 w-full max-w-[440px]">
        <Button
          title="Print now"
          icon="print-outline"
          onPress={() => void handlePdf('print')}
          loading={pdfAction === 'print'}
          disabled={pdfAction !== null}
        />
        <View className="mt-3">
          <Button
            title="Save / share A4 PDF"
            icon="share-social-outline"
            variant="secondary"
            onPress={() => void handlePdf('share')}
            loading={pdfAction === 'share'}
            disabled={pdfAction !== null}
          />
        </View>
        <View className="mt-3">
          <Button
            title="Export multiple ID cards"
            icon="albums-outline"
            variant="secondary"
            onPress={() => router.push('/employees/id-card-sheet')}
          />
        </View>
        <Text className="mt-3 px-2 text-center text-xs leading-5 text-slate-500">
          Cards export at the real CR80 size: 85.60 × 53.98 mm. When printing, choose A4 and Actual size or 100%.
        </Text>
      </View>

      {!logo || !settings?.company_name ? (
        <Text className="mt-3 max-w-[440px] px-2 text-center text-xs text-slate-400">
          Add your company name and logo from Settings → Company & ID card to complete this card.
        </Text>
      ) : null}
    </Screen>
  );
}
