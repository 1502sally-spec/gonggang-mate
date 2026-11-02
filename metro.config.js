// 웹 브라우저로 실행할 때 expo-sqlite(로그인 유지 저장소)의 .wasm 파일을 읽을 수 있게 한다. 휴대폰 실행에는 영향 없음
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
module.exports = config;
