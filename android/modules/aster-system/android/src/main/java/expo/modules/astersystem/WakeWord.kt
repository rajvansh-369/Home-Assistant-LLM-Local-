package expo.modules.astersystem

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import java.io.Closeable
import java.nio.FloatBuffer

/**
 * openWakeWord's three models on ONNX Runtime (docs/aster-voice-plan.md §6), loaded from the
 * module's assets: `wakeword/melspectrogram.onnx` and `wakeword/embedding_model.onnx`
 * (openWakeWord's shared feature models) and the keyword classifier, `wakeword/hey_aster.onnx`.
 * Until that model is trained, debug builds carry openWakeWord's pre-trained "hey jarvis" in the
 * debug source set (never in a release build).
 */
internal class WakeWord private constructor(
  private val env: OrtEnvironment,
  private val melSession: OrtSession,
  private val embedSession: OrtSession,
  private val keywordSession: OrtSession,
  /** The classifier's asset name, e.g. "hey_aster". */
  val keyword: String,
) : WakeModels, Closeable {

  companion object {
    private const val DIR = "wakeword"
    private val KEYWORDS = listOf("hey_aster", "hey_jarvis_v0.1")

    /** The keyword model this build carries, or null when it has none. */
    fun keywordIn(context: Context): String? {
      val assets = context.assets.list(DIR)?.toSet() ?: return null
      return KEYWORDS.firstOrNull { "$it.onnx" in assets }
    }

    /** Loads the models; null when they are missing or ONNX Runtime can't load them. */
    fun load(context: Context): WakeWord? {
      val keyword = keywordIn(context) ?: return null
      return try {
        val env = OrtEnvironment.getEnvironment()
        val options = OrtSession.SessionOptions().apply {
          setIntraOpNumThreads(1)
          setInterOpNumThreads(1)
        }
        fun session(name: String) =
          env.createSession(context.assets.open("$DIR/$name.onnx").use { it.readBytes() }, options)
        WakeWord(env, session("melspectrogram"), session("embedding_model"), session(keyword), keyword)
      } catch (e: Exception) {
        null
      } catch (e: UnsatisfiedLinkError) {
        null
      }
    }
  }

  private val melInput = melSession.inputNames.first()
  private val embedInput = embedSession.inputNames.first()
  private val keywordInput = keywordSession.inputNames.first()

  private fun run(session: OrtSession, input: String, data: FloatArray, shape: LongArray): Any =
    OnnxTensor.createTensor(env, FloatBuffer.wrap(data), shape).use { tensor ->
      session.run(mapOf(input to tensor)).use { result -> result[0].value }
    }

  /** Output [1, 1, frames, 32]. */
  @Suppress("UNCHECKED_CAST")
  override fun mel(samples: FloatArray): Array<FloatArray> {
    val out = run(melSession, melInput, samples, longArrayOf(1, samples.size.toLong()))
      as Array<Array<Array<FloatArray>>>
    return out[0][0]
  }

  /** Input [1, 76, 32, 1], output [1, 1, 1, 96]. */
  @Suppress("UNCHECKED_CAST")
  override fun embed(window: Array<FloatArray>): FloatArray {
    val flat = FloatArray(window.size * WakeRules.MEL_BINS)
    window.forEachIndexed { i, row -> row.copyInto(flat, i * WakeRules.MEL_BINS) }
    val out = run(
      embedSession, embedInput, flat,
      longArrayOf(1, window.size.toLong(), WakeRules.MEL_BINS.toLong(), 1),
    ) as Array<Array<Array<FloatArray>>>
    return out[0][0][0]
  }

  /** Input [1, 16, 96], output [1, 1]. */
  @Suppress("UNCHECKED_CAST")
  override fun score(embeddings: Array<FloatArray>): Float {
    val flat = FloatArray(embeddings.size * WakeRules.EMBEDDING_SIZE)
    embeddings.forEachIndexed { i, row -> row.copyInto(flat, i * WakeRules.EMBEDDING_SIZE) }
    val out = run(
      keywordSession, keywordInput, flat,
      longArrayOf(1, embeddings.size.toLong(), WakeRules.EMBEDDING_SIZE.toLong()),
    ) as Array<FloatArray>
    return out[0][0]
  }

  override fun close() {
    melSession.close()
    embedSession.close()
    keywordSession.close()
  }
}
