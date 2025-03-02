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
      export class PasswordLogin {}
    `;
    const constantsCode = `
      export const LOGIN_PAGE = "login/PasswordLogin";
    `;
    const mainFilePath = createTempFile(mainCode);
    const constantsFilePath = join(dirname(mainFilePath), 'constants.ts');
    writeFileSync(constantsFilePath, constantsCode, 'utf-8');

    const parser = new DecoratorParser(mainFilePath);
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
    const constantsFilePath = join(dirname(mainFilePath), 'class_constants.ts');
    writeFileSync(constantsFilePath, constantsCode, 'utf-8');

    const parser = new DecoratorParser(mainFilePath);
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

  it('should parse AppRouter with external module class constant in ets', () => {
    const mainCode = `
      import { RouterConstants } from 'external-package';
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
    const nodeModulesDir = join(tempDir, 'node_modules', 'external-package');
    const constantsFilePath = join(nodeModulesDir, 'index.ets');

    require('fs').mkdirSync(nodeModulesDir, { recursive: true });
    writeFileSync(constantsFilePath, constantsCode, 'utf-8');

    const parser = new DecoratorParser(mainFilePath);
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
      import { RouterConstants } from 'external-package';
      @AppRouter({ name: RouterConstants.LOGIN_PAGE, hasParam: true, paramName: "userId" })
      @Compent
      export class PasswordLogin {}
    `;
    const indexCode = `
      export { RouterConstants } from './constants';
    `;
    const constantsCode = `
      export class RouterConstants {
        public static readonly LOGIN_PAGE: string = "login/PasswordLogin";
      }
    `;
    const mainFilePath = createTempFile(mainCode);
    const tempDir = dirname(mainFilePath);
    const nodeModulesDir = join(tempDir, 'node_modules', 'external-package');
    const indexFilePath = join(nodeModulesDir, 'index.ets');
    const constantsFilePath = join(nodeModulesDir, 'constants.ets');

    require('fs').mkdirSync(nodeModulesDir, { recursive: true });
    writeFileSync(indexFilePath, indexCode, 'utf-8');
    writeFileSync(constantsFilePath, constantsCode, 'utf-8');

    const parser = new DecoratorParser(mainFilePath);
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