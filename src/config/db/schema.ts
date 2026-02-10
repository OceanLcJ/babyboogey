/**
 * Provider-aware schema re-exports.
 *
 * Drizzle schemas are dialect-specific (pg/mysql/sqlite). This project supports multiple
 * providers (including Cloudflare D1 -> sqlite), so we select the correct schema module
 * at runtime based on `DATABASE_PROVIDER`.
 *
 * Important: keep export surface identical across schema.* files.
 */

import * as mysqlSchema from './schema.mysql';
import * as postgresSchema from './schema.postgres';
import * as sqliteSchema from './schema.sqlite';

function normalizeProvider(raw?: string) {
  const trimmed = (raw || '').trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted || 'postgresql';
}

const provider = normalizeProvider(process.env.DATABASE_PROVIDER);

type SchemaModule =
  | typeof mysqlSchema
  | typeof sqliteSchema
  | typeof postgresSchema;

const schemaModule: SchemaModule =
  provider === 'mysql'
    ? mysqlSchema
    : provider === 'sqlite' || provider === 'turso' || provider === 'd1'
      ? sqliteSchema
      : postgresSchema;

export const user = schemaModule.user;
export const session = schemaModule.session;
export const account = schemaModule.account;
export const verification = schemaModule.verification;
export const config = schemaModule.config;
export const taxonomy = schemaModule.taxonomy;
export const post = schemaModule.post;
export const order = schemaModule.order;
export const subscription = schemaModule.subscription;
export const credit = schemaModule.credit;
export const apikey = schemaModule.apikey;
export const role = schemaModule.role;
export const permission = schemaModule.permission;
export const rolePermission = schemaModule.rolePermission;
export const userRole = schemaModule.userRole;
export const aiTask = schemaModule.aiTask;
export const mediaAsset = schemaModule.mediaAsset;
export const chat = schemaModule.chat;
export const chatMessage = schemaModule.chatMessage;
