package com.chaquo.python;
import java.util.*;
public class Python {
 public static Object result=Map.of("status","ok","generation",1,"data",Map.of("kind","disconnected"));
 public static byte[] tokens=null; public static PyObject acceptedArguments;public static int dispatchCount=0;
 public static boolean started=true;public static ArrayDeque<Boolean> startedSequence=new ArrayDeque<>();
 public static class Platform{}
 private static final Python INSTANCE=new Python();
 public static synchronized Python getInstance(){return INSTANCE;}
 public static synchronized boolean isStarted(){return startedSequence.isEmpty()?started:startedSequence.removeFirst();}
 public static synchronized void start(Platform platform){started=true;}
 public PyObject getModule(String name){return new PyObject(null,name);}
 public static Map<String,Object> runtimeInfo(){return Map.of("schemaVersion",1,"pythonVersion","3.13","clientVersion","0.3.17","clientCommit","218e72ca5459e014435fc2d94fd18bd601fa0c14","abi","arm64-v8a","capabilities",List.of("runtimeInfo"));}
}
