#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageName = 'com.fchoo.gymtracker.devtest';
const invalid = () => { throw new Error('devtest_native_access_invalid'); };

export function validateCompiledDevtestBadging(contents) {
  const packages = contents.match(/^package:.*$/gmu) ?? [];
  const applications = contents.match(/^application:.*$/gmu) ?? [];
  const debugFlags = contents.match(/^application-debuggable.*$/gmu) ?? [];
  if (packages.length !== 1
    || packages[0].match(/^package: name='([^']+)' versionCode='[0-9]+' versionName='[^']*'(?:\s|$)/u)?.[1] !== packageName
    || applications.length !== 1
    || !/^application: label='[^']*' icon='[^']*'$/u.test(applications[0])
    || debugFlags.length !== 1 || debugFlags[0] !== 'application-debuggable') invalid();
}

export function validateReleaseBuildConfig(contents) {
  const source = contents.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '');
  const debugDeclarations = source.match(/\bboolean\s+DEBUG\s*=[^;]*;/gu) ?? [];
  if (!/^\s*package com\.fchoo\.gymtracker\.devtest;\s*$/mu.test(source)
    || debugDeclarations.length !== 1 || debugDeclarations[0] !== 'boolean DEBUG = false;'
    || !/\bString APPLICATION_ID = "com\.fchoo\.gymtracker\.devtest";/u.test(source)
    || !/\bString BUILD_TYPE = "release";/u.test(source)) invalid();
}

export function validateDevelopmentTestNativeAccess({ apkPath, androidRoot, androidHome }) {
  try {
    const buildConfig = path.join(androidRoot,
      'app/build/generated/source/buildConfig/release/com/fchoo/gymtracker/devtest/BuildConfig.java');
    validateReleaseBuildConfig(readFileSync(buildConfig, 'utf8'));
    const buildTools = path.join(androidHome, 'build-tools/36.0.0');
    const tool = ['aapt', 'aapt2'].map(name => path.join(buildTools, name)).find(candidate => {
      try { accessSync(candidate, constants.X_OK); return true; } catch { return false; }
    });
    if (tool === undefined) invalid();
    const badging = execFileSync(tool, ['dump', 'badging', apkPath], {
      encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    validateCompiledDevtestBadging(badging);
  } catch { invalid(); }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    validateDevelopmentTestNativeAccess({ apkPath: process.argv[2], androidRoot: process.argv[3],
      androidHome: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT });
  } catch {
    process.stderr.write('validate-development-test-native-access: invalid native access capability.\n');
    process.exitCode = 1;
  }
}
