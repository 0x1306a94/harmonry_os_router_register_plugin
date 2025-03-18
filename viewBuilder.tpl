// auto-generated

import { RouterRegister } from '{{libName}}'

{{#each routers}}
import { {{view.componentName}} } from '{{view.importPath}}'
{{/each}}

{{#each routers}}

@Builder
{{#if view.hasParam}}
export function {{view.buildFunction}}(name: string, param: ESObject) {
{{else}}
export function {{view.buildFunction}}(name: string) {
{{/if}}
  {{#if view.hasParam}}
    {{#if view.paramName}}
    {{view.componentName}}({ {{view.paramName}}: param });
    {{else}}
    {{view.componentName}}({routeParams: param});
    {{/if}}
  {{else}}
    {{view.componentName}}();
  {{/if}}
}
{{/each}}

export function {{moduleName}}RegisterAllRouters() {
  {{#each routers}}
    {{#if view.hasParam}}
    RouterRegister.registerBuilder("{{router.name}}", wrapBuilder({{view.buildFunction}}) as WrappedBuilder<[ESObject]>);
    {{else}}
    RouterRegister.registerBuilder("{{router.name}}", wrapBuilder({{view.buildFunction}}) as WrappedBuilder<[]>);
    {{/if}}
  {{/each}}
}