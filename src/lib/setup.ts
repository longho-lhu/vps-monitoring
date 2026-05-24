import { redirect } from 'next/navigation';
import { db } from './db';

/** DB query only — use from API routes (return 503 on failure). Do not redirect. */
export async function querySetupComplete(): Promise<boolean> {
  const row = db.prepare('SELECT COUNT(*) as count FROM User').get() as { count: number } | undefined;
  return (row?.count ?? 0) > 0;
}

/**
 * For Server Components / layouts. On DB failure redirects to /service-unavailable
 * (instead of a cryptic “Application error” page).
 */
export async function isSetupComplete(): Promise<boolean> {
  try {
    return await querySetupComplete();
  } catch (err) {
    console.error('[isSetupComplete] database error:', err);
    redirect('/service-unavailable');
  }
}
