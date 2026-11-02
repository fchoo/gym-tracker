import java.io.*;
import org.jacoco.core.analysis.*;
import org.jacoco.core.tools.ExecFileLoader;
import org.jacoco.report.*;
import org.jacoco.report.xml.XMLFormatter;
public class Report {
 public static void main(String[] a) throws Exception {
  ExecFileLoader exec=new ExecFileLoader(); exec.load(new File(a[0]));
  CoverageBuilder builder=new CoverageBuilder(); Analyzer analyzer=new Analyzer(exec.getExecutionDataStore(),builder);
  analyzer.analyzeAll(new File(a[1]));
  IReportVisitor report=new XMLFormatter().createVisitor(new FileOutputStream(a[3]));
  report.visitInfo(exec.getSessionInfoStore().getInfos(),exec.getExecutionDataStore().getContents());
  report.visitBundle(builder.getBundle("NON_NATIVE_HOST_ALL_COMPILED_CLASSES"),new DirectorySourceFileLocator(new File(a[2]),"UTF-8",2));
  report.visitEnd();
 }
}
