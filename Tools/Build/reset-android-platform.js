#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const platformRoot = path.join(projectRoot, 'Platforms', 'Android');
const generatedAndroid = path.join(platformRoot, 'android');
const expectedPrefix = `${platformRoot}${path.sep}`;

if (path.resolve(generatedAndroid) !== generatedAndroid || !generatedAndroid.startsWith(expectedPrefix)) throw new Error(`허용되지 않은 Android 초기화 경로: ${generatedAndroid}`);
if (!process.argv.includes('--reset-existing')) throw new Error('생성 Android 프로젝트 초기화에는 --reset-existing 인자가 필요합니다.');
if (!fs.existsSync(generatedAndroid)) {
  console.log('[ANDROID RESET] 생성된 android/ 폴더가 없어 초기화할 내용이 없습니다.');
  process.exit(0);
}
if (!fs.existsSync(path.join(generatedAndroid, 'gradlew.bat'))) throw new Error(`Gradle 래퍼가 없는 폴더는 초기화하지 않습니다: ${generatedAndroid}`);
fs.rmSync(generatedAndroid, { recursive: true, force: true });
console.log(`[ANDROID RESET] 재생성 가능한 Android 플랫폼을 초기화했습니다: ${generatedAndroid}`);
