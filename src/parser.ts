import * as ts from 'typescript';
import fs, { close } from "node:fs";
import { readFileSync } from 'fs';
import { AnalyzeResult, appRouterAnnotation, ScanFileParam } from './types';
import { resolve, dirname } from 'path';
import JSON5 from 'json5';
import { join } from 'node:path';

export class DecoratorParser {
    private modulePath: string;
    private filePath: string;
    private results: AnalyzeResult[] = [];
    private importedFiles: Map<string[], string> = new Map();
    private exportedRedirects: Map<string, string> = new Map();
    private currentResult: AnalyzeResult = new AnalyzeResult();
    private fileParam: ScanFileParam | undefined = undefined;
    private structed: boolean = false;

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
                console.error('forEachChild error: ', e);
            }
        });

        return this.results;
    }

    private resolveNode(node: ts.Node) {
        // console.log('resolveNode:', node);
        if (ts.isClassDeclaration(node)) {
            this.resolveClassDeclaration(node);
        } else if (node.kind === ts.SyntaxKind.Decorator) {
            const success = this.parseDecorator(node as ts.Decorator);
            if (success && this.currentResult.componentName && this.currentResult.componentName.length > 0) {
                console.log('currentResult:', this.currentResult);
                this.results.push(this.currentResult);
            }
        } else if (node.kind === ts.SyntaxKind.ImportDeclaration) {
            this.resolveImportDeclaration(node as ts.ImportDeclaration);
        } else if (node.kind === ts.SyntaxKind.ExportDeclaration) {
            this.resolveExportDeclaration(node as ts.ExportDeclaration);
        } else if (node.kind === ts.SyntaxKind.Identifier) {
            this.resolveIdentifier(node as ts.Identifier);
        }
        ts.forEachChild(node, (child) => this.resolveNode(child));
    }

    private resolveIdentifier(node: ts.Identifier) {
        console.log('resolveExpression:', node);
        if (this.structed && node.escapedText && this.currentResult.name) {
            this.currentResult.componentName = node.escapedText as string;
            this.currentResult.filePath = this.filePath;
            this.structed = false;
            console.log('currentResult:', this.currentResult);
            this.results.push(this.currentResult);
            return;
        }

        if (node.escapedText == 'struct') {
            this.structed = true;
        }
    }

    private resolveImportDeclaration(node: ts.ImportDeclaration) {
        const key: string[] = []
        if (node.importClause?.namedBindings == undefined && node.importClause?.name != undefined) {
            // import MyModule from './MyModule';
            if (ts.isIdentifier(node.importClause.name)) {
                key.push(node.importClause.name.escapedText ?? "")
            }
        } else {
            node.importClause?.namedBindings?.forEachChild(child => {
                if (ts.isImportSpecifier(child)) {
                    // import { ExportedItem1, ExportedItem2 } from './MyModule';
                    // import { ExportedItem as RenamedItem } from './MyModule';
                    if (ts.isIdentifier(child.name)) {
                        key.push(child.name.escapedText ?? "")
                    }
                } else if (ts.isNamespaceImport(child)) {
                    // import * as MyModule from './MyModule';
                    const node = child as ts.NamespaceImport
                    if (ts.isIdentifier(node.name)) {
                        key.push(node.name.escapedText ?? "")
                    }
                }

            });
        }
        console.log("resolveImportDeclaration moduleSpecifier: ", node.moduleSpecifier.kind, key)
        if (ts.isStringLiteral(node.moduleSpecifier)) {
            if (key.length > 0) {
                this.importedFiles.set(key, node.moduleSpecifier.text)
            }
        }
        const mapArr = [...this.importedFiles]
        mapArr.forEach(([k, v]) => {
            console.log(`resolveImportDeclaration importedFiles k-v: ${k} : ${v}`)
        })
    }

    private resolveExportDeclaration(node: ts.ExportDeclaration) {
        if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;

        const modulePath = node.moduleSpecifier.text;
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            node.exportClause.elements.forEach((element) => {
                const name = element.propertyName?.text || element.name.text;
                this.exportedRedirects.set(name, modulePath);
            });
        }

        console.log('resolveExportDeclaration:', this.exportedRedirects);
        if (this.fileParam && this.fileParam.indexed && this.exportedRedirects.has(this.fileParam.className)) {
            this.fileParam.absolutePath = resolve(this.modulePath, modulePath);
            console.log('resolveExportDeclaration fileParam:', this.fileParam);
        }
    }

    private parseDecorator(decorator: ts.Decorator): boolean {
        const expression = decorator.expression;
        if (!ts.isCallExpression(expression)) return false;

        const identifier = expression.expression;
        if (!ts.isIdentifier(identifier) || !appRouterAnnotation.annotations.includes(identifier.text)) return false;

        if (expression.arguments.length === 0) return false;
        const arg = expression.arguments[0];
        return this.parseAppRouterArgs(arg);
    }

    private resolveClassDeclaration(node: ts.ClassDeclaration) {
        this.currentResult = new AnalyzeResult();
        this.currentResult.componentName = node.name?.escapedText as string;
        this.currentResult.filePath = this.filePath;
        console.log('resolveClassDeclaration:', node.name?.escapedText);

        if (this.fileParam && node.name?.escapedText == this.fileParam.className) {
            node?.members?.forEach((member) => {
                if (ts.isPropertyDeclaration(member) && member.name
                    && ts.isIdentifier(member.name)) {
                    if (member.name.escapedText
                        == this.fileParam?.attrName && member.initializer && ts.isStringLiteral(member.initializer)) {
                        this.fileParam.attValue = member.initializer.text
                    }
                }
            })
        }
    }

    private parseAppRouterArgs(arg: ts.Expression): boolean {
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
                        this.currentResult.name = value as string;
                        break;
                    case appRouterAnnotation.login:
                        this.currentResult.login = value as boolean;
                        break;
                    case appRouterAnnotation.hasParam:
                        this.currentResult.hasParam = value as boolean;
                        break;
                    case appRouterAnnotation.paramName:
                        this.currentResult.paramName = value as string;
                        break;
                }
            }
        });
        return (this.currentResult.name?.length || 0) > 0;
    }


    private resolveImportedConstant(identifier: string): string | undefined {
        let path: string | undefined = undefined;
        for (const [key, value] of this.importedFiles) {
            if (key.includes(identifier)) {
                path = value;
            }
        }
        if (!path) return undefined;
        console.log('resolveImportedConstant path:', path);

        let absolutePath = resolve(this.modulePath, path);
        if (!absolutePath) return undefined;
        absolutePath = absolutePath.endsWith('.ets') ? absolutePath : (absolutePath + '.ets');
        console.log('resolveImportedConstant absolutePath:', absolutePath);

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
            console.error(`Failed to resolve imported constant ${identifier} in ${absolutePath}:`, e);
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

        for (const [key, value] of this.importedFiles) {
            if (key.includes(fileParam.className)) {
                fileParam.importPath = value
                fileParam.absolutePath = this.getImportAbsolutePathByOHPackage(value, fileParam);
            }
        }

        console.log('resolveConstant:', fileParam);
        console.log('importedFiles:', this.importedFiles);

        if (fileParam.importPath.length > 0 && fileParam.absolutePath.length > 0) {
            const parser = new DecoratorParser(this.modulePath, fileParam.absolutePath, fileParam);
            const results = parser.parse();
            console.log('resolveConstant results:', fileParam);
        }

        return fileParam.attValue;
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
        console.log('getImportAbsolutePathByOHPackage:', packageName);
        if (packageName.startsWith('.')) {
            const path = resolve(this.modulePath, packageName);
            return path.endsWith('.ets') ? path : (path + '.ets');
        }

        const packagePath = `${this.modulePath}/oh-package.json5`;
        console.log('getImportAbsolutePathByOHPackage packagePath:', packagePath);
        if (!fs.existsSync(packagePath)) {
            return "";
        }
        const data = fs.readFileSync(packagePath, { encoding: "utf8" })
        const json = JSON5.parse(data)
        console.log('getImportAbsolutePathByOHPackage json:', json);
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
        console.log('getImportAbsolutePathByOHPackage index results:', newfileParam);
        if (newfileParam.absolutePath.length > 0) {
            return newfileParam.absolutePath.endsWith('.ets') ? newfileParam.absolutePath : (newfileParam.absolutePath + '.ets');
        }
        return "";
    }
}