/** 저장소 전체의 공통 lint 규칙. 생성물·로컬 데이터는 소스 검사에서 제외한다. */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'data/**', '**/*.tsbuildinfo'] },
  // 일반 JS → TypeScript → Vue 순서로 규칙을 합쳐 각 문법의 기본 오류를 잡는다.
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.{ts,js,mjs,vue}'],
    // frontend와 backend를 함께 검사한다. 실제 런타임 경계는 각 tsconfig가 검증한다.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    // 인터페이스상 필요한 미사용 매개변수는 _ 접두사로 의도를 명시한다.
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  // Vue parser가 SFC 구조를 읽고 script 내부의 TypeScript는 TS parser에 위임한다.
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] } } },
];
