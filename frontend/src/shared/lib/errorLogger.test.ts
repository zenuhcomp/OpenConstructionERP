// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
//
// errorLogger contract tests — focused on the bug-report flow.
//
// Background: GitHub issue #115 was filed because a benign 404 from
// the BIM auto-detect path got captured as the "last error" by the
// in-app bug-report dialog. The page handled the 404 gracefully via
// toast, but the warning entry still leaked into the report template.
//
// `getLastError()` now prefers the most recent level=error entry over
// warning-level noise. These tests lock that contract in.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLastError,
  logApiError,
  logError,
  clearErrorLog,
  getErrorLog,
  shouldSuppress,
} from './errorLogger';

describe('errorLogger.getLastError — bug-report payload selection', () => {
  beforeEach(() => {
    clearErrorLog();
  });

  it('returns null when nothing has been logged', () => {
    expect(getLastError()).toBeNull();
  });

  it('returns the most recent entry when only warnings exist', () => {
    logApiError('/v1/foo/', 404, 'not found');
    logApiError('/v1/bar/', 404, 'not found');
    const last = getLastError();
    expect(last).not.toBeNull();
    expect(last!.message).toContain('/v1/bar/');
  });

  it('prefers a level=error entry over a more recent warning', () => {
    // 500 → level=error
    logApiError('/v1/important/', 500, 'oops');
    // 404 → level=warning, but the 500 was the real problem
    logApiError('/v1/bim_hub/abc-123/', 404, 'not found');
    const last = getLastError();
    expect(last!.message).toContain('/v1/important/');
    expect(last!.message).not.toContain('/v1/bim_hub/');
  });

  it('falls back to most recent warning when no error exists in the window', () => {
    logApiError('/v1/some/', 404, 'not found');
    const last = getLastError();
    expect(last!.message).toContain('/v1/some/');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Recording whitelist — observability noise filters
//
// Source defect: user error log openconstructionerp-log-2026-05-22.json
// captured 50 of 64 errors as the same handled /profile 404 plus a
// handful of converter-install AbortErrors. None of those are
// actionable — they spam the bug-report buffer and bury the real
// errors. The whitelist drops them at recording time.

describe('errorLogger recording whitelist', () => {
  beforeEach(() => {
    clearErrorLog();
  });

  it('drops /v1/projects/{uuid}/profile 404 (handled by backend retrofit)', () => {
    logApiError(
      '/v1/projects/0e92b341-7af3-4d4c-bd2c-a6f7a8f01234/profile',
      404,
      'no setup profile yet',
    );
    expect(getErrorLog()).toHaveLength(0);
    expect(getLastError()).toBeNull();
  });

  it('drops /v1/bim_hub/* 404 (user navigated to a deleted model)', () => {
    logApiError(
      '/v1/bim_hub/models/0e92b341-7af3-4d4c-bd2c-a6f7a8f01234/elements',
      404,
      'model not found',
    );
    expect(getErrorLog()).toHaveLength(0);
  });

  it('drops AbortError from POST /v1/takeoff/converters/{id}/install', () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    logError(e, 'api_error', {
      url: '/v1/takeoff/converters/rvt/install/',
    });
    expect(getErrorLog()).toHaveLength(0);
  });

  it('drops 422 on /v1/crm/opportunities with the stale oversized limit', () => {
    logApiError(
      '/v1/crm/opportunities/?limit=500',
      422,
      'Input should be less than or equal to 200',
    );
    expect(getErrorLog()).toHaveLength(0);
  });

  it('drops 422 on /v1/users with the stale oversized limit', () => {
    logApiError(
      '/v1/users/?limit=200',
      422,
      'Input should be less than or equal to 100',
    );
    expect(getErrorLog()).toHaveLength(0);
  });

  it('does NOT suppress unrelated 404s on the same modules', () => {
    // A genuine 404 on /v1/projects/{id}/boqs/ is unrelated to the
    // profile-retrofit issue — must still be recorded.
    logApiError(
      '/v1/projects/0e92b341-7af3-4d4c-bd2c-a6f7a8f01234/boqs/',
      404,
      'boq not found',
    );
    expect(getErrorLog().length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT suppress 500 on /v1/projects/{id}/profile (real failure)', () => {
    // A 500 on the profile endpoint is a real bug — must surface.
    logApiError(
      '/v1/projects/0e92b341-7af3-4d4c-bd2c-a6f7a8f01234/profile',
      500,
      'oops',
    );
    expect(getErrorLog().length).toBeGreaterThanOrEqual(1);
  });

  it('shouldSuppress predicate handles each whitelist field independently', () => {
    // Path-only whitelist hit (any status counts → bim_hub 404).
    expect(shouldSuppress({ path: '/v1/bim_hub/x', status: 404 })).toBe(true);
    // Path matches but status doesn't (we whitelisted only 404 → 500
    // must still pass through).
    expect(
      shouldSuppress({
        path: '/v1/projects/00000000-0000-0000-0000-000000000000/profile',
        status: 500,
      }),
    ).toBe(false);
    // errorName predicate requires the right name.
    expect(
      shouldSuppress({
        path: '/v1/takeoff/converters/rvt/install/',
        errorName: 'AbortError',
      }),
    ).toBe(true);
    expect(
      shouldSuppress({
        path: '/v1/takeoff/converters/rvt/install/',
        errorName: 'TypeError',
      }),
    ).toBe(false);
    // Empty input never matches.
    expect(shouldSuppress({})).toBe(false);
  });
});
