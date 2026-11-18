import { pgEnum } from 'drizzle-orm/pg-core';

import {
  CONTRIBUTOR_ROLE_VALUES,
  LANG_VALUES,
  NOTIFICATION_VALUES,
  REVIEW_VERDICT_VALUES,
  ROLE_VALUES,
  SUGGESTION_ACTION_VALUES,
  SUGGESTION_STATUS_VALUES,
  SUGGESTION_TARGET_VALUES,
} from '~/utils/constants';

// Drizzle definitions for the Postgres types
export const langEnum = pgEnum('lang', LANG_VALUES);
export const roleEnum = pgEnum('roles', ROLE_VALUES);
export const notificationEnum = pgEnum('notification_type', NOTIFICATION_VALUES);
export const contributorRoleEnum = pgEnum('contributor_role', CONTRIBUTOR_ROLE_VALUES);
export const suggestionTargetEnum = pgEnum('suggestion_target', SUGGESTION_TARGET_VALUES);
export const suggestionActionEnum = pgEnum('suggestion_action', SUGGESTION_ACTION_VALUES);
export const suggestionStatusEnum = pgEnum('suggestion_status', SUGGESTION_STATUS_VALUES);
export const reviewVerdictEnum = pgEnum('review_verdict', REVIEW_VERDICT_VALUES);
