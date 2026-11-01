import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const capacitorAndroidLifecycleSourceSha256 =
  '7d2d95e8d3986b6608630262166cdee1c208bc4270d76ee69c05b7463a02c0c7';

/** Patch only the generated native copy; installed npm files remain untouched. */
export function patchAndroidLifecycle(source: string): string {
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    capacitorAndroidLifecycleSourceSha256,
    'Capacitor 8.5.3 lifecycle source changed; review the native readiness patch before generation',
  );
  const before = `    public void triggerDocumentEvent(final String eventName) {
        eval("window.Capacitor.triggerEvent('" + eventName + "', 'document');", (s) -> {});
    }`;
  const after = `    private static final Map<WebView, String> lifecyclePages =
        java.util.Collections.synchronizedMap(new java.util.WeakHashMap<>());

    public static void setLifecyclePage(WebView webView, String pageId) {
        if (pageId == null) lifecyclePages.remove(webView);
        else lifecyclePages.put(webView, pageId);
    }

    public void triggerDocumentEvent(final String eventName) {
        final String owner = lifecyclePages.get(webView);
        if (owner == null) {
            android.util.Log.i("Capacitor", "CPI_NATIVE_PREPAGE_EVENT dropped " + eventName);
            return;
        }
        Handler mainHandler = new Handler(context.getMainLooper());
        mainHandler.post(() -> {
            if (!owner.equals(lifecyclePages.get(webView))) return;
            // A queued native callback may execute after navigation. The exact
            // handshake identity prevents delivery into another document.
            webView.evaluateJavascript(
                "if (window.__CPI_NATIVE_PAGE_ID__ === " + org.json.JSONObject.quote(owner) +
                ") window.Capacitor.triggerEvent('" + eventName + "', 'document');", null);
        });
    }`;
  assert.equal(source.split(before).length, 2, 'Expected one native lifecycle dispatch');
  return source.replace(before, after);
}
