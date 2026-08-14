import { Image, type ImageSourcePropType } from 'react-native';

export type IllustrationName =
  | 'attendance-calendar'
  | 'completed-checklist'
  | 'invoice'
  | 'offline'
  | 'profile-user';

const sources: Record<IllustrationName, ImageSourcePropType> = {
  'attendance-calendar': require('../../../assets/illustrations/attendance-calendar.png'),
  'completed-checklist': require('../../../assets/illustrations/completed-checklist.png'),
  invoice: require('../../../assets/illustrations/invoice.png'),
  offline: require('../../../assets/illustrations/offline.png'),
  'profile-user': require('../../../assets/illustrations/profile-user.png'),
};

interface Props {
  name: IllustrationName;
  size?: number;
  accessibilityLabel?: string;
}

/** Locally bundled decorative artwork with one consistent sizing API. */
export const Illustration = ({ name, size = 132, accessibilityLabel }: Props) => (
  <Image
    source={sources[name]}
    resizeMode="contain"
    accessible={Boolean(accessibilityLabel)}
    accessibilityLabel={accessibilityLabel}
    style={{ width: size, height: size }}
  />
);
