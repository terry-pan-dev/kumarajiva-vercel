import { pgEnum } from 'drizzle-orm/pg-core';

export const langEnum = pgEnum('lang', ['english', 'chinese', 'sanskrit', 'indonesian']);

export const roleEnum = pgEnum('roles', ['admin', 'leader', 'editor', 'reader', 'assistant', 'manager']);

export type UserRole = 'admin' | 'leader' | 'editor' | 'reader' | 'assistant' | 'manager';
export type Lang = 'english' | 'chinese' | 'sanskrit' | 'indonesian';
