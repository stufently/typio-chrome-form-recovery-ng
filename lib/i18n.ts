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
  | 'options_title'
  | 'options_retention'
  | 'options_retention_days'
  | 'options_blocklist'
  | 'options_blocklist_help'
  | 'options_export'
  | 'options_import'
  | 'options_import_dry_run'
  | 'options_import_apply'
  | 'options_saved'
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
