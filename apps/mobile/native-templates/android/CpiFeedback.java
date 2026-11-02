package __PACKAGE__;

import android.view.HapticFeedbackConstants;
import android.view.View;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Uses View feedback; intentionally requires no VIBRATE permission. */
@CapacitorPlugin(name = "CpiFeedback")
public class CpiFeedback extends Plugin {
    @PluginMethod
    public void impact(PluginCall call) {
        final String kind = call.getString("kind");
        if (!"step".equals(kind) && !"damage".equals(kind) && !"end".equals(kind)) {
            call.reject("Unsupported haptic cue");
            return;
        }
        getActivity().runOnUiThread(() -> {
            final View view = getActivity() == null || getActivity().getWindow() == null
                ? null : getActivity().getWindow().getDecorView();
            if (view == null) { call.resolve(); return; }
            final int feedback = "step".equals(kind)
                ? HapticFeedbackConstants.KEYBOARD_TAP
                : "damage".equals(kind)
                    ? HapticFeedbackConstants.LONG_PRESS
                    : HapticFeedbackConstants.CONTEXT_CLICK;
            view.performHapticFeedback(feedback);
            call.resolve();
        });
    }
}
