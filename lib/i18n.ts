// Thin wrapper around browser.i18n.getMessage with stronger typing.
//
// The full message catalogue lives in public/_locales/<lang>/messages.json.
// We declare the keys here so a typo at call sites is a TS error.

import browser from 'webextension-polyfill';

export type MessageKey =
  | 'extension_name'
  | 'extension_short_name'
  | 'extension_description'
  | 'action_title'
  | 'command_open_recovery'
  | 'context_menu_recover'
  | 'popup_loading'
  | 'popup_empty'
  | 'popup_open_recovery'
  | 'popup_open_options'
  | 'popup_restore_failed'
  | 'popup_footer_privacy'
  | 'popup_link_github'
  | 'time_just_now'
  | 'time_minutes_ago'
  | 'time_hours_ago'
  | 'time_days_ago'
  | 'options_title'
  | 'options_retention'
  | 'options_retention_days'
  | 'options_blocklist'
  | 'options_blocklist_help'
  | 'options_export'
  | 'options_import'
  | 'options_import_dry_run'
  | 'options_import_apply'
  | 'options_save'
  | 'options_saved'
  | 'options_import_summary'
  | 'options_import_error'
  | 'options_import_too_large'
  | 'options_import_invalid_json'
  | 'yes'
  | 'no'
  | 'recovery_title'
  | 'recovery_search'
  | 'recovery_restore'
  | 'recovery_close'
  | 'recovery_empty';

export function t(key: MessageKey, substitutions?: string | string[]): string {
  const raw = browser.i18n.getMessage(key, substitutions);
  // getMessage returns "" if the key is missing — surface the key in that case
  // so we notice during dev. Production catalogue is checked into the repo.
  return raw || key;
}

/**
 * Localised short relative time, e.g. "just now" / "5m ago" / "3h ago" / "2d ago".
 * Shared by the popup and the in-page recovery dialog.
 */
export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return t('time_just_now');
  if (diff < 3_600_000) return t('time_minutes_ago', String(Math.floor(diff / 60_000)));
  if (diff < 86_400_000) return t('time_hours_ago', String(Math.floor(diff / 3_600_000)));
  return t('time_days_ago', String(Math.floor(diff / 86_400_000)));
}
