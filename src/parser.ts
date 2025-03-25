import * as ts from 'typescript';
import fs, { close } from "node:fs";
import { readFileSync } from 'fs';
import { AnalyzeResult, appRouterAnnotation, ScanFileParam } from './types';
import { resolve, dirname } from 'path';
import JSON5 from 'json5';

import { Logger } from './logger';

/*

  在线ast查看器
  https://ts-ast-viewer.com/#code/KYDwDg9gTgLgBAbzgGQPIHECSA5A+gBQEF0BRAGgAlUBZEg4kuAXzgDMoIBbOAcgDoA9AGMIAOwDOMAIaiY4ngG4AUAEtOkWIhQYc9UszYdu-YWMky5i1eujw0WPEX2GuvQSInTZ85Wo3wkACUIAFcYYCgAYTMvOQN2Vx4AAQBrFNNOTjErP1s4YLCI6M8LcRdjVPSRTOzlJMIwMALwqAAKJFEpTmAALm0HPXI4AAspcXwpKC6+mCgQ4DI4MEmu7C7euAAiEPEIzAATTeYASiVQfzhJOaF4CfFxAHdofeQIAHMVUUQmJSV6xuaEXacE63T6gKiMVKfHsuicQ1G4xWnBmcwWS2RazBWx2e0OJz+0RsomAsjO4DyVxCNzgAGVqLTXh8vggfr9-k1Qi1gaCNjxYdgeItERMpii4LN5otlmKsRttrsoAcjkxTuc8kIADZjMoANX1uqZn2+QA
  
  对于下面示例
  
  @AppRouter({ name: LOGIN_PAGE, hasParam: true, paramName: "userId" })
  export struct PasswordLogin {}
  
  ast 顺序为 对应状态变化 INIT -> PARSE_DECORATORS -> FIND_STRUCT -> INIT
    - SourceFile
        - MissingDeclaration
            - Decorator
        - ExpressionStatement 'struct'
        - ExpressionStatement 'PasswordLogin'

  @AppRouter({ name: LOGIN_PAGE, hasParam: true, paramName: "userId" })
  export class PasswordLogin {}

  ast 顺序为 对应状态变化 INIT -> FIND_CLASS -> PARSE_DECORATORS -> INIT
    - SourceFile
        - ClassDeclaration
            - Decorator


 */

enum ParserState {
    INIT,
    FIND_STRUCT,
    FIND_CLASS,
    PARSE_DECORATORS,
}

class Stack<T> {
    private items: T[] = [];
    push(item: T): void {
        this.items.push(item);
    }

    pop(): T | undefined {
        return this.items.pop();
    }

    peek(): T | undefined {
        return this.items[this.items.length - 1];
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }

    size(): number {
        return this.items.length;
    }
}


export class DecoratorParser {
    private modulePath: string;
    private filePath: string;
    private results: AnalyzeResult[] = [];
    private importedFiles: Map<Array<string>, string> = new Map();
    private exportedRedirects: Map<Array<string>, string> = new Map();
    private fileParam: ScanFileParam | undefined = undefined;

    private state: ParserState = ParserState.INIT;
    private stack: Stack<AnalyzeResult> = new Stack();

    private abort = false;

    constructor(modulePath: string, filePath: string, fileParam?: ScanFileParam) {
        this.modulePath = modulePath;
        this.filePath = filePath;
        this.fileParam = fileParam;
    }

    public parse(): AnalyzeResult[] {
        const sourceCode = readFileSync(this.filePath, "utf-8");
        const sourceFile = ts.createSourceFile(
            this.filePath,
            sourceCode,
            ts.ScriptTarget.ES2021,
            false
        );

        ts.forEachChild(sourceFile, (node: ts.Node) => {
            try {
                this.resolveNode(node);
            } catch (e) {
                Logger.error('forEachChild error: ', e);
            }
        });

        return this.results;
    }

    private resolveNode(node: ts.Node) {
        if (this.abort) return;
        if (ts.isClassDeclaration(node)) {
            this.resolveClassDeclaration(node);
        } else if (node.kind === ts.SyntaxKind.Decorator) {
            this.parseDecorator(node as ts.Decorator);
        } else if (node.kind === ts.SyntaxKind.ImportDeclaration) {
            this.resolveImportDeclaration(node as ts.ImportDeclaration);
        } else if (node.kind === ts.SyntaxKind.ExportDeclaration) {
            this.resolveExportDeclaration(node as ts.ExportDeclaration);
        } else if (node.kind === ts.SyntaxKind.Identifier) {
            this.resolveIdentifier(node as ts.Identifier);
        }
        if (this.abort) return;
        ts.forEachChild(node, (child) => this.resolveNode(child));
    }

    private resolveIdentifier(node: ts.Identifier) {
        if (this.state == ParserState.FIND_STRUCT && node.escapedText) {
            let result = this.stack.peek();
            if (result) {
                result.componentName = node.escapedText;
                this.results.push(result);
            }
            this.state = ParserState.INIT;
            return;
        }

        if (node.escapedText == 'struct' && this.state == ParserState.PARSE_DECORATORS) {
            this.state = ParserState.FIND_STRUCT;
        }
    }

    private resolveImportDeclaration(node: ts.ImportDeclaration) {
        const names: Array<string> = new Array();
        if (node.importClause?.namedBindings == undefined && node.importClause?.name != undefined) {
            // import MyModule from './MyModule';
            if (ts.isIdentifier(node.importClause.name)) {
                names.push(node.importClause.name.escapedText ?? "")
            }
        } else {
            node.importClause?.namedBindings?.forEachChild(child => {
                if (ts.isImportSpecifier(child)) {
                    // import { ExportedItem1, ExportedItem2 } from './MyModule';
                    // import { ExportedItem as RenamedItem } from './MyModule';
                    if (ts.isIdentifier(child.name)) {
                        names.push(child.name.escapedText ?? "")
                    }
                } else if (ts.isNamespaceImport(child)) {
                    // import * as MyModule from './MyModule';
                    const node = child as ts.NamespaceImport
                    if (ts.isIdentifier(node.name)) {
                        names.push(node.name.escapedText ?? "")
                    }
                }

            });
        }
        Logger.info("resolveImportDeclaration moduleSpecifier: ", node.moduleSpecifier.kind, names)
        if (ts.isStringLiteral(node.moduleSpecifier)) {
            if (names.length > 0) {
                this.importedFiles.set(names, node.moduleSpecifier.text)
                Logger.info(`resolveImportDeclaration importedFiles k-v: ${names} : ${node.moduleSpecifier.text}`)

            }
        }
    }

    private resolveExportDeclaration(node: ts.ExportDeclaration) {
        if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;

        const names: Array<string> = new Array();

        const modulePath = node.moduleSpecifier.text;
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            node.exportClause.elements.forEach((element) => {
                const name = element.propertyName?.text || element.name.text;
                names.push(name);
            });
        }

        Logger.info('resolveExportDeclaration moduleSpecifier:', node.moduleSpecifier.kind, names);
        if (ts.isStringLiteral(node.moduleSpecifier)) {
            if (names.length > 0) {
                this.exportedRedirects.set(names, node.moduleSpecifier.text)
                Logger.info(`resolveExportDeclaration exportedRedirects k-v: ${names} : ${node.moduleSpecifier.text}`)

            }
        }

        if (this.fileParam && this.fileParam.indexed) {
            for (const [key, value] of this.exportedRedirects) {
                if (key.includes(this.fileParam.className)) {
                    this.fileParam.absolutePath = resolve(this.modulePath, modulePath);
                    Logger.info('resolveExportDeclaration fileParam:', this.fileParam);
                    if (this.fileParam.absolutePath.length > 0) {
                        this.abort = true;
                        return;
                    }
                }
            }

        }
    }

    private parseDecorator(decorator: ts.Decorator) {
        if (![ParserState.INIT, ParserState.FIND_CLASS].includes(this.state)) return;

        const expression = decorator.expression;
        if (!ts.isCallExpression(expression)) return;

        const identifier = expression.expression;
        if (!ts.isIdentifier(identifier) || !appRouterAnnotation.annotations.includes(identifier.text)) return;

        if (expression.arguments.length === 0) return;
        const arg = expression.arguments[0];
        let result: AnalyzeResult;
        if (this.state == ParserState.INIT) {
            result = new AnalyzeResult();
            result.filePath = this.filePath;
            this.stack.push(result);
        } else {
            result = this.stack.pop()!;
        }
        const isParsed = this.parseAppRouterArgs(arg, result);
        if (isParsed && this.state === ParserState.FIND_CLASS) {
            this.results.push(result);
            this.state = ParserState.INIT;
            return;

        } else if (isParsed && this.state === ParserState.INIT) {
            this.state = ParserState.PARSE_DECORATORS;
        }
        return;
    }

    private resolveClassDeclaration(node: ts.ClassDeclaration) {

        let result = new AnalyzeResult();
        result.componentName = node.name?.escapedText as string;
        result.filePath = this.filePath;
        this.stack.push(result);
        Logger.info('resolveClassDeclaration:', node.name?.escapedText);
        this.state = ParserState.FIND_CLASS;


        if (this.fileParam && node.name?.escapedText == this.fileParam.className) {
            node?.members?.forEach((member) => {
                if (ts.isPropertyDeclaration(member) && member.name
                    && ts.isIdentifier(member.name)) {
                    if (member.name.escapedText == this.fileParam?.attrName && member.initializer && ts.isStringLiteral(member.initializer)) {
                        this.fileParam.attValue = member.initializer.text
                    }
                }
            })
        }
    }

    private parseAppRouterArgs(arg: ts.Expression, result: AnalyzeResult): boolean {
        if (!ts.isObjectLiteralExpression(arg)) return false;
        arg.properties.forEach((prop) => {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                const propName = prop.name.text;
                let value: string | boolean | undefined;

                if (propName === appRouterAnnotation.name) {
                    let importedvalue = false;
                    if (ts.isIdentifier(prop.initializer)) {
                        for (const [key, value] of this.importedFiles) {
                            if (key.includes(prop.initializer.text)) {
                                importedvalue = true;
                            }
                        }
                    }

                    if (importedvalue && ts.isIdentifier(prop.initializer)) {
                        value = this.resolveImportedConstant(prop.initializer.text);
                    } else if (ts.isPropertyAccessExpression(prop.initializer)) {
                        value = this.resolveConstant(prop.initializer);
                    } else {
                        value = this.getLiteralValue(prop.initializer);
                    }
                } else {
                    value = this.getLiteralValue(prop.initializer);
                }

                switch (propName) {
                    case appRouterAnnotation.name:
                        result.name = value as string;
                        break;
                    case appRouterAnnotation.login:
                        result.login = value as boolean;
                        break;
                    case appRouterAnnotation.hasParam:
                        result.hasParam = value as boolean;
                        break;
                    case appRouterAnnotation.paramName:
                        result.paramName = value as string;
                        break;
                }
            }
        });
        return (result.name?.length || 0) > 0;
    }


    private resolveImportedConstant(identifier: string): string | undefined {
        Logger.info(`resolveImportedConstant ${identifier} importedFiles: ${this.importedFiles}`);
        let path: string | undefined = undefined;
        for (const [key, value] of this.importedFiles) {
            if (key.includes(identifier)) {
                path = value;
            }
        }
        if (!path) return undefined;
        Logger.info(`resolveImportedConstant ${identifier} path: ${path}`);

        let absolutePath = resolve(this.modulePath, path);
        if (!absolutePath) return undefined;
        absolutePath = absolutePath.endsWith('.ets') ? absolutePath : (absolutePath + '.ets');
        Logger.info(`resolveImportedConstant ${identifier} absolutePath: ${absolutePath}`);

        try {
            const targetCode = readFileSync(absolutePath, 'utf-8');
            const targetFile = ts.createSourceFile(
                absolutePath,
                targetCode,
                ts.ScriptTarget.ES2021,
                false
            );

            let constantValue: string | undefined;
            ts.forEachChild(targetFile, (node) => {
                if (ts.isVariableStatement(node)) {
                    node.declarationList.declarations.forEach((decl) => {
                        if (ts.isIdentifier(decl.name) && decl.name.text === identifier && decl.initializer) {
                            constantValue = this.getLiteralValue(decl.initializer) as string;
                        }
                    });
                }
            });
            return constantValue;
        } catch (e) {
            Logger.error(`Failed to resolve imported constant ${identifier} in ${absolutePath}:`, e);
            return undefined;
        }

    }

    private resolveConstant(initializer: ts.PropertyAccessExpression): string | undefined {
        const fileParam = new ScanFileParam()
        fileParam.indexed = false;
        let constValue = ""
        if (ts.isIdentifier(initializer.expression)) {
            fileParam.className = initializer.expression.escapedText ?? ""
        }
        if (ts.isIdentifier(initializer.name)) {
            fileParam.attrName = initializer.name.escapedText ?? ""
        }

        Logger.info(`resolveConstant: className: ${fileParam.className} attrName: ${fileParam.attrName} importedFiles: ${JSON.stringify(this.importedFiles, null, '\t')}`);

        for (const [key, value] of this.importedFiles) {
            if (key.includes(fileParam.className)) {
                fileParam.importPath = value
                fileParam.absolutePath = this.getImportAbsolutePathByOHPackage(value, fileParam);
                if (fileParam.importPath.length > 0 && fileParam.absolutePath.length > 0) {
                    const parser = new DecoratorParser(this.modulePath, fileParam.absolutePath, fileParam);
                    const results = parser.parse();
                    Logger.info('resolveConstant results:', fileParam);
                    if (fileParam.attValue.length > 0) {
                        return fileParam.attValue;
                    }
                }
            }
        }

        return undefined;
    }



    private getLiteralValue(expr: ts.Expression): string | boolean | undefined {
        if (ts.isStringLiteral(expr)) {
            return expr.text;
        }
        if (expr.kind === ts.SyntaxKind.TrueKeyword) {
            return true;
        }
        if (expr.kind === ts.SyntaxKind.FalseKeyword) {
            return false;
        }
        return undefined;
    }

    private getImportAbsolutePathByOHPackage(packageName: string, fileParam: ScanFileParam): string {
        Logger.info('getImportAbsolutePathByOHPackage:', packageName);
        if (packageName.startsWith('.')) {
            const path = resolve(this.modulePath, packageName);
            return path.endsWith('.ets') ? path : (path + '.ets');
        }

        const packagePath = `${this.modulePath}/oh-package.json5`;
        Logger.info('getImportAbsolutePathByOHPackage packagePath:', packagePath);
        if (!fs.existsSync(packagePath)) {
            return "";
        }
        const data = fs.readFileSync(packagePath, { encoding: "utf8" })
        const json = JSON5.parse(data)
        Logger.info('getImportAbsolutePathByOHPackage json:', json);
        const dependencies = json.dependencies || {}
        let path = dependencies[packageName]
        if (path.startsWith('file:')) { // local package
            path = path.replace('file:', '');
        }

        const newfileParam = Object.assign({}, fileParam);
        newfileParam.indexed = true;
        const index = resolve(this.modulePath, path) + '/Index.ets';
        const parser = new DecoratorParser(dirname(index), index, newfileParam);
        const results = parser.parse();
        Logger.info('getImportAbsolutePathByOHPackage index results:', newfileParam);
        if (newfileParam.absolutePath.length > 0) {
            return newfileParam.absolutePath.endsWith('.ets') ? newfileParam.absolutePath : (newfileParam.absolutePath + '.ets');
        }
        return "";
    }
}