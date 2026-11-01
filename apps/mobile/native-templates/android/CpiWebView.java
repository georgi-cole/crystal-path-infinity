package __PACKAGE__;

import android.content.Context;
import android.content.ContextWrapper;
import android.util.AttributeSet;
import android.util.Log;
import com.getcapacitor.CapacitorWebView;
import java.util.UUID;

/** Development-only deterministic interruption point; it never fakes a bridge. */
public class CpiWebView extends CapacitorWebView {
    private String heldUrl;
    private boolean released;
    private final String gateId = UUID.randomUUID().toString();

    public CpiWebView(Context context, AttributeSet attrs) { super(context, attrs); }

    private MainActivity owner() {
        Context context = getContext();
        while (context instanceof ContextWrapper) {
            if (context instanceof MainActivity) return (MainActivity) context;
            context = ((ContextWrapper) context).getBaseContext();
        }
        return null;
    }

    @Override public void loadUrl(String url) {
        MainActivity activity = owner();
        if (__DEVELOPMENT__ && !released && activity != null &&
            activity.getIntent().getBooleanExtra("cpi_prebridge_gate", false)) {
            heldUrl = url;
            Log.i("Capacitor", "CPI_NATIVE_GATE {\"stage\":\"waiting\",\"gateId\":\"" + gateId + "\"}");
            return;
        }
        super.loadUrl(url);
    }

    public void observedPause() {
        if (heldUrl != null) {
            Log.i("Capacitor", "CPI_NATIVE_GATE {\"stage\":\"paused\",\"gateId\":\"" + gateId + "\"}");
        }
    }

    public void releaseAfterNativeResume() {
        if (heldUrl == null) return;
        String url = heldUrl;
        heldUrl = null;
        released = true;
        Log.i("Capacitor", "CPI_NATIVE_GATE {\"stage\":\"released\",\"gateId\":\"" + gateId + "\"}");
        super.loadUrl(url);
    }
}
