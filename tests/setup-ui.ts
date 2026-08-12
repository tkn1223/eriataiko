import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// テストごとに画面を片付ける。前のテストの残りが次に影響しないように。
afterEach(() => {
  cleanup();
});
