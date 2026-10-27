import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  getUserDatabase,
  getDatabase,
  serializeValue,
  deserializeRow,
} from './localDb';
import { getDefaultOrFirstUserId, getLocalUserById } from './localAuthEngine';
import { LOCAL_USER_ID, LOCAL_USER, localAuth } from './localUser';
export { LOCAL_USER_ID, LOCAL_USER, localAuth };

function parseOrFilter(filterString: string): { sql: string; params: any[] } | null {
  if (!filterString) return null;
  const parts = filterString.split(',');
  const sqlClauses: string[] = [];
  const params: any[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    const match = trimmed.match(/^([^.]+)\.([^.]+)\.(.+)$/);
    if (!match) continue;
    const [, col, op, rawVal] = match;

    let val: any = rawVal;
    if (val === 'true') val = 1;
    else if (val === 'false') val = 0;
    else if (val === 'null') val = null;

    if (op === 'eq') {
      if (val === null) {
        sqlClauses.push(`"${col}" IS NULL`);
      } else {
        sqlClauses.push(`"${col}" = ?`);
        params.push(val);
      }
    } else if (op === 'neq') {
      if (val === null) {
        sqlClauses.push(`"${col}" IS NOT NULL`);
      } else {
        sqlClauses.push(`"${col}" != ?`);
        params.push(val);
      }
    } else if (op === 'is') {
      if (val === null) {
        sqlClauses.push(`"${col}" IS NULL`);
      } else {
        sqlClauses.push(`"${col}" = ?`);
        params.push(val);
      }
    }
  }

  if (sqlClauses.length === 0) return null;
  return { sql: `(${sqlClauses.join(' OR ')})`, params };
}

export class LocalQueryBuilder<T = any> implements PromiseLike<{ data: any; error: any }> {
  private db: DatabaseSync;
  private tableName: string;
  private action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private selectColumns: string = '*';
  private whereClauses: Array<{ sql: string; params: any[] }> = [];
  private orderClauses: string[] = [];
  private limitCount?: number;
  private offsetCount?: number;
  private mutationValues?: any;
  private upsertOptions?: { onConflict?: string };
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private hasSelectAfterMutation: boolean = false;

  constructor(db: DatabaseSync, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  select(columns: string = '*') {
    this.selectColumns = columns;
    if (this.action !== 'select') {
      this.hasSelectAfterMutation = true;
    }
    return this;
  }

  eq(column: string, value: any) {
    if (value === null || value === undefined) {
      this.whereClauses.push({ sql: `"${column}" IS NULL`, params: [] });
    } else {
      const val = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      this.whereClauses.push({ sql: `"${column}" = ?`, params: [val] });
    }
    return this;
  }

  neq(column: string, value: any) {
    if (value === null || value === undefined) {
      this.whereClauses.push({ sql: `"${column}" IS NOT NULL`, params: [] });
    } else {
      const val = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      this.whereClauses.push({ sql: `"${column}" != ?`, params: [val] });
    }
    return this;
  }

  in(column: string, values: any[]) {
    if (!values || values.length === 0) {
      this.whereClauses.push({ sql: '1 = 0', params: [] });
      return this;
    }
    const placeholders = values.map(() => '?').join(', ');
    const params = values.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
    this.whereClauses.push({ sql: `"${column}" IN (${placeholders})`, params });
    return this;
  }

  is(column: string, value: any) {
    if (value === null || value === undefined) {
      this.whereClauses.push({ sql: `"${column}" IS NULL`, params: [] });
    } else {
      const val = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      this.whereClauses.push({ sql: `"${column}" = ?`, params: [val] });
    }
    return this;
  }

  like(column: string, pattern: string) {
    this.whereClauses.push({ sql: `"${column}" LIKE ?`, params: [pattern] });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.whereClauses.push({ sql: `"${column}" LIKE ?`, params: [pattern] });
    return this;
  }

  gte(column: string, value: any) {
    this.whereClauses.push({ sql: `"${column}" >= ?`, params: [value] });
    return this;
  }

  gt(column: string, value: any) {
    this.whereClauses.push({ sql: `"${column}" > ?`, params: [value] });
    return this;
  }

  lte(column: string, value: any) {
    this.whereClauses.push({ sql: `"${column}" <= ?`, params: [value] });
    return this;
  }

  lt(column: string, value: any) {
    this.whereClauses.push({ sql: `"${column}" < ?`, params: [value] });
    return this;
  }

  match(criteria: Record<string, any>) {
    for (const [key, val] of Object.entries(criteria)) {
      this.eq(key, val);
    }
    return this;
  }

  or(filterString: string) {
    const parsed = parseOrFilter(filterString);
    if (parsed) {
      this.whereClauses.push(parsed);
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    const dir = options?.ascending === false ? 'DESC' : 'ASC';
    this.orderClauses.push(`"${column}" ${dir}`);
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  insert(values: any | any[]) {
    this.action = 'insert';
    this.mutationValues = values;
    return this;
  }

  upsert(values: any | any[], options?: { onConflict?: string }) {
    this.action = 'upsert';
    this.mutationValues = values;
    this.upsertOptions = options;
    return this;
  }

  update(values: any) {
    this.action = 'update';
    this.mutationValues = values;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: any; error: any }> {
    try {
      if (this.action === 'select') {
        return this.executeSelect();
      }
      if (this.action === 'insert') {
        return this.executeInsert();
      }
      if (this.action === 'update') {
        return this.executeUpdate();
      }
      if (this.action === 'upsert') {
        return this.executeUpsert();
      }
      if (this.action === 'delete') {
        return this.executeDelete();
      }
      return { data: null, error: null };
    } catch (err: any) {
      return {
        data: null,
        error: {
          message: err?.message || 'Local SQLite query error',
          code: err?.code || 'SQLITE_ERROR',
        },
      };
    }
  }

  private buildWhereClause(): { whereSql: string; whereParams: any[] } {
    if (this.whereClauses.length === 0) {
      return { whereSql: '', whereParams: [] };
    }
    const whereSql = ' WHERE ' + this.whereClauses.map((c) => c.sql).join(' AND ');
    const whereParams = this.whereClauses.flatMap((c) => c.params);
    return { whereSql, whereParams };
  }

  private executeSelect(): { data: any; error: any } {
    let selectClause = '*';
    if (this.selectColumns && this.selectColumns !== '*') {
      const cols = this.selectColumns
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      selectClause = cols.map((c) => (c.includes('(') ? c : `"${c}"`)).join(', ');
    }

    const { whereSql, whereParams } = this.buildWhereClause();
    let sql = `SELECT ${selectClause} FROM "${this.tableName}"${whereSql}`;

    if (this.orderClauses.length > 0) {
      sql += ` ORDER BY ${this.orderClauses.join(', ')}`;
    }

    const params = [...whereParams];
    if (this.limitCount !== undefined) {
      sql += ` LIMIT ?`;
      params.push(this.limitCount);
      if (this.offsetCount !== undefined) {
        sql += ` OFFSET ?`;
        params.push(this.offsetCount);
      }
    }

    const rawRows = this.db.prepare(sql).all(...params) as Record<string, any>[];
    const rows = rawRows.map(deserializeRow);

    if (this.isSingle) {
      if (rows.length === 0) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      }
      if (rows.length > 1) {
        return { data: null, error: { message: 'JSON object requested, multiple rows returned', code: 'PGRST116' } };
      }
      return { data: rows[0], error: null };
    }

    if (this.isMaybeSingle) {
      if (rows.length === 0) {
        return { data: null, error: null };
      }
      return { data: rows[0], error: null };
    }

    return { data: rows, error: null };
  }

  private executeInsert(): { data: any; error: any } {
    const isArray = Array.isArray(this.mutationValues);
    const items = isArray ? this.mutationValues : [this.mutationValues];
    const insertedRows: any[] = [];

    for (const rawItem of items) {
      const item = { ...rawItem };
      if (!item.id && this.tableName !== 'whatsapp_sessions') {
        item.id = randomUUID();
      }

      const keys = Object.keys(item);
      const cols = keys.map((k) => `"${k}"`).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const params = keys.map((k) => serializeValue(k, item[k]));

      const sql = `INSERT INTO "${this.tableName}" (${cols}) VALUES (${placeholders})`;
      this.db.prepare(sql).run(...params);

      // Fetch row
      let insertedRow: any = null;
      if (item.id) {
        insertedRow = this.db.prepare(`SELECT * FROM "${this.tableName}" WHERE id = ?`).get(item.id);
      } else if (item.user_id && this.tableName === 'whatsapp_sessions') {
        insertedRow = this.db.prepare(`SELECT * FROM "${this.tableName}" WHERE user_id = ?`).get(item.user_id);
      }

      insertedRows.push(insertedRow ? deserializeRow(insertedRow as any) : item);
    }

    const dataResult = isArray ? insertedRows : (insertedRows[0] || null);
    if (this.isSingle || this.isMaybeSingle) {
      return { data: isArray ? (dataResult[0] || null) : dataResult, error: null };
    }
    return { data: dataResult, error: null };
  }

  private executeUpdate(): { data: any; error: any } {
    const updateData = { ...this.mutationValues };
    const keys = Object.keys(updateData);
    if (keys.length === 0) {
      return { data: null, error: null };
    }

    const { whereSql, whereParams } = this.buildWhereClause();

    // Query matching IDs to return updated data
    let matchingIds: any[] = [];
    if (this.hasSelectAfterMutation || this.isSingle || this.isMaybeSingle) {
      const selectSql = `SELECT id FROM "${this.tableName}"${whereSql}`;
      try {
        const found = this.db.prepare(selectSql).all(...whereParams) as Array<{ id: string }>;
        matchingIds = found.map((r) => r.id);
      } catch {
        // Table may not have id column (e.g. whatsapp_sessions)
      }
    }

    const setClauses = keys.map((k) => `"${k}" = ?`).join(', ');
    const setParams = keys.map((k) => serializeValue(k, updateData[k]));
    const updateSql = `UPDATE "${this.tableName}" SET ${setClauses}${whereSql}`;

    this.db.prepare(updateSql).run(...setParams, ...whereParams);

    if (this.hasSelectAfterMutation || this.isSingle || this.isMaybeSingle) {
      if (matchingIds.length > 0) {
        const placeholders = matchingIds.map(() => '?').join(', ');
        const rows = this.db.prepare(`SELECT * FROM "${this.tableName}" WHERE id IN (${placeholders})`).all(...matchingIds);
        const deserialized = rows.map((r) => deserializeRow(r as any));
        if (this.isSingle || this.isMaybeSingle) {
          return { data: deserialized[0] || null, error: null };
        }
        return { data: deserialized, error: null };
      }
      return { data: this.isSingle ? null : [], error: null };
    }

    return { data: null, error: null };
  }

  private executeUpsert(): { data: any; error: any } {
    const isArray = Array.isArray(this.mutationValues);
    const items = isArray ? this.mutationValues : [this.mutationValues];
    const conflictTarget = this.upsertOptions?.onConflict || (this.tableName === 'whatsapp_sessions' ? 'user_id' : 'id');
    const upsertedRows: any[] = [];

    for (const rawItem of items) {
      const item = { ...rawItem };
      if (!item.id && conflictTarget === 'id') {
        item.id = randomUUID();
      }

      const keys = Object.keys(item);
      const cols = keys.map((k) => `"${k}"`).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const params = keys.map((k) => serializeValue(k, item[k]));

      const updateKeys = keys.filter((k) => k !== conflictTarget);
      let sql = `INSERT INTO "${this.tableName}" (${cols}) VALUES (${placeholders})`;

      if (updateKeys.length > 0) {
        const updateSet = updateKeys.map((k) => `"${k}" = excluded."${k}"`).join(', ');
        sql += ` ON CONFLICT ("${conflictTarget}") DO UPDATE SET ${updateSet}`;
      } else {
        sql += ` ON CONFLICT ("${conflictTarget}") DO NOTHING`;
      }

      this.db.prepare(sql).run(...params);

      const lookupVal = item[conflictTarget];
      const row = this.db.prepare(`SELECT * FROM "${this.tableName}" WHERE "${conflictTarget}" = ?`).get(lookupVal);
      upsertedRows.push(row ? deserializeRow(row as any) : item);
    }

    const dataResult = isArray ? upsertedRows : (upsertedRows[0] || null);
    if (this.isSingle || this.isMaybeSingle) {
      return { data: isArray ? (dataResult[0] || null) : dataResult, error: null };
    }
    return { data: dataResult, error: null };
  }

  private executeDelete(): { data: any; error: any } {
    const { whereSql, whereParams } = this.buildWhereClause();
    const deleteSql = `DELETE FROM "${this.tableName}"${whereSql}`;
    this.db.prepare(deleteSql).run(...whereParams);
    return { data: null, error: null };
  }
}

export function createLocalDatabaseClient(userId?: string) {
  let activeUserId = userId;
  if (!activeUserId) {
    activeUserId = getDefaultOrFirstUserId();
  }
  const db = getUserDatabase(activeUserId);
  const userDetails = getLocalUserById(activeUserId);

  const authFacade = {
    ...localAuth,
    getUser: async () => {
      if (userDetails) {
        const u = {
          id: userDetails.id,
          email: userDetails.email,
          user_metadata: {
            display_name: userDetails.display_name,
          },
          role: 'authenticated',
          aud: 'authenticated',
          app_metadata: {
            provider: 'local',
            providers: ['local'],
          },
          created_at: userDetails.created_at || new Date().toISOString(),
        };
        return { data: { user: u }, error: null };
      }
      return localAuth.getUser();
    },
    getSession: async () => {
      const { data } = await authFacade.getUser();
      if (data?.user) {
        return {
          data: {
            session: {
              access_token: 'local-token',
              token_type: 'bearer',
              expires_in: 3600000,
              refresh_token: 'local-refresh-token',
              user: data.user,
            },
          },
          error: null,
        };
      }
      return { data: { session: null }, error: null };
    },
  };

  return {
    __isLocal: true,
    from: (tableName: string) => new LocalQueryBuilder(db, tableName),
    auth: authFacade,
    channel: (name: string) => ({
      on: function () {
        return this;
      },
      subscribe: function (cb?: (status: string) => void) {
        if (cb) cb('SUBSCRIBED');
        return this;
      },
      unsubscribe: () => {},
    }),
    removeChannel: () => {},
  };
}
