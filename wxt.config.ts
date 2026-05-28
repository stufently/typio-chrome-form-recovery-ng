import { defineConfig } from 'wxt';

// WXT config — cross-browser MV3 build matrix.
// See docs/TARGETS.md for the full target matrix and per-browser deltas.
//
// Manifest version is taken from package.json by default; the release workflow
// bumps package.json from the git tag before building so the manifest stays in
// sync with the published artefact.

export default defineConfig({
  srcDir: '.',
  outDir: '.output',
  // Stable zip filenames so the release workflow can find them by path.
  zip: {
    artifactTemplate: '{{name}}-{{browser}}.zip',
    sourcesTemplate: '{{name}}-sources.zip',
  },
  manifest: ({ browser }) => {
    const isFirefox = browser === 'firefox';

    return {
      name: 'Typio Chrome Form Recovery NG',
      short_name: 'Typio NG',
      description:
        'Auto-save and recover text from web forms. Privacy-first, no servers, no telemetry. Typio-style form autosave and recovery.',
      default_locale: 'en',
      // version is sourced from package.json by WXT; the release workflow
      // bumps package.json from the git tag before each build.
      // Disable in incognito by default. The user can re-enable per browser
      // policy, but our default privacy stance is "do not autosave in private
      // browsing." See PRIVACY.md.
      incognito: 'not_allowed',
      icons: {
        16: 'icons/16.png',
        32: 'icons/32.png',
        48: 'icons/48.png',
        128: 'icons/128.png',
        512: 'icons/512.png',
      },
      permissions: ['storage', 'alarms', 'contextMenus', 'activeTab'],
      // host_permissions intentionally empty — see docs/PERMISSIONS.md.
      // Content script declares <all_urls> in content.ts entrypoint config.
      action: {
        default_title: '__MSG_action_title__',
        default_popup: 'popup.html',
        default_icon: {
          16: 'icons/16.png',
          32: 'icons/32.png',
          48: 'icons/48.png',
        },
      },
      options_ui: {
        page: 'options.html',
        open_in_tab: true,
      },
      commands: {
        'open-recovery-dialog': {
          suggested_key: {
            default: 'Alt+Shift+Z',
          },
          description: '__MSG_command_open_recovery__',
        },
      },
      // Firefox MV3 cannot use background.service_worker — WXT handles this when
      // the firefox build is invoked.
      minimum_chrome_version: !isFirefox ? '120' : undefined,
      browser_specific_settings: isFirefox
        ? {
            gecko: {
              id: 'typio-ng@stufently.github.io',
              strict_min_version: '121.0',
            },
          }
        : undefined,
    };
  },
});
