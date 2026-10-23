package com.chaquo.python;
import java.util.*;
/** NON-NATIVE fake of the documented 17.0.0 signatures, never runtime evidence. */
public class PyObject extends AbstractMap<String,PyObject> {
 public Set<Map.Entry<String,PyObject>> entrySet(){return Collections.emptySet();}
 public boolean equals(Object o){return o instanceof PyObject && kind.equals(((PyObject)o).kind) && Objects.equals(value,((PyObject)o).value);}
 public int hashCode(){return Objects.hash(kind,value);}
 public final Object value; private final String kind;
 private static final Map<String,PyObject> TYPES=new HashMap<>();
 public PyObject(Object value,String kind){this.value=value;this.kind=kind;}
 public static PyObject of(Object value){
  if(value==null)return null;
  if(value instanceof PyObject)return (PyObject)value;
  if(value instanceof Map){Map<PyObject,PyObject> m=new LinkedHashMap<>();for(Object o:((Map)value).entrySet()){Map.Entry e=(Map.Entry)o;m.put(of(e.getKey()),of(e.getValue()));}return new PyObject(m,"dict");}
  if(value instanceof List){List<PyObject> l=new ArrayList<>();for(Object v:(List)value)l.add(of(v));return new PyObject(l,"list");}
  return new PyObject(value,value instanceof Boolean?"bool":value instanceof Integer||value instanceof Long?"int":value instanceof Double?"float":value instanceof String?"str":value instanceof byte[]?"bytes":"unsupported");
 }
 public static PyObject fromJava(Object v){return v instanceof Map||v instanceof List||v instanceof byte[]?new PyObject(v,"java-proxy"):of(v);}
 public PyObject type(){return TYPES.computeIfAbsent(kind,k->new PyObject(k,"type"));}
 public PyObject get(Object name){return TYPES.computeIfAbsent((String)name,k->new PyObject(k,"type"));}
 public Map<PyObject,PyObject> asMap(){if(!kind.equals("dict"))throw new UnsupportedOperationException();return (Map<PyObject,PyObject>)value;}
 public List<PyObject> asList(){if(!kind.equals("list"))throw new UnsupportedOperationException();return (List<PyObject>)value;}
 public boolean toBoolean(){if(!kind.equals("bool"))throw new ClassCastException();return (Boolean)value;}
 public long toLong(){if(!kind.equals("int"))throw new ClassCastException();return ((Number)value).longValue();}
 public double toDouble(){if(!kind.equals("float"))throw new ClassCastException();return ((Number)value).doubleValue();}
 public <T>T toJava(Class<T> target){if(kind.equals("dict")||kind.equals("list"))throw new ClassCastException("python_container_not_java_proxy");return target.cast(value);}
 public PyObject callAttr(String name,Object... args){
  if(kind.equals("builtins")){
   if(name.equals("dict"))return of(new LinkedHashMap<>());
   if(name.equals("list"))return of(new ArrayList<>());
   if(name.equals("bytes")){List<PyObject> l=((PyObject)args[0]).asList();byte[] b=new byte[l.size()];for(int i=0;i<b.length;i++){long v=l.get(i).toLong();if(v<0||v>255)throw new IllegalArgumentException();b[i]=(byte)v;}return of(b);}
  }
  if(kind.equals("garmin_transport_readiness") && name.equals("probe")){
   if(args.length!=0)throw new AssertionError("must_be_credential_free");
   Python.dispatchCount++;
   return of(Python.result);
  }
  if(kind.equals("garmin_bridge")){
   if(name.equals("take_persistable_tokens"))return of(Python.tokens);
   if(name.equals("evidence_rejections"))return of(Map.of("operation_rejection","operation_rejected","arguments_rejection","arguments_rejected"));
   if(name.equals("evidence_recovery_extensions"))return of(List.of(Map.of("id","PH18-ADV-401","code","sign_in_required","call_count",2)));
   if(name.equals("dispatch")){
    PyObject a=args[1] instanceof PyObject?(PyObject)args[1]:fromJava(args[1]);
    if(!a.kind.equals("dict"))throw new IllegalArgumentException("arguments_rejected_before_factory");
    Python.acceptedArguments=a;Python.dispatchCount++;
    if(args[0].equals("runtimeInfo"))return of(Python.runtimeInfo());
    return of(Python.result);
   }
  }
  throw new IllegalArgumentException("fixed_builtin_only");
 }
}
