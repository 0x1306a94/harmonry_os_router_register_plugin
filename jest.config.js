// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'], // 使用 <rootDir> 确保从项目根目录查找
  moduleFileExtensions: ['ts', 'js'],
};