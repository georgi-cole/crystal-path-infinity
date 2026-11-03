package __PACKAGE__;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean paused;

    @Override public void onCreate(Bundle state) {
        registerPlugin(CpiLifecycle.class);
        registerPlugin(CpiFeedback.class);
        registerPlugin(CpiSecureSession.class);
        super.onCreate(state);
    }

    @Override public void onPause() {
        super.onPause();
        paused = true;
        if (bridge != null) ((CpiWebView) bridge.getWebView()).observedPause();
    }

    @Override public void onResume() {
        super.onResume();
        if (paused && bridge != null) ((CpiWebView) bridge.getWebView()).releaseAfterNativeResume();
        paused = false;
    }
}
