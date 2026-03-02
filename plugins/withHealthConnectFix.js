/**
 * withHealthConnectFix
 *
 * Fixes four issues with react-native-health-connect v3.5.0 + Expo SDK 54:
 *
 * Fix 1 — Kotlin version
 *   Gradle 8.14.3 is incompatible with Kotlin 1.8.0 (the fallback used when
 *   rootProject.ext.kotlinVersion is not set).  Inject kotlinVersion = "2.1.20".
 *
 * Fix 2 — Manifest merger minSdkVersion conflict
 *   expo-dev-launcher's debug AndroidManifest declares minSdkVersion 24;
 *   Health Connect requires 26.  Add tools:overrideLibrary to suppress the
 *   check (safe: our app itself declares minSdkVersion 26 in app.json).
 *
 * Fix 3 — Missing Health Connect permission declarations
 *   The react-native-health-connect app.plugin.js only adds an intent-filter
 *   to the main activity; it does NOT add the android.permission.health.*
 *   <uses-permission> elements.  Without those declarations the OS rejects
 *   the permission request at runtime, crashing the app.
 *   Also adds the newer SHOW_PERMISSIONS_RATIONALE action needed by Health
 *   Connect 1.1+ (the old plugin only adds the legacy action).
 *
 * Fix 4 — Missing setPermissionDelegate call in MainActivity
 *   HealthConnectPermissionDelegate.requestPermission is a lateinit var that
 *   is only initialized when setPermissionDelegate(activity) is called.
 *   The library does NOT call this automatically — it must be invoked from
 *   MainActivity.onCreate().  Without it, tapping "Grant Permissions" throws
 *   UninitializedPropertyAccessException and crashes the app.
 */

const { withProjectBuildGradle, withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

// ---------------------------------------------------------------------------
// Fix 1 — Kotlin version in root build.gradle
// ---------------------------------------------------------------------------

const KOTLIN_VERSION = '2.1.20';
const MARKER = '// Top-level build file';
const INJECTION = `// Kotlin version override for react-native-health-connect compatibility\next.kotlinVersion = "${KOTLIN_VERSION}"\n\n`;

function withKotlinVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes('ext.kotlinVersion')) return config;
    if (!contents.includes(MARKER)) {
      console.warn('[withHealthConnectFix] Kotlin marker not found — skipping.');
      return config;
    }
    config.modResults.contents = contents.replace(MARKER, INJECTION + MARKER);
    return config;
  });
}

// ---------------------------------------------------------------------------
// Fix 2 + 3 — AndroidManifest patches
// ---------------------------------------------------------------------------

const HC_LIBRARY = 'androidx.health.connect.client';

// Mic/audio permissions — expo-audio plugin doesn't reliably inject these on Android.
const APP_AUDIO_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
];

// Every record type we request in HealthService.ts must be declared here.
const HC_PERMISSIONS = [
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_TOTAL_CALORIES_BURNED',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
];

// Health Connect 1.1+ requires this action (the library plugin only adds the old one)
const HC_RATIONALE_ACTION_NEW = 'androidx.health.connect.client.SHOW_PERMISSIONS_RATIONALE';

// Android 14+ requires this activity-alias so the system Health Connect UI can launch.
// Without it, requestPermission.launch() silently completes with 0 grants on API 34+.
const HC_VIEW_PERMISSION_USAGE_ACTION = 'android.intent.action.VIEW_PERMISSION_USAGE';
const HC_HEALTH_PERMISSIONS_CATEGORY = 'android.intent.category.HEALTH_PERMISSIONS';

function withHealthConnectManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // — Ensure tools namespace on <manifest> ——————————————————————————————
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // — Fix 2: tools:overrideLibrary to suppress minSdk check ——————————
    const alreadyHasOverride = (manifest['uses-sdk'] ?? []).some(
      (el) => (el.$?.['tools:overrideLibrary'] ?? '').includes(HC_LIBRARY)
    );
    if (!alreadyHasOverride) {
      manifest['uses-sdk'] = [
        ...(manifest['uses-sdk'] ?? []),
        { $: { 'tools:overrideLibrary': HC_LIBRARY } },
      ];
      console.log('[withHealthConnectFix] Added tools:overrideLibrary for', HC_LIBRARY);
    }

    // — App audio permissions (mic) — injected directly because expo-audio plugin
    //   does not reliably add RECORD_AUDIO to the Android manifest in all versions.
    const existingPerms = new Set(
      (manifest['uses-permission'] ?? []).map((p) => p.$?.['android:name'] ?? '')
    );
    let addedAudioPerms = 0;
    for (const perm of APP_AUDIO_PERMISSIONS) {
      if (!existingPerms.has(perm)) {
        manifest['uses-permission'] = [
          ...(manifest['uses-permission'] ?? []),
          { $: { 'android:name': perm } },
        ];
        existingPerms.add(perm);
        addedAudioPerms++;
      }
    }
    if (addedAudioPerms > 0) {
      console.log(`[withHealthConnectFix] Added ${addedAudioPerms} audio permission(s): RECORD_AUDIO, MODIFY_AUDIO_SETTINGS`);
    }

    // — Fix 3a: Health Connect permission declarations ————————————————————
    let addedPerms = 0;
    for (const perm of HC_PERMISSIONS) {
      if (!existingPerms.has(perm)) {
        manifest['uses-permission'] = [
          ...(manifest['uses-permission'] ?? []),
          { $: { 'android:name': perm } },
        ];
        addedPerms++;
      }
    }
    if (addedPerms > 0) {
      console.log(`[withHealthConnectFix] Added ${addedPerms} Health Connect permission(s)`);
    }

    // — Fix 3b: Add newer rationale intent-filter to main activity —————
    const app = manifest.application?.[0];
    const mainActivity = app?.activity?.[0];
    if (mainActivity) {
      const filters = mainActivity['intent-filter'] ?? [];
      const hasNewAction = filters.some((f) =>
        (f.action ?? []).some((a) => a.$?.['android:name'] === HC_RATIONALE_ACTION_NEW)
      );
      if (!hasNewAction) {
        mainActivity['intent-filter'] = [
          ...filters,
          { action: [{ $: { 'android:name': HC_RATIONALE_ACTION_NEW } }] },
        ];
        console.log('[withHealthConnectFix] Added', HC_RATIONALE_ACTION_NEW, 'intent-filter');
      }
    }

    // — Fix 5: activity-alias required on Android 14+ ————————————————————
    // Without this, the system Health Connect UI has no rationale target and
    // requestPermission.launch() completes immediately with 0 grants (silent no-op).
    if (app) {
      const aliases = app['activity-alias'] ?? [];
      const hasAlias = aliases.some((a) =>
        (a['intent-filter'] ?? []).some((f) =>
          (f.action ?? []).some((act) => act.$?.['android:name'] === HC_VIEW_PERMISSION_USAGE_ACTION)
        )
      );
      if (!hasAlias) {
        app['activity-alias'] = [
          ...aliases,
          {
            $: {
              'android:name': 'ViewPermissionUsageActivity',
              'android:exported': 'true',
              'android:targetActivity': '.MainActivity',
              'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
            },
            'intent-filter': [
              {
                action: [{ $: { 'android:name': HC_VIEW_PERMISSION_USAGE_ACTION } }],
                category: [{ $: { 'android:name': HC_HEALTH_PERMISSIONS_CATEGORY } }],
              },
            ],
          },
        ];
        console.log('[withHealthConnectFix] Added activity-alias for Android 14+ Health Connect permissions');
      }
    }

    return config;
  });
}

// ---------------------------------------------------------------------------
// Fix 4 — Patch MainActivity.kt to call setPermissionDelegate
// ---------------------------------------------------------------------------

const HC_DELEGATE_IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const BUNDLE_IMPORT = 'import android.os.Bundle';
const REACT_ACTIVITY_IMPORT = 'import com.facebook.react.ReactActivity';

function withHealthConnectMainActivity(config) {
  return withMainActivity(config, (config) => {
    let { contents } = config.modResults;

    // Idempotency guard
    if (contents.includes('setPermissionDelegate')) {
      return config;
    }

    // — Add android.os.Bundle import ————————————————————————————————————————
    if (!contents.includes(BUNDLE_IMPORT)) {
      contents = contents.replace(
        REACT_ACTIVITY_IMPORT,
        `${BUNDLE_IMPORT}\n${REACT_ACTIVITY_IMPORT}`
      );
    }

    // — Add HealthConnectPermissionDelegate import ——————————————————————————
    if (!contents.includes(HC_DELEGATE_IMPORT)) {
      contents = contents.replace(
        REACT_ACTIVITY_IMPORT,
        `${HC_DELEGATE_IMPORT}\n${REACT_ACTIVITY_IMPORT}`
      );
    }

    // — Inject delegate call after super.onCreate(...) ————————————————————
    // The SDK 54 template uses super.onCreate(null) not super.onCreate(savedInstanceState),
    // so match generically: super.onCreate(<anything>)
    const delegateCall = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

    if (contents.includes('override fun onCreate')) {
      // An onCreate already exists — append delegate call right after super.onCreate(...)
      contents = contents.replace(
        /super\.onCreate\([^)]*\)/,
        (match) => `${match}\n    ${delegateCall}`
      );
    } else {
      // No onCreate in template — add one before the first existing override
      const onCreate =
        `  override fun onCreate(savedInstanceState: Bundle?) {\n` +
        `    super.onCreate(null)\n` +
        `    ${delegateCall}\n` +
        `  }\n\n`;
      contents = contents.replace(
        '  override fun getMainComponentName',
        onCreate + '  override fun getMainComponentName'
      );
    }

    config.modResults.contents = contents;
    console.log('[withHealthConnectFix] Patched MainActivity with setPermissionDelegate');
    return config;
  });
}

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

module.exports = function withHealthConnectFix(config) {
  config = withKotlinVersion(config);
  config = withHealthConnectManifest(config);
  config = withHealthConnectMainActivity(config);
  return config;
};
