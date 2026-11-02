package expo.modules.kotlin.modules
import android.content.Context
import android.app.Activity
import kotlinx.coroutines.CoroutineScope
open class Module { val appContext=AppContext();open fun definition(): Definition=Definition() }
class AppContext {var reactContext: Context?=null;var currentActivity: Activity?=null;val backgroundCoroutineScope: CoroutineScope get()=throw IllegalArgumentException("host_only")}
class Definition {var name="";val functions=mutableMapOf<String,AsyncBuilder>()}
class DefinitionBuilder {val definition=Definition(); fun Name(name:String){definition.name=name};fun AsyncFunction(name:String)=AsyncBuilder().also { definition.functions[name]=it }}
class AsyncBuilder {var body:suspend (Any?)->Any?={null};fun <T> SuspendBody(fn:suspend ()->T)=apply { body={fn()} };fun runOnQueue(scope:CoroutineScope)=this}
fun ModuleDefinition(body:DefinitionBuilder.()->Unit):Definition=DefinitionBuilder().apply(body).definition
