import 'i18next';

import type enCommon from '~/locales/en/common.json';
import type enData from '~/locales/en/data.json';

// English is the source of truth for keys, so `t('...')` is checked against it.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof enCommon;
      data: typeof enData;
    };
  }
}
