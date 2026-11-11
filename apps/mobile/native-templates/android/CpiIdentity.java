package __PACKAGE__;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CpiIdentity")
public final class CpiIdentity extends Plugin {
    @PluginMethod public void openProduction(PluginCall call) {
        getActivity().runOnUiThread(() -> ((MainActivity) getActivity()).openIdentity(call));
    }
}
