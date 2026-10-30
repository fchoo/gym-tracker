package gymtracker.maestrosafe;

import java.io.File;
import java.io.FileOutputStream;
import org.jacoco.core.analysis.Analyzer;
import org.jacoco.core.analysis.CoverageBuilder;
import org.jacoco.core.tools.ExecFileLoader;
import org.jacoco.report.DirectorySourceFileLocator;
import org.jacoco.report.IReportVisitor;
import org.jacoco.report.xml.XMLFormatter;

/** Host coverage projection only; never a native acceptance reporter. */
public final class CoverageReport {
    public static void main(String[] args) throws Exception {
        ExecFileLoader execution = new ExecFileLoader();
        execution.load(new File(args[0]));
        CoverageBuilder coverage = new CoverageBuilder();
        new Analyzer(execution.getExecutionDataStore(), coverage).analyzeAll(new File(args[1]));
        try (FileOutputStream output = new FileOutputStream(args[3])) {
            IReportVisitor visitor = new XMLFormatter().createVisitor(output);
            visitor.visitInfo(execution.getSessionInfoStore().getInfos(), execution.getExecutionDataStore().getContents());
            visitor.visitBundle(coverage.getBundle("maestro-safe-sdk"), new DirectorySourceFileLocator(new File(args[2]), "UTF-8", 4));
            visitor.visitEnd();
        }
    }
}
