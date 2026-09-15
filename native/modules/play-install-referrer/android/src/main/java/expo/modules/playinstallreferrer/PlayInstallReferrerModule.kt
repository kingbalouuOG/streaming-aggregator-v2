package expo.modules.playinstallreferrer

import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Play Install Referrer (Growth S2, plan D18). One call: the referrer string
 * Google Play recorded for this install ("via=share&t=movie-603", or
 * "utm_source=google-play&utm_medium=organic" for an organic install), or
 * null when Play is unavailable, the service fails or the device is not a
 * Play install. Never rejects: the caller treats every failure as "no
 * referrer".
 */
class PlayInstallReferrerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PlayInstallReferrer")

    AsyncFunction("getReferrer") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      val client = InstallReferrerClient.newBuilder(context).build()
      // The service can report a disconnect after the value has gone out;
      // settle the promise exactly once.
      val settled = AtomicBoolean(false)
      fun settle(value: String?) {
        if (!settled.compareAndSet(false, true)) return
        promise.resolve(value as Any?)
        try {
          client.endConnection()
        } catch (_: Exception) {
        }
      }

      try {
        client.startConnection(object : InstallReferrerStateListener {
          override fun onInstallReferrerSetupFinished(responseCode: Int) {
            if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
              val referrer = try {
                client.installReferrer.installReferrer
              } catch (_: Exception) {
                null
              }
              settle(referrer)
            } else {
              settle(null)
            }
          }

          override fun onInstallReferrerServiceDisconnected() {
            settle(null)
          }
        })
      } catch (_: Exception) {
        settle(null)
      }
    }
  }
}
