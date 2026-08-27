import {
  AndroidConfig,
  ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
} from 'expo/config-plugins';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fullBackupContent = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="database" path="." />
  <exclude domain="root" path="backup-staging" />
  <exclude domain="root" path="plaintext-staging" />
  <exclude domain="file" path="backup-staging" />
  <exclude domain="file" path="plaintext-staging" />
  <exclude domain="external" path="backup-staging" />
  <exclude domain="external" path="plaintext-staging" />
</full-backup-content>
`;

const dataExtractionRules = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="database" path="." />
    <exclude domain="root" path="backup-staging" />
    <exclude domain="root" path="plaintext-staging" />
    <exclude domain="file" path="backup-staging" />
    <exclude domain="file" path="plaintext-staging" />
    <exclude domain="external" path="backup-staging" />
    <exclude domain="external" path="plaintext-staging" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="database" path="." />
    <exclude domain="root" path="backup-staging" />
    <exclude domain="root" path="plaintext-staging" />
    <exclude domain="file" path="backup-staging" />
    <exclude domain="file" path="plaintext-staging" />
    <exclude domain="external" path="backup-staging" />
    <exclude domain="external" path="plaintext-staging" />
  </device-transfer>
</data-extraction-rules>
`;

const withAndroidBackupRules: ConfigPlugin = (config) => {
  config = withAndroidManifest(config, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults,
    );
    application.$['android:allowBackup'] = 'true';
    application.$['android:fullBackupContent'] = '@xml/backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return manifestConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const xmlDirectory = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await mkdir(xmlDirectory, { recursive: true });
      await Promise.all([
        writeFile(path.join(xmlDirectory, 'backup_rules.xml'), fullBackupContent),
        writeFile(
          path.join(xmlDirectory, 'data_extraction_rules.xml'),
          dataExtractionRules,
        ),
      ]);
      return modConfig;
    },
  ]);
};

export default withAndroidBackupRules;
