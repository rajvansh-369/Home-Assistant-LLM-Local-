package expo.modules.astersystem

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Speech-to-text for 3.6 Voice (docs/aster-voice-plan.md §4): Android's recognizer, on-device
 * when the phone has one ("recognition on this phone"), else the default one asked to prefer
 * offline. One listen at a time, on the main thread (the recognizer needs it). Results go to JS as
 * events; nothing is logged, since they are what the user said.
 */
internal object SpeechInput {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  /** Bumped per listen, so a late callback of an earlier one is ignored. */
  private var session = 0

  /** Some recognizer exists on this phone. */
  fun available(context: Context): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

  /**
   * The on-device recognizer failed for want of a language pack in this process; listens use the
   * default recognizer from then on.
   */
  @Volatile private var onDeviceUnusable = false

  /** The phone can recognise without the network. */
  fun onDevice(context: Context): Boolean =
    !onDeviceUnusable &&
      Build.VERSION.SDK_INT >= 31 &&
      SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

  /**
   * Starts listening. `language` is a BCP 47 tag (null: the phone's); `maxMs` ends a listen that
   * never stops. Events: onSpeechState (`listening`, `speaking`, `ended`), onSpeechPartial,
   * onSpeechResult and onSpeechError, each with the listen's `session`.
   */
  fun start(context: Context, language: String?, maxMs: Long): Int {
    val id = ++session
    val app = context.applicationContext
    main.post {
      launch(app, id, language, onDevice(app))
      main.postDelayed({ if (session == id) recognizer?.stopListening() }, maxMs)
    }
    return id
  }

  /** One recognizer for listen `id`, on the device or the phone's default. Main thread only. */
  private fun launch(app: Context, id: Int, language: String?, useOnDevice: Boolean) {
    release()
    val engine = if (useOnDevice) {
      SpeechRecognizer.createOnDeviceSpeechRecognizer(app)
    } else {
      SpeechRecognizer.createSpeechRecognizer(app)
    }
    recognizer = engine
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
      .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, app.packageName)
    if (language != null) intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
    engine.setRecognitionListener(
      Listener(
        id,
        onDevice = useOnDevice,
        retryOffDevice = {
          // No language pack on the device: the same listen again with the default recognizer.
          onDeviceUnusable = true
          launch(app, id, language, useOnDevice = false)
        },
        languageMissing = {
          // Ask Android to fetch the pack, so a later listen can work (the user is told so).
          if (Build.VERSION.SDK_INT >= 33) {
            try {
              engine.triggerModelDownload(intent)
            } catch (e: Exception) {
              // Not every recognizer can download; the error still reaches JS.
            }
          }
        },
      ),
    )
    try {
      engine.startListening(intent)
    } catch (e: Exception) {
      emitError(id, "failed")
      release()
    }
  }

  /** Stops listening and keeps what was heard (a final result follows). */
  fun stop() = main.post { recognizer?.stopListening() }

  /** Stops and drops the listen: no result. */
  fun cancel() = main.post {
    session++
    recognizer?.cancel()
    release()
  }

  private fun release() {
    recognizer?.destroy()
    recognizer = null
  }

  private fun emit(name: String, id: Int, fill: Bundle.() -> Unit = {}) {
    AsterEvents.emit(name, Bundle().apply { putInt("session", id); fill() })
  }

  private fun emitError(id: Int, kind: String) = emit("onSpeechError", id) { putString("kind", kind) }

  private class Listener(
    private val id: Int,
    private val onDevice: Boolean,
    private val retryOffDevice: () -> Unit,
    private val languageMissing: () -> Unit,
  ) : RecognitionListener {
    private fun current() = id == session

    override fun onReadyForSpeech(params: Bundle?) {
      if (current()) emit("onSpeechState", id) { putString("state", "listening") }
    }

    override fun onBeginningOfSpeech() {
      if (current()) emit("onSpeechState", id) { putString("state", "speaking") }
    }

    override fun onEndOfSpeech() {
      if (current()) emit("onSpeechState", id) { putString("state", "ended") }
    }

    override fun onPartialResults(partialResults: Bundle?) {
      if (!current()) return
      val text = SpeechText.best(partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION))
      if (text.isNotEmpty()) emit("onSpeechPartial", id) { putString("text", text) }
    }

    override fun onResults(results: Bundle?) {
      if (!current()) return
      val text = SpeechText.best(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION))
      if (text.isEmpty()) emitError(id, "no-speech") else emit("onSpeechResult", id) { putString("text", text) }
      main.post { if (current()) release() }
    }

    override fun onError(error: Int) {
      if (!current()) return
      if (SpeechText.retryOffDevice(error, onDevice)) {
        main.post { if (current()) retryOffDevice() }
        return
      }
      if (SpeechText.errorKind(error) == "language") languageMissing()
      emitError(id, SpeechText.errorKind(error))
      main.post { if (current()) release() }
    }

    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEvent(eventType: Int, params: Bundle?) = Unit
  }
}
