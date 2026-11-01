package __PACKAGE__;

import android.os.SystemClock;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.CpiLifecycleGate;
import java.util.UUID;
import org.json.JSONObject;

/** UI-thread snapshots; the foreground accumulator never includes suspended time. */
@CapacitorPlugin(name = "CpiLifecycle")
public class CpiLifecycle extends Plugin {
    private final String bridgeId = UUID.randomUUID().toString();
    private String pageId;
    private long sequence;
    private long pageGeneration;
    private boolean active;
    private double accumulated;
    private final double origin = SystemClock.elapsedRealtimeNanos() / 1_000_000.0;
    private double boundary;

    private double now() { return SystemClock.elapsedRealtimeNanos() / 1_000_000.0 - origin; }

    @Override public void load() {
        getBridge().addWebViewListener(new WebViewListener() {
            @Override public void onPageStarted(WebView view) {
                pageGeneration++;
                pageId = null;
                CpiLifecycleGate.setPage(view, null);
            }
        });
    }

    private JSObject snapshot() {
        double sampled = now();
        JSObject result = new JSObject();
        result.put("pageId", pageId);
        result.put("bridgeId", bridgeId);
        result.put("sequence", ++sequence);
        result.put("isActive", active);
        result.put("nativeTimeMs", sampled);
        result.put("foregroundTimeMs", accumulated + (active ? sampled - boundary : 0));
        return result;
    }

    private void update(boolean next) {
        double sampled = now();
        if (next == active) return;
        if (active) accumulated += sampled - boundary;
        boundary = sampled;
        active = next;
        if (pageId == null) return;
        final String owner = pageId;
        final String value = snapshot().toString();
        getBridge().getWebView().evaluateJavascript(
            "if (window.__CPI_NATIVE_PAGE_ID__ === " + JSONObject.quote(owner) + ") { " +
            "document.dispatchEvent(new CustomEvent('cpi-native-state', { detail: " + value + " })); }",
            null
        );
    }

    @Override protected void handleOnResume() { update(true); }
    @Override protected void handleOnPause() { update(false); }
    @Override protected void handleOnDestroy() {
        if (active) accumulated += now() - boundary;
        active = false;
        CpiLifecycleGate.setPage(getBridge().getWebView(), null);
        pageId = null;
    }

    @PluginMethod public void getSnapshot(PluginCall call) {
        final String requested = call.getString("pageId");
        if (requested == null || !requested.matches("[A-Za-z0-9_-]{1,128}")) {
            call.reject("Invalid page identity");
            return;
        }
        getActivity().runOnUiThread(() -> {
            final long generation = pageGeneration;
            getBridge().getWebView().evaluateJavascript(
                "window.__CPI_NATIVE_PAGE_ID__ === " + JSONObject.quote(requested) +
                " && typeof window.Capacitor?.triggerEvent === 'function'", result -> {
                    if (!"true".equals(result) || generation != pageGeneration) {
                        call.reject("Stale native page handshake");
                        return;
                    }
                    pageId = requested;
                    CpiLifecycleGate.setPage(getBridge().getWebView(), requested);
                    call.resolve(snapshot());
                }
            );
        });
    }
}
