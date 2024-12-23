import type { AnyAbility } from '@casl/ability';

import { createContextualCan } from '@casl/react';
import { createContext } from 'react';

// eslint-disable-next-line
// @ts-ignore
export const AbilityContext = createContext<AnyAbility>(null);
export const Can = createContextualCan(AbilityContext.Consumer);
