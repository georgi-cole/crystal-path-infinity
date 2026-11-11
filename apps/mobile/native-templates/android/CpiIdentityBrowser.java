package __PACKAGE__;

import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResultLauncher;
import androidx.browser.auth.AuthTabIntent;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

/** System Auth Tab, with Custom Tab fallback. Never opens provider pages in the game WebView. */
public final class CpiIdentityBrowser {
    private static final String SCHEME = "com.georgicole.crystalpath.infinity";
    private final ActivityResultLauncher<Intent> launcher;
    private PluginCall pending;
    private String state;

    public CpiIdentityBrowser(MainActivity activity) {
        launcher = AuthTabIntent.registerActivityResultLauncher(activity, result -> {
            if (pending == null) return;
            if (result.resultCode == AuthTabIntent.RESULT_OK) returned(result.resultUri);
            else finish("cancelled");
        });
    }

    public void open(PluginCall call) {
        String raw = call.getString("url"), expectedState = call.getString("state");
        if (pending != null || raw == null || expectedState == null || !expectedState.matches("^[A-Za-z0-9_-]{43}$")) {
            call.reject("Sign-in unavailable"); return;
        }
        Uri url = Uri.parse(raw);
        boolean provider = ("accounts.google.com".equals(url.getHost()) && "/o/oauth2/v2/auth".equals(url.getPath())) ||
            ("appleid.apple.com".equals(url.getHost()) && "/auth/authorize".equals(url.getPath()));
        if (!"https".equals(url.getScheme()) || url.getUserInfo() != null || url.getFragment() != null || !provider ||
            url.getQueryParameters("state").size() != 1 || !expectedState.equals(url.getQueryParameter("state")) ||
            url.getQueryParameters("redirect_uri").size() != 1 ||
            !("https://crystalpath-api.kolequant.xyz/cpi/identity/mobile/callback".equals(url.getQueryParameter("redirect_uri")) ||
              "https://crystal-path-staging-api.kolequant.workers.dev/cpi/identity/mobile/callback".equals(url.getQueryParameter("redirect_uri")))) {
            call.reject("Sign-in unavailable"); return;
        }
        pending = call;
        state = expectedState;
        try { new AuthTabIntent.Builder().build().launch(launcher, url, SCHEME); }
        catch (RuntimeException error) { fail(); }
    }

    public void onNewIntent(Intent intent) {
        Uri value = intent.getData();
        if (pending != null && value != null && SCHEME.equals(value.getScheme())) returned(value);
    }

    private void returned(Uri uri) {
        if (uri == null || !SCHEME.equals(uri.getScheme()) || uri.getHost() != null ||
            !"/signin".equals(uri.getPath()) || uri.getFragment() != null ||
            uri.getQueryParameterNames().size() != 1 || uri.getQueryParameters("state").size() != 1 ||
            !state.equals(uri.getQueryParameter("state"))) { fail(); return; }
        finish("returned");
    }
    private void finish(String status) {
        PluginCall call = pending; pending = null; state = null;
        if (call != null) call.resolve(new JSObject().put("status", status));
    }
    private void fail() {
        PluginCall call = pending; pending = null; state = null;
        if (call != null) call.reject("Sign-in unavailable");
    }
}
