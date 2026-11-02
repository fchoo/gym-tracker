package expo.modules.kotlin.functions
import expo.modules.kotlin.modules.AsyncBuilder
@Suppress("UNCHECKED_CAST")
infix fun <T,R> AsyncBuilder.Coroutine(fn:suspend (T)->R):AsyncBuilder=apply { body={ fn(it as T) } }
