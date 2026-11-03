#!/usr/bin/env bash
# Retry ONLY corrupt Android SDK image downloads. Never retry failed emulator boot or app lifecycle tests.
set -euo pipefail

sdk_home="${ANDROID_HOME:-}"
if [[ "$sdk_home" != /* || "$sdk_home" == "/" || ! -d "$sdk_home" ]]; then
  echo "::error::ANDROID_HOME must be an existing absolute SDK directory." >&2
  exit 1
fi
sdkmanager="$sdk_home/cmdline-tools/latest/bin/sdkmanager"
package="system-images;android-36;default;x86_64"
image_dir="$sdk_home/system-images/android-36/default/x86_64"
artifacts="apps/mobile/artifacts"
combined_log="$artifacts/android-system-image-install.log"
if [[ ! -x "$sdkmanager" ]]; then
  echo "::error::Android SDK manager is not executable." >&2
  exit 1
fi
mkdir -p "$artifacts"
: > "$combined_log"
image_complete() {
  [[ -s "$image_dir/source.properties" && -s "$image_dir/system.img" ]]
}
archive_error='Error on ZipFile unknown archive|ZipException|zip END header not found|invalid CEN header|unexpected end of (file|archive)|corrupt(ed)? (ZIP|archive)'
for attempt in 1 2 3; do
  attempt_log="$artifacts/android-system-image-install-attempt-$attempt.log"
  printf 'Android 16 AOSP system-image installation: attempt %s/3\n' "$attempt" | tee -a "$combined_log"
  if "$sdkmanager" --install "$package" </dev/null > "$attempt_log" 2>&1; then
    cat "$attempt_log" | tee -a "$combined_log"
    if image_complete; then
      echo "Official Android 16 AOSP image installed; required files verified."
      exit 0
    fi
    echo "::error::sdkmanager returned success but the required system image is incomplete." >&2
    exit 1
  fi

  cat "$attempt_log" | tee -a "$combined_log"
  if ! grep -Eiq "$archive_error" "$attempt_log"; then
    echo "::error::SDK installation failed for a reason other than an incomplete ZIP; refusing to retry." >&2
    exit 1
  fi
  if (( attempt == 3 )); then
    echo "::error::Android system-image archive was corrupt after three bounded download attempts." >&2
    exit 1
  fi
  if image_complete; then
    echo "::error::A complete image exists but SDK installation failed; refusing destructive cleanup." >&2
    exit 1
  fi
  # Only delete the exact incomplete image, not other SDK packages.
  if [[ -d "$image_dir" ]]; then rm -rf -- "$image_dir"; fi
  echo "::warning::Corrupt SDK ZIP; removed the incomplete API 36 AOSP image before retrying."
  sleep "${CPI_ANDROID_SDK_RETRY_DELAY_SECONDS:-5}"
done
exit 1
