import { NextResponse } from 'next/server';
import { createLocalDatabaseClient } from '@/lib/db/localAdapter';
import { validateLocalSession } from '@/lib/db/localAuthEngine';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      table,
      action = 'select',
      select = '*',
      filters = [],
      order,
      limit,
      offset,
      data,
      options,
      single,
      maybeSingle,
    } = body;

    if (!table) {
      return NextResponse.json(
        { data: null, error: { message: 'Table name is required' } },
        { status: 400 }
      );
    }

    // Resolve active user from session token or pa_user_id cookie
    let userId: string | undefined;
    const cookieHeader = request.headers.get('cookie') || '';
    const tokenMatch = cookieHeader.match(/pa_session_token=([^;]+)/);
    if (tokenMatch) {
      const sessionUser = validateLocalSession(tokenMatch[1].trim());
      if (sessionUser) {
        userId = sessionUser.id;
      }
    }
    if (!userId) {
      const userMatch = cookieHeader.match(/pa_user_id=([^;]+)/);
      if (userMatch) {
        userId = userMatch[1].trim();
      }
    }

    const client = createLocalDatabaseClient(userId);
    let query: any = client.from(table);

    if (action === 'insert') {
      query = query.insert(data);
      if (select) query = query.select(select);
    } else if (action === 'update') {
      query = query.update(data);
      if (select) query = query.select(select);
    } else if (action === 'upsert') {
      query = query.upsert(data, options);
      if (select) query = query.select(select);
    } else if (action === 'delete') {
      query = query.delete();
    } else {
      query = query.select(select);
    }

    // Apply filters
    for (const f of filters) {
      if (f.type === 'eq') query = query.eq(f.column, f.value);
      else if (f.type === 'neq') query = query.neq(f.column, f.value);
      else if (f.type === 'in') query = query.in(f.column, f.value);
      else if (f.type === 'is') query = query.is(f.column, f.value);
      else if (f.type === 'or') query = query.or(f.value);
      else if (f.type === 'like') query = query.like(f.column, f.value);
      else if (f.type === 'ilike') query = query.ilike(f.column, f.value);
      else if (f.type === 'gte') query = query.gte(f.column, f.value);
      else if (f.type === 'gt') query = query.gt(f.column, f.value);
      else if (f.type === 'lte') query = query.lte(f.column, f.value);
      else if (f.type === 'lt') query = query.lt(f.column, f.value);
    }

    if (order && order.column) {
      query = query.order(order.column, { ascending: order.ascending });
    }

    if (limit !== undefined && limit !== null) {
      query = query.limit(limit);
    }

    if (offset !== undefined && offset !== null) {
      query = query.range(offset, offset + (limit || 10) - 1);
    }

    if (single) {
      query = query.single();
    } else if (maybeSingle) {
      query = query.maybeSingle();
    }

    const result = await query;
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: err?.message || 'Internal local DB bridge error' },
      },
      { status: 500 }
    );
  }
}
