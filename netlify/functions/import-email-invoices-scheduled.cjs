const { schedule } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const { runInvoiceImport } = require('./import-email-invoices.cjs');

const SCHEDULE_TIMEZONE = 'Europe/Bratislava';
const RUN_HOURS = new Set(['00', '12']);

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const logCronRun = async ({ status, startedAt, summary = {}, error = null }) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const finishedAt = new Date();
  await supabase.from('invoice_import_runs').insert({
    source: 'netlify_cron',
    status,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    summary,
    error,
  });
};

const handler = async () => {
  const startedAt = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHEDULE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;

  if (!RUN_HOURS.has(hour || '') || minute !== '00') {
    await logCronRun({
      status: 'skipped',
      startedAt,
      summary: { hour, minute, timezone: SCHEDULE_TIMEZONE },
    }).catch(() => {});

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, skipped: true, reason: `Runs only at 00:00 and 12:00 ${SCHEDULE_TIMEZONE}` }),
    };
  }

  const limit = Math.min(toNumber(process.env.INVOICE_IMPORT_CRON_LIMIT, 10), 50);
  const maxImports = Math.min(toNumber(process.env.INVOICE_IMPORT_CRON_MAX_IMPORTS, 5), 10);

  const response = await runInvoiceImport({
    skipAdmin: true,
    body: {
      limit,
      maxImports,
      dryRun: false,
      documentType: 'invoice',
    },
  });

  let payload = {};
  try {
    payload = response.body ? JSON.parse(response.body) : {};
  } catch {
    payload = {};
  }

  await logCronRun({
    status: response.statusCode >= 200 && response.statusCode < 300 && payload.ok !== false ? 'success' : 'error',
    startedAt,
    summary: {
      limit,
      maxImports,
      documentType: 'invoice',
      ...(payload.summary || {}),
    },
    error: payload.error || null,
  }).catch(() => {});

  return response;
};

exports.handler = schedule('0 * * * *', handler);
