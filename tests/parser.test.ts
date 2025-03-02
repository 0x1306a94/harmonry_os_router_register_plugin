import { DecoratorParser } from '../src/parser';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';

function createTempFile(content: string, ext: string = '.ts'): string {
  const tempFilePath = join(tmpdir(), `test-${Date.now()}${ext}`);
  writeFileSync(tempFilePath, content, 'utf-8');
  return tempFilePath;
}

describe('DecoratorParser with Constants', () => {
  it('should parse AppRouter with local constant', () => {
    const mainCode = `
      import { LOGIN_PAGE } from './constants';
      @AppRouter({ name: LOGIN_PAGE, hasParam: true, paramName: "userId" })
      export struct PasswordLogin {}
    `;
    const constantsCode = `
      export const LOGIN_PAGE = "login/PasswordLogin";
    `;
    const mainFilePath = createTempFile(mainCode);
    const tempDir = dirname(mainFilePath);
    const constantsFilePath = join(tempDir, 'constants.ets');
    writeFileSync(constantsFilePath, constantsCode, 'utf-8');

    const parser = new DecoratorParser(tempDir, mainFilePath);
    const results = parser.parse();
    console.log('results:', results);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      name: 'login/PasswordLogin',
      componentName: 'PasswordLogin',
      filePath: mainFilePath,
      login: false,
      hasParam: true,
      paramName: 'userId',
    });
  });

  return;

  it('should parse AppRouter with local class constant', () => {
    const mainCode = `
      import { RouterConstants } from './class_constants';
      @AppRouter({ name: RouterConstants.LOGIN_PAGE, hasParam: true, paramName: "userId" })
      export class PasswordLogin {}
    `;
    const constantsCode = `
      export class RouterConstants {
        public static readonly LOGIN_PAGE: string = "login/PasswordLogin";
      }
    `;
    const mainFilePath = createTempFile(mainCode);
    const tempDir = dirname(mainFilePath);
    const constantsFilePath = join(tempDir, 'class_constants.ets');
    writeFileSync(constantsFilePath, constantsCode, 'utf-8');

    const parser = new DecoratorParser(tempDir, mainFilePath);
    const results = parser.parse();

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      name: 'login/PasswordLogin',
      componentName: 'PasswordLogin',
      filePath: mainFilePath,
      login: false,
      hasParam: true,
      paramName: 'userId',
    });
  });


  it('should parse AppRouter with external module redirected class constant in ets', () => {
    const mainCode = `
      import { RouterConstants } from '@kk/common';
      @AppRouter({ name: RouterConstants.LOGIN_PAGE, hasParam: true, paramName: "userId" })
      @Compent
      export class PasswordLogin {}
    `;

    const indexCode = `
      export { RouterConstants } from './src/main/ets/constants/RouterConstants';
    `;

    const constantsCode = `
      export class RouterConstants {
        public static readonly LOGIN_PAGE: string = "login/PasswordLogin";
      }
    `;


    const homePkCode = `
    {
      "name": "home",
      "version": "1.0.0",
      "description": "Please describe the basic information.",
      "main": "Index.ets",
      "author": "",
      "license": "Apache-2.0",
      "dependencies": {
        "@kk/common": "file:./common",
      }
    }
    `;

    const mainFilePath = createTempFile(mainCode);
    const tempDir = dirname(mainFilePath);

    const commonDir = join(tempDir, 'common');

    const pkgFilePath = join(tempDir, 'oh-package.json5');
    const indexFilePath = join(commonDir, 'index.ets');
    const constantsDir = join(commonDir, 'src', 'main', 'ets', 'constants');
    const constantsFilePath = join(constantsDir, 'RouterConstants.ets');

    require('fs').mkdirSync(constantsDir, { recursive: true });

    writeFileSync(pkgFilePath, homePkCode, 'utf-8');
    writeFileSync(indexFilePath, indexCode, 'utf-8');
    writeFileSync(constantsFilePath, constantsCode, 'utf-8');

    console.log('indexFilePath:', indexFilePath);
    console.log('constantsFilePath:', constantsFilePath);

    const parser = new DecoratorParser(tempDir, mainFilePath);
    const results = parser.parse();
    console.log('results:', results);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      name: 'login/PasswordLogin',
      componentName: 'PasswordLogin',
      filePath: mainFilePath,
      login: false,
      hasParam: true,
      paramName: 'userId',
    });
  });
  
});