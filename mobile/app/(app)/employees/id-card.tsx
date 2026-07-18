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
import { useLocalSearchParams } from 'expo-router';
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
import { formatDate, today } from '@/lib/format';
import { notify } from '@/lib/notify';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

// Hardcoded pixel size — deliberately NOT derived from screen width (no `w-full`,
// no percentages). A phone and a tablet must lay out this view with the exact same
// numbers, or the exported file ends up a different size/crop depending on device.
// Height is sized to comfortably hold the fullest content (all fields + a 3-line
// address); the text is fixed-pixel, so the box must be tall enough for it.
const CARD_WIDTH = 360;
const CARD_HEIGHT = 227;
// A fixed output size is the important part of the export contract. Native view
// dimensions are density-independent points; without these values the PNG uses
// each device's physical pixel density and therefore differs between devices.
const PRINT_PAGE_WIDTH_MM = 91.6; // 85.6mm card + 3mm cutting margin on each side.
const PRINT_PAGE_WIDTH_POINTS = (PRINT_PAGE_WIDTH_MM / 25.4) * 72;
const PRINT_PAGE_HEIGHT_MM = 59.98; // 53.98mm card + 3mm cutting margin above and below.
const PRINT_PAGE_HEIGHT_POINTS = (PRINT_PAGE_HEIGHT_MM / 25.4) * 72;

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

const escapeHtml = (value?: string | null) => (value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

interface CardHtmlData {
  employee: Employee;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  logo?: string;
  signature?: string;
  siteName?: string;
}

const buildCardHtml = ({ employee, companyName, companyAddress, companyPhone, logo, signature, siteName }: CardHtmlData) => {
  const row = (label: string, value?: string | null, className = '') => value
    ? `<div class="row ${className}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`
    : '';
  const logoUrl = fileUrl(logo);
  const photoUrl = fileUrl(employee.photo);
  const signatureUrl = fileUrl(signature);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:91.6mm 59.98mm;margin:0}*{box-sizing:border-box}html,body{width:91.6mm;height:59.98mm;margin:0;overflow:hidden}body{position:relative;font-family:Arial,sans-serif;color:#1e293b;background:#fff}
.card{position:absolute;left:3mm;top:3mm;width:85.6mm;height:53.98mm;padding:3mm;background:#fff;overflow:hidden;border:.3mm solid #cbd5e1;border-radius:3mm;break-inside:avoid;page-break-inside:avoid}.watermark{position:absolute;inset:7mm 18mm;width:49.6mm;height:39.98mm;object-fit:contain;opacity:.07}
.header{position:relative;display:flex;align-items:center;justify-content:center;min-height:11mm}.logo,.logo-fallback{width:10mm;height:10mm;border-radius:1.5mm}.logo{object-fit:contain}.logo-fallback{display:flex;align-items:center;justify-content:center;background:#eef4ff;color:#2457d6;font-size:4mm;font-weight:700}
.company{max-width:58mm;margin-left:2mm;text-align:center}.company h1{margin:0;font-size:3.5mm;line-height:4mm;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.company p{margin:.2mm 0 0;color:#64748b;font-size:2mm;line-height:2.5mm}
.body{position:relative;display:flex;margin-top:1.5mm}.details{flex:1;padding-right:2mm}.row{display:flex;align-items:flex-start;line-height:3.1mm}.row span{width:17mm;flex:none;color:#94a3b8;font-size:1.8mm;font-weight:700;letter-spacing:.12mm;text-transform:uppercase}.row b{flex:1;font-size:2.35mm;font-weight:600}.row.name{margin-bottom:.5mm;line-height:4.5mm}.row.name b{font-size:3.6mm;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.photo,.photo-fallback{width:15.2mm;height:17.6mm;border-radius:1mm}.photo{display:block;object-fit:cover}.photo-fallback{display:flex;align-items:center;justify-content:center;border:.25mm solid #cbd5e1;background:#f1f5f9;color:#94a3b8;font-size:4mm;font-weight:700}.address{margin-top:.5mm;padding-right:${signature ? '22mm' : '0'}}.address b{font-size:2mm;line-height:2.7mm}
.signature{position:absolute;right:1.5mm;bottom:2mm;width:22mm;text-align:center}.signature img{display:block;width:20mm;height:7mm;margin:auto;object-fit:contain}.signature .line{width:20mm;border-top:.2mm solid #94a3b8;margin:auto}.signature small{display:block;margin-top:.4mm;color:#64748b;font-size:1.55mm;line-height:2mm;font-weight:700;white-space:nowrap}
</style></head><body><div class="card">${logoUrl ? `<img class="watermark" src="${escapeHtml(logoUrl)}">` : ''}
<div class="header">${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}">` : '<div class="logo-fallback">ID</div>'}<div class="company"><h1>${escapeHtml(companyName)}</h1>${companyAddress ? `<p>${escapeHtml(companyAddress)}</p>` : ''}${companyPhone ? `<p>Ph: ${escapeHtml(companyPhone)}</p>` : ''}</div></div>
<div class="body"><div class="details">${row('Name', employeeName(employee).toUpperCase(), 'name')}${row('Rank', employee.designation_name)}${row('ID', employee.employee_code)}${row('Blood Grp', employee.blood_group)}${row('D.O.B', employee.date_of_birth ? formatDate(employee.date_of_birth) : undefined)}${row('Site', siteName)}</div>${photoUrl ? `<img class="photo" src="${escapeHtml(photoUrl)}">` : `<div class="photo-fallback">${escapeHtml(employeeInitials(employee) || 'ID')}</div>`}</div>
<div class="address">${row('Address', employee.address)}</div>${signatureUrl ? `<div class="signature"><img src="${escapeHtml(signatureUrl)}"><div class="line"></div><small>Authorized Signatory</small></div>` : ''}</div></body></html>`;
};

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
  const { width: screenWidth } = useWindowDimensions();
  const [sharing, setSharing] = useState(false);
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
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
  });

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

  const shareCard = async () => {
    if (Platform.OS === 'web') {
      notify('Not available on web', 'Open this screen on a phone to save or share the ID card.');
      return;
    }
    setSharing(true);
    try {
      // The PDF renderer cannot attach the app's Authorization header. Refresh
      // immediately before printing so its embedded image URLs retain their
      // full short-lived validity window, even if this screen stayed open.
      const [{ data: printableEmployee }, { data: printableSettings }] = await Promise.all([
        api.get<Employee>(`/employees/${employee.id}`),
        api.get<Record<string, string>>('/settings'),
      ]);
      const { uri } = await Print.printToFileAsync({
        width: PRINT_PAGE_WIDTH_POINTS,
        height: PRINT_PAGE_HEIGHT_POINTS,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        html: buildCardHtml({
          employee: printableEmployee,
          companyName: printableSettings.company_name || companyName,
          companyAddress: printableSettings.company_address,
          companyPhone: printableSettings.company_phone,
          logo: printableSettings.company_logo,
          signature: printableSettings.company_signature,
          siteName,
        }),
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${employeeName(employee)} — ID Card`,
        });
      } else {
        notify('Sharing unavailable', 'This device cannot share files.');
      }
    } catch (shareError) {
      notify('Couldn’t export ID card', errorMessage(shareError));
    } finally {
      setSharing(false);
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
        <Button title="Share / Save Print-ready PDF" icon="share-social-outline" onPress={shareCard} loading={sharing} />
      </View>

      {!logo || !settings?.company_name ? (
        <Text className="mt-3 max-w-[440px] px-2 text-center text-xs text-slate-400">
          Add your company name and logo from Settings → Company & ID card to complete this card.
        </Text>
      ) : null}
    </Screen>
  );
}
