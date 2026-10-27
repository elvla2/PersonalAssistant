import { localAuth } from './localUser';

class LocalBrowserQueryBuilder implements PromiseLike<{ data: any; error: any }> {
  private tableName: string;
  private action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private selectColumns: string = '*';
  private filters: Array<{ type: string; column?: string; value?: any }> = [];
  private orderOptions?: { column: string; ascending?: boolean };
  private limitCount?: number;
  private offsetCount?: number;
  private mutationValues?: any;
  private upsertOptions?: { onConflict?: string };
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns: string = '*') {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ type: 'neq', column, value });
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push({ type: 'in', column, value: values });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({ type: 'is', column, value });
    return this;
  }

  or(filterString: string) {
    this.filters.push({ type: 'or', value: filterString });
    return this;
  }

  like(column: string, pattern: string) {
    this.filters.push({ type: 'like', column, value: pattern });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters.push({ type: 'ilike', column, value: pattern });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push({ type: 'gt', column, value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ type: 'lte', column, value });
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push({ type: 'lt', column, value });
    return this;
  }

  match(criteria: Record<string, any>) {
    for (const [key, val] of Object.entries(criteria)) {
      this.eq(key, val);
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderOptions = { column, ascending: options?.ascending };
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
      const res = await fetch('/api/local-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-desktop-mode': 'true',
        },
        body: JSON.stringify({
          table: this.tableName,
          action: this.action,
          select: this.selectColumns,
          filters: this.filters,
          order: this.orderOptions,
          limit: this.limitCount,
          offset: this.offsetCount,
          data: this.mutationValues,
          options: this.upsertOptions,
          single: this.isSingle,
          maybeSingle: this.isMaybeSingle,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          data: null,
          error: { message: `Local DB request failed (${res.status}): ${text}` },
        };
      }

      const json = await res.json();
      return json;
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message || 'Network error talking to local DB bridge' },
      };
    }
  }
}

export function createLocalBrowserClient() {
  return {
    __isLocal: true,
    from: (tableName: string) => new LocalBrowserQueryBuilder(tableName),
    auth: localAuth,
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
