import './Icon.css';

import alignLeft from '@public/icons/align-left.svg?url';
import alignRight from '@public/icons/align-right.svg?url';
import angleDoubleDown from '@public/icons/angle-double-down.svg?url';
import angleDoubleUp from '@public/icons/angle-double-up.svg?url';
import angleDown from '@public/icons/angle-down.svg?url';
import angleLeft from '@public/icons/angle-left.svg?url';
import angleRight from '@public/icons/angle-right.svg?url';
import angleUp from '@public/icons/angle-up.svg?url';
import check from '@public/icons/check.svg?url';
import copy from '@public/icons/copy.svg?url';
import exclamationCircle from '@public/icons/exclamation-circle.svg?url';
import eye from '@public/icons/eye.svg?url';
import historyAlt from '@public/icons/history-alt.svg?url';
import logo from '@public/icons/logo.svg?url';
import moon from '@public/icons/moon.svg?url';
import play from '@public/icons/play.svg?url';
import plus from '@public/icons/plus.svg?url';
import refresh from '@public/icons/refresh.svg?url';
import sandwich from '@public/icons/sandwich.svg?url';
import search from '@public/icons/search.svg?url';
import sun from '@public/icons/sun.svg?url';
import times from '@public/icons/times.svg?url';

export type IconType =
  | 'align-left'
  | 'align-right'
  | 'angle-double-down'
  | 'angle-double-up'
  | 'angle-down'
  | 'angle-left'
  | 'angle-right'
  | 'angle-up'
  | 'check'
  | 'copy'
  | 'exclamation-circle'
  | 'eye'
  | 'history-alt'
  | 'logo'
  | 'moon'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'sandwich'
  | 'search'
  | 'sun'
  | 'times';

const iconUrls: Record<IconType, string> = {
  'align-left': alignLeft,
  'align-right': alignRight,
  'angle-double-down': angleDoubleDown,
  'angle-double-up': angleDoubleUp,
  'angle-down': angleDown,
  'angle-left': angleLeft,
  'angle-right': angleRight,
  'angle-up': angleUp,
  check,
  copy,
  'exclamation-circle': exclamationCircle,
  eye,
  'history-alt': historyAlt,
  logo,
  moon,
  play,
  plus,
  refresh,
  sandwich,
  search,
  sun,
  times,
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconType;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={className ? `icon ${className}` : 'icon'}
      style={{
        width: size,
        height: size,
        maskImage: `url("${iconUrls[name]}")`,
        WebkitMaskImage: `url("${iconUrls[name]}")`,
      }}
    />
  );
}
