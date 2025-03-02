// src/types.ts
export class AppRouterAnnotation {
    annotations: string[] = ['AppRouter'];
    name: string = 'name';
    login: string = 'login';
    hasParam: string = 'hasParam';
    paramName: string = 'paramName';
}

const appRouterAnnotation = new AppRouterAnnotation();
export { appRouterAnnotation };

export class AnalyzeResult {
    name!: string;
    componentName!: string;
    filePath!: string;
    login: boolean = false;
    hasParam: boolean = false;
    paramName: string = 'routerParam';
}
