import * as ts from 'typescript';
import { readFileSync } from 'fs';
import { AnalyzeResult, appRouterAnnotation } from './types';
import { resolve, dirname } from 'path';

export class DecoratorParser {
    private filePath: string;
    private results: AnalyzeResult[] = [];
    private importedFiles: Map<string, string> = new Map();
    private exportedRedirects: Map<string, string> = new Map();
    private currentResult: AnalyzeResult = new AnalyzeResult();

    constructor(filePath: string) {
        this.filePath = filePath;
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
        if (ts.isClassDeclaration(node)) {
            this.resolveClassDeclaration(node);
        } else if (node.kind === ts.SyntaxKind.Decorator) {
            const success = this.parseDecorator(node as ts.Decorator);
            if (success) {
                console.log('currentResult:', this.currentResult);
                this.results.push(this.currentResult);
            }
        } else if (node.kind === ts.SyntaxKind.ImportDeclaration) {
            this.resolveImportDeclaration(node as ts.ImportDeclaration);
        } else if (node.kind === ts.SyntaxKind.ExportDeclaration) {
            this.resolveExportDeclaration(node as ts.ExportDeclaration);
        }

        ts.forEachChild(node, (child) => this.resolveNode(child));
    }

    private resolveImportDeclaration(node: ts.ImportDeclaration) {
        if (!ts.isStringLiteral(node.moduleSpecifier)) return;

        const modulePath = node.moduleSpecifier.text;
        const importClause = node.importClause;

        if (!importClause) return;

        if (importClause.name) {
            this.importedFiles.set(importClause.name.text, modulePath);
        } else if (importClause.namedBindings) {
            if (ts.isNamedImports(importClause.namedBindings)) {
                importClause.namedBindings.elements.forEach((element) => {
                    const name = element.propertyName?.text || element.name.text;
                    this.importedFiles.set(name, modulePath);
                });
            } else if (ts.isNamespaceImport(importClause.namedBindings)) {
                this.importedFiles.set(importClause.namedBindings.name.text, modulePath);
            }
        }
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
    }

    private parseAppRouterArgs(arg: ts.Expression): boolean {
        if (!ts.isObjectLiteralExpression(arg)) return false;
        arg.properties.forEach((prop) => {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                const propName = prop.name.text;
                let value: string | boolean | undefined;

                if (propName === appRouterAnnotation.name) {
                    if (ts.isIdentifier(prop.initializer) && this.importedFiles.has(prop.initializer.text)) {
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
        const modulePath = this.importedFiles.get(identifier);
        if (!modulePath) return undefined;

        const absolutePath = this.resolveModulePath(modulePath);
        if (!absolutePath) return undefined;

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

    private resolveConstant(expr: ts.PropertyAccessExpression): string | undefined {
        const symbolName = ts.isIdentifier(expr.expression) ? expr.expression.text : undefined;
        const propertyName = expr.name.text;

        if (!symbolName) return undefined;

        let modulePath = this.importedFiles.get(symbolName);
        if (!modulePath) return undefined;

        let absolutePath = this.resolveModulePath(modulePath);
        if (!absolutePath) return undefined;

        try {
            let targetCode = readFileSync(absolutePath, 'utf-8');
            let targetFile = ts.createSourceFile(
                absolutePath,
                targetCode,
                ts.ScriptTarget.ES2021,
                false
            );

            let constantValue: string | undefined;
            let redirectModulePath: string | undefined;

            ts.forEachChild(targetFile, (node) => {
                if (ts.isExportDeclaration(node)) {
                    if (
                        node.moduleSpecifier &&
                        ts.isStringLiteral(node.moduleSpecifier) &&
                        node.exportClause &&
                        ts.isNamedExports(node.exportClause)
                    ) {
                        node.exportClause.elements.forEach((element) => {
                            if (element.name.text === symbolName && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                                redirectModulePath = node.moduleSpecifier.text;
                            }
                        });
                    }
                } else if (ts.isClassDeclaration(node)) {
                    node.members.forEach((member) => {
                        if (
                            ts.isPropertyDeclaration(member) &&
                            ts.isIdentifier(member.name) &&
                            member.name.text === propertyName &&
                            member.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword) &&
                            member.initializer
                        ) {
                            constantValue = this.getLiteralValue(member.initializer) as string;
                        }
                    });
                } else if (ts.isVariableStatement(node)) {
                    node.declarationList.declarations.forEach((decl) => {
                        if (ts.isIdentifier(decl.name) && decl.name.text === propertyName && decl.initializer) {
                            constantValue = this.getLiteralValue(decl.initializer) as string;
                        }
                    });
                }
            });

            if (redirectModulePath && !constantValue) {
                const redirectAbsolutePath = this.resolveModulePath(redirectModulePath);
                if (redirectAbsolutePath) {
                    const redirectCode = readFileSync(redirectAbsolutePath, 'utf-8');
                    const redirectFile = ts.createSourceFile(
                        redirectAbsolutePath,
                        redirectCode,
                        ts.ScriptTarget.ES2021,
                        false
                    );

                    ts.forEachChild(redirectFile, (node) => {
                        if (ts.isClassDeclaration(node)) {
                            node.members.forEach((member) => {
                                if (
                                    ts.isPropertyDeclaration(member) &&
                                    ts.isIdentifier(member.name) &&
                                    member.name.text === propertyName &&
                                    member.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword) &&
                                    member.initializer
                                ) {
                                    constantValue = this.getLiteralValue(member.initializer) as string;
                                }
                            });
                        } else if (ts.isVariableStatement(node)) {
                            node.declarationList.declarations.forEach((decl) => {
                                if (ts.isIdentifier(decl.name) && decl.name.text === propertyName && decl.initializer) {
                                    constantValue = this.getLiteralValue(decl.initializer) as string;
                                }
                            });
                        }
                    });
                }
            }

            return constantValue;
        } catch (e) {
            console.error(`Failed to resolve constant ${symbolName}.${propertyName} in ${absolutePath}:`, e);
            return undefined;
        }
    }

    private resolveModulePath(modulePath: string): string | undefined {
        const baseDir = dirname(this.filePath);
        let resolvedPath: string;

        if (modulePath.startsWith('.')) {
            resolvedPath = resolve(baseDir, modulePath);
        } else {
            try {
                resolvedPath = require.resolve(modulePath, { paths: [baseDir] });
            } catch (e) {
                console.error(`Failed to resolve module ${modulePath} from ${baseDir}:`, e);
                return undefined;
            }
        }

        const extensions = ['.ts', '.ets', '.js'];
        for (const ext of extensions) {
            const candidatePath = resolvedPath.endsWith(ext) ? resolvedPath : `${resolvedPath}${ext}`;
            try {
                readFileSync(candidatePath, 'utf-8');
                return candidatePath;
            } catch (e) { }
        }

        console.error(`No valid file found for ${resolvedPath} with extensions ${extensions.join(', ')}`);
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
}